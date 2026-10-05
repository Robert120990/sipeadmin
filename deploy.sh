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

DEBUG_FILE="$PROJECT_DIR/frontend/dist/deploy-debug.txt"
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
# Desactivar set -e para que las alternativas de reinicio se ejecuten sin abortar
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
    
    echo "--- Ejecutando reinicio en PM2 ---" >> "$DEBUG_FILE"
    $PM2_BIN restart sipeadmin-backend --update-env >> "$DEBUG_FILE" 2>&1 || \
    $PM2_BIN restart backend --update-env >> "$DEBUG_FILE" 2>&1 || \
    $PM2_BIN restart 0 --update-env >> "$DEBUG_FILE" 2>&1 || \
    $PM2_BIN restart all --update-env >> "$DEBUG_FILE" 2>&1 || \
    $PM2_BIN startOrRestart "$PROJECT_DIR/ecosystem.config.cjs" --update-env >> "$DEBUG_FILE" 2>&1 || true
    
    $PM2_BIN save >> "$DEBUG_FILE" 2>&1 || true
fi

# Fallback robusto: Terminar el proceso Node de server.js para que PM2 supervisor lo reviva automáticamente
echo "--- Verificando procesos escuchando en puerto 5001 ---" >> "$DEBUG_FILE"
PORT_PIDS=$(lsof -t -i:5001 2>/dev/null || ss -lptn 'sport = :5001' 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 || fuser 5001/tcp 2>/dev/null || true)
echo "PIDs puerto 5001: $PORT_PIDS" >> "$DEBUG_FILE"

for pid in $PORT_PIDS; do
    if [ -n "$pid" ] && [ "$pid" -gt 1 ] 2>/dev/null; then
        echo "Terminando PID de puerto 5001: $pid" >> "$DEBUG_FILE"
        kill -15 "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
    fi
done

# Buscar cualquier proceso Node corriendo server.js (excluyendo webhook-server.js)
echo "--- Verificando procesos server.js ---" >> "$DEBUG_FILE"
SERVER_PIDS=$(pgrep -f "server.js" 2>/dev/null || true)
echo "PIDs server.js encontrados: $SERVER_PIDS" >> "$DEBUG_FILE"
for pid in $SERVER_PIDS; do
    CMD_LINE=$(ps -p "$pid" -o args= 2>/dev/null || true)
    if [[ "$CMD_LINE" == *"server.js"* ]] && [[ "$CMD_LINE" != *"webhook"* ]]; then
        echo "Terminando server.js PID $pid ($CMD_LINE)..." >> "$DEBUG_FILE"
        kill -15 "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
    fi
done

echo ">> 5. Recargando Caddy (si está disponible)..."
caddy reload --config /etc/caddy/Caddyfile >> "$DEBUG_FILE" 2>&1 || true

echo "Fecha fin: $(date)" >> "$DEBUG_FILE"
echo "=== Despliegue completado con éxito ===" >> "$DEBUG_FILE"

# Copiar DEBUG_FILE a frontend/dist para disponibilidad web inmediata
cp "$DEBUG_FILE" "$PROJECT_DIR/frontend/dist/deploy-debug.txt" 2>/dev/null || true
cp "$DEBUG_FILE" "$PROJECT_DIR/frontend/public/deploy-debug.txt" 2>/dev/null || true

echo "=== [$(date)] Despliegue completado con éxito ==="


