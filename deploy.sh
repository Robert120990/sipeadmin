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

mkdir -p "$PROJECT_DIR/logs"
DEBUG_FILE="$PROJECT_DIR/logs/deploy-debug.log"
if ! touch "$DEBUG_FILE" 2>/dev/null; then
    DEBUG_FILE="/tmp/sipeadmin-deploy-$(whoami 2>/dev/null || echo user).log"
fi
mkdir -p "$PROJECT_DIR/frontend/dist"
mkdir -p "$PROJECT_DIR/frontend/public"

echo "=== Despliegue SIPE Admin ===" > "$DEBUG_FILE"
echo "Fecha inicio: $(date)" >> "$DEBUG_FILE"
echo "Usuario: $(whoami)" >> "$DEBUG_FILE"
echo "Directorio: $PROJECT_DIR" >> "$DEBUG_FILE"
echo "PATH: $PATH" >> "$DEBUG_FILE"

echo ">> 1. Actualizando código desde git..."
if ! git fetch origin main >> "$DEBUG_FILE" 2>&1; then
    echo "ERROR: Falló git fetch origin main. Abortando despliegue antes de tocar PM2." | tee -a "$DEBUG_FILE"
    exit 1
fi
if ! git reset --hard origin/main >> "$DEBUG_FILE" 2>&1; then
    echo "ERROR: Falló git reset --hard origin/main. Abortando despliegue antes de tocar PM2." | tee -a "$DEBUG_FILE"
    exit 1
fi
echo "Git HEAD: $(git rev-parse --short HEAD)" >> "$DEBUG_FILE"

echo ">> 2. Instalando dependencias con pnpm..."
if ! pnpm install >> "$DEBUG_FILE" 2>&1; then
    echo "ERROR: Falló pnpm install. Abortando despliegue para preservar instancia activa." | tee -a "$DEBUG_FILE"
    exit 1
fi

echo ">> 3. Compilando frontend SPA para producción..."
if ! pnpm --filter frontend run build >> "$DEBUG_FILE" 2>&1; then
    echo "ERROR: Falló pnpm --filter frontend run build. Abortando despliegue para preservar instancia activa." | tee -a "$DEBUG_FILE"
    exit 1
fi

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
    echo "--- Detención elegante y recreación de sipeadmin-backend ---" >> "$DEBUG_FILE"
    if $PM2_BIN describe sipeadmin-backend >/dev/null 2>&1; then
        $PM2_BIN stop sipeadmin-backend >> "$DEBUG_FILE" 2>&1 || true
        $PM2_BIN delete sipeadmin-backend >> "$DEBUG_FILE" 2>&1 || true
    elif command -v sudo >/dev/null 2>&1 && sudo -n "$PM2_BIN" describe sipeadmin-backend >/dev/null 2>&1; then
        sudo -n "$PM2_BIN" stop sipeadmin-backend >> "$DEBUG_FILE" 2>&1 || true
        sudo -n "$PM2_BIN" delete sipeadmin-backend >> "$DEBUG_FILE" 2>&1 || true
    fi

    # Esperar hasta 10s a que el puerto 5001 se libere de forma elegante tras SIGTERM
    WAIT_PORT=0
    while [ $WAIT_PORT -lt 10 ]; do
        PORT_PIDS=$(lsof -t -i:5001 -sTCP:LISTEN 2>/dev/null || ss -lptn 'sport = :5001' 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 || true)
        if [ -z "$PORT_PIDS" ] && command -v sudo >/dev/null 2>&1; then
            PORT_PIDS=$(sudo -n lsof -t -i:5001 -sTCP:LISTEN 2>/dev/null || sudo -n ss -lptn 'sport = :5001' 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 || true)
        fi
        [ -z "$PORT_PIDS" ] && break
        sleep 1
        WAIT_PORT=$((WAIT_PORT + 1))
    done

    # Escalar a SIGTERM y, solo como último recurso, SIGKILL si quedó algún proceso huérfano en 5001
    if [ -n "$PORT_PIDS" ]; then
        for pid in $PORT_PIDS; do
            if [ -n "$pid" ] && [ "$pid" -gt 1 ] 2>/dev/null; then
                echo "Enviando SIGTERM a proceso remanente en 5001: $pid..." >> "$DEBUG_FILE"
                kill -TERM "$pid" 2>/dev/null || sudo -n kill -TERM "$pid" 2>/dev/null || true
            fi
        done
        sleep 2
        REM_PIDS=$(lsof -t -i:5001 -sTCP:LISTEN 2>/dev/null || ss -lptn 'sport = :5001' 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 || true)
        for pid in $REM_PIDS; do
            if [ -n "$pid" ] && [ "$pid" -gt 1 ] 2>/dev/null; then
                echo "Último recurso SIGKILL a proceso en 5001: $pid..." >> "$DEBUG_FILE"
                kill -9 "$pid" 2>/dev/null || sudo -n kill -9 "$pid" 2>/dev/null || true
            fi
        done
        sleep 1
    fi

    echo "--- Iniciando única instancia de sipeadmin-backend ---" >> "$DEBUG_FILE"
    if ! $PM2_BIN start "$PROJECT_DIR/ecosystem.config.cjs" --only sipeadmin-backend --update-env >> "$DEBUG_FILE" 2>&1; then
        if command -v sudo >/dev/null 2>&1; then
            sudo -n "$PM2_BIN" start "$PROJECT_DIR/ecosystem.config.cjs" --only sipeadmin-backend --update-env >> "$DEBUG_FILE" 2>&1 || true
        fi
    fi

    echo "--- Asegurando sipeadmin-webhook activo en puerto 7778 ---" >> "$DEBUG_FILE"
    if ! $PM2_BIN describe sipeadmin-webhook >/dev/null 2>&1; then
        $PM2_BIN start "$PROJECT_DIR/ecosystem.config.cjs" --only sipeadmin-webhook --update-env >> "$DEBUG_FILE" 2>&1 || true
    fi

    $PM2_BIN save >> "$DEBUG_FILE" 2>&1 || true
fi

# Esperar y verificar salud del backend contra /api/health (hasta 10 intentos x 2s = 20s)
echo "--- Verificando salud del backend en http://127.0.0.1:5001/api/health ---" >> "$DEBUG_FILE"
HEALTH_OK=0
HEALTH_STATUS="000"
ATTEMPT=1
while [ $ATTEMPT -le 10 ]; do
    HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5001/api/health 2>/dev/null || echo "000")
    if [ "$HEALTH_STATUS" = "200" ]; then
        HEALTH_OK=1
        break
    fi
    echo "Intento $ATTEMPT/10: /api/health devolvió HTTP $HEALTH_STATUS; esperando 2s..." >> "$DEBUG_FILE"
    sleep 2
    ATTEMPT=$((ATTEMPT + 1))
done

echo "HTTP /api/health final: $HEALTH_STATUS (ok=$HEALTH_OK)" >> "$DEBUG_FILE"
if [ "$HEALTH_OK" -ne 1 ]; then
    echo "ERROR CRÍTICO: Backend no respondió 200 OK en /api/health después de reiniciar PM2 (último status: $HEALTH_STATUS)." | tee -a "$DEBUG_FILE"
    chmod 600 "$DEBUG_FILE" 2>/dev/null || true
    exit 1
fi

echo ">> 5. Verificando estado del proxy Caddy..." >> "$DEBUG_FILE"
if ! systemctl is-active --quiet caddy 2>/dev/null; then
    echo "Caddy no está activo, intentando reiniciar servicio..." >> "$DEBUG_FILE"
    sudo systemctl restart caddy >> "$DEBUG_FILE" 2>&1 || sudo service caddy restart >> "$DEBUG_FILE" 2>&1 || true
fi

echo "Fecha fin: $(date)" >> "$DEBUG_FILE"
echo "=== Despliegue completado con éxito ===" >> "$DEBUG_FILE"

# Asegurar que el log de despliegue tenga permisos restringidos y no quede expuesto en directorios públicos web
chmod 600 "$DEBUG_FILE" 2>/dev/null || true
rm -f "$PROJECT_DIR/frontend/dist/deploy-debug.txt" "$PROJECT_DIR/frontend/public/deploy-debug.txt" 2>/dev/null || true

echo "=== [$(date)] Despliegue completado con éxito ==="


