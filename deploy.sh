#!/bin/bash

ORIGINAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Auto-copia a /tmp para evitar que 'git reset --hard' modifique este script mientras bash lo ejecuta
if [ "$DEPLOY_IN_TEMP" != "1" ]; then
    TMP_SCRIPT="/tmp/sipeadmin-deploy-$$.sh"
    cp "$0" "$TMP_SCRIPT"
    chmod +x "$TMP_SCRIPT"
    export DEPLOY_IN_TEMP="1"
    export PROJECT_DIR="$ORIGINAL_DIR"
    exec bash "$TMP_SCRIPT" "$@"
fi

trap 'rm -f "/tmp/sipeadmin-deploy-$$.sh"' EXIT

echo "=== [$(date)] Iniciando despliegue de SIPE Admin ==="

# 0. Configurar PATH completo y entorno para Node, pnpm y PM2
export HOME="${HOME:-/home/sistemas}"
export PATH="$HOME/.nvm/versions/node/$(node -v 2>/dev/null)/bin:$HOME/.local/share/pnpm:$HOME/.pnpm-global/bin:$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
[ -f "$HOME/.profile" ] && source "$HOME/.profile" 2>/dev/null || true
[ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc" 2>/dev/null || true

PROJECT_DIR="${PROJECT_DIR:-$ORIGINAL_DIR}"
cd "$PROJECT_DIR"

DEBUG_FILE="/tmp/sipeadmin-deploy-debug.txt"
mkdir -p "$PROJECT_DIR/frontend/dist"
mkdir -p "$PROJECT_DIR/frontend/public"

echo "=== Despliegue SIPE Admin ===" > "$DEBUG_FILE"
echo "Fecha inicio: $(date)" >> "$DEBUG_FILE"
echo "Usuario: $(whoami)" >> "$DEBUG_FILE"
echo "Directorio: $PROJECT_DIR" >> "$DEBUG_FILE"
echo "PATH: $PATH" >> "$DEBUG_FILE"

echo ">> 1. Actualizando código desde git..."
git fetch origin main >> "$DEBUG_FILE" 2>&1
git reset --hard origin/main >> "$DEBUG_FILE" 2>&1
echo "Git HEAD: $(git rev-parse --short HEAD)" >> "$DEBUG_FILE"

echo ">> 2. Instalando dependencias con pnpm..."
pnpm install >> "$DEBUG_FILE" 2>&1 || true

echo ">> 3. Compilando frontend SPA para producción..."
pnpm --filter frontend run build >> "$DEBUG_FILE" 2>&1

echo ">> 4. Reiniciando backend..."
set +e

# Detectar binario de PM2
PM2_BIN=""
for cand in "pm2" \
            "/home/sistemas/.local/share/pnpm/pm2" \
            "/home/sistemas/.nvm/versions/node/$(node -v 2>/dev/null)/bin/pm2" \
            "/usr/local/bin/pm2" \
            "/usr/bin/pm2" \
            "$HOME/.local/share/pnpm/pm2"; do
    if command -v "$cand" >/dev/null 2>&1 || [ -x "$cand" ]; then
        PM2_BIN="$cand"
        break
    fi
done

echo "PM2 detectado: ${PM2_BIN:-ninguno}" >> "$DEBUG_FILE"

if [ -n "$PM2_BIN" ]; then
    echo "--- PM2 List antes de reiniciar ---" >> "$DEBUG_FILE"
    $PM2_BIN list >> "$DEBUG_FILE" 2>&1 || true
    if command -v sudo >/dev/null 2>&1; then
        sudo -n "$PM2_BIN" list >> "$DEBUG_FILE" 2>&1 || true
    fi
    
    echo "--- Ejecutando reinicio/inicio de sipeadmin-backend (exclusivo) ---" >> "$DEBUG_FILE"
    $PM2_BIN startOrRestart "$PROJECT_DIR/ecosystem.config.cjs" --only sipeadmin-backend --update-env >> "$DEBUG_FILE" 2>&1 || \
    $PM2_BIN restart sipeadmin-backend --update-env >> "$DEBUG_FILE" 2>&1 || true

    if command -v sudo >/dev/null 2>&1; then
        sudo -n "$PM2_BIN" startOrRestart "$PROJECT_DIR/ecosystem.config.cjs" --only sipeadmin-backend --update-env >> "$DEBUG_FILE" 2>&1 || \
        sudo -n "$PM2_BIN" restart sipeadmin-backend --update-env >> "$DEBUG_FILE" 2>&1 || true
    fi
    
    $PM2_BIN save >> "$DEBUG_FILE" 2>&1 || true
    if command -v sudo >/dev/null 2>&1; then
        sudo -n "$PM2_BIN" save >> "$DEBUG_FILE" 2>&1 || true
    fi
fi

# Esperar a que el backend inicialice
sleep 3

# Verificación de salud y respuesta de endpoints
echo "--- Verificando respuesta del backend en puerto 5001 ---" >> "$DEBUG_FILE"
SYSTEM_USERS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5001/api/telegram/system-users 2>/dev/null || true)
echo "HTTP telegram/system-users inicial: $SYSTEM_USERS_STATUS (401 o 200 esperado)" >> "$DEBUG_FILE"

# Si devuelve 404 (código viejo) o no responde (000 o vacío), liberar puerto 5001 y reiniciar limpio
if [ "$SYSTEM_USERS_STATUS" = "404" ] || [ "$SYSTEM_USERS_STATUS" = "000" ] || [ -z "$SYSTEM_USERS_STATUS" ]; then
    echo "ATENCIÓN: Backend devolvió $SYSTEM_USERS_STATUS. Forzando terminación de procesos en puerto 5001..." >> "$DEBUG_FILE"
    PORT_PIDS=$(lsof -t -i:5001 -sTCP:LISTEN 2>/dev/null || ss -lptn 'sport = :5001' 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 || true)
    if [ -z "$PORT_PIDS" ] && command -v sudo >/dev/null 2>&1; then
        PORT_PIDS=$(sudo -n lsof -t -i:5001 -sTCP:LISTEN 2>/dev/null || sudo -n ss -lptn 'sport = :5001' 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 || true)
    fi
    echo "PIDs puerto 5001: $PORT_PIDS" >> "$DEBUG_FILE"
    for pid in $PORT_PIDS; do
        if [ -n "$pid" ] && [ "$pid" -gt 1 ] 2>/dev/null; then
            echo "Matando proceso $pid..." >> "$DEBUG_FILE"
            kill -15 "$pid" 2>/dev/null || sudo -n kill -15 "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || sudo -n kill -9 "$pid" 2>/dev/null || true
        fi
    done

    if command -v fuser >/dev/null 2>&1; then
        fuser -k -9 5001/tcp >> "$DEBUG_FILE" 2>&1 || sudo -n fuser -k -9 5001/tcp >> "$DEBUG_FILE" 2>&1 || true
    fi

    sleep 2

    if [ -n "$PM2_BIN" ]; then
        if command -v sudo >/dev/null 2>&1; then
            sudo -n "$PM2_BIN" delete sipeadmin-backend >> "$DEBUG_FILE" 2>&1 || true
            sudo -n "$PM2_BIN" start "$PROJECT_DIR/ecosystem.config.cjs" --only sipeadmin-backend --update-env >> "$DEBUG_FILE" 2>&1 || true
            sudo -n "$PM2_BIN" save >> "$DEBUG_FILE" 2>&1 || true
        fi
        $PM2_BIN delete sipeadmin-backend >> "$DEBUG_FILE" 2>&1 || true
        $PM2_BIN start "$PROJECT_DIR/ecosystem.config.cjs" --only sipeadmin-backend --update-env >> "$DEBUG_FILE" 2>&1 || true
        $PM2_BIN save >> "$DEBUG_FILE" 2>&1 || true
    fi

    sleep 3
    RETRY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5001/api/telegram/system-users 2>/dev/null || true)
    echo "HTTP telegram/system-users tras reinicio limpio: $RETRY_STATUS" >> "$DEBUG_FILE"
fi

echo ">> 5. Verificando estado del proxy Caddy..." >> "$DEBUG_FILE"
if ! systemctl is-active --quiet caddy 2>/dev/null; then
    echo "Caddy no está activo, intentando reiniciar servicio..." >> "$DEBUG_FILE"
    sudo systemctl restart caddy >> "$DEBUG_FILE" 2>&1 || sudo service caddy restart >> "$DEBUG_FILE" 2>&1 || true
fi

echo "Fecha fin: $(date)" >> "$DEBUG_FILE"
echo "=== Despliegue completado con éxito ===" >> "$DEBUG_FILE"

# Copiar DEBUG_FILE a frontend/dist y frontend/public para disponibilidad web inmediata
mkdir -p "$PROJECT_DIR/frontend/dist"
mkdir -p "$PROJECT_DIR/frontend/public"
cp "$DEBUG_FILE" "$PROJECT_DIR/frontend/dist/deploy-debug.txt" 2>/dev/null || true
cp "$DEBUG_FILE" "$PROJECT_DIR/frontend/public/deploy-debug.txt" 2>/dev/null || true

echo "=== [$(date)] Despliegue completado con éxito ==="


