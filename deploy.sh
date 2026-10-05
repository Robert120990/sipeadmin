#!/bin/bash
set -e

echo "=== [$(date)] Iniciando despliegue de SIPE Admin ==="

# 0. Configurar PATH completo y entorno para Node, pnpm y PM2
export HOME="${HOME:-/home/sistemas}"
export PATH="$HOME/.nvm/versions/node/$(node -v 2>/dev/null)/bin:$HOME/.local/share/pnpm:$HOME/.pnpm-global/bin:$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
[ -f "$HOME/.profile" ] && source "$HOME/.profile" 2>/dev/null || true
[ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc" 2>/dev/null || true

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo ">> 1. Actualizando código desde git..."
git fetch origin main
git reset --hard origin/main

echo ">> 2. Instalando dependencias con pnpm..."
pnpm install

echo ">> 3. Compilando frontend SPA para producción..."
pnpm --filter frontend run build

echo ">> 4. Reiniciando backend..."
# Detectar binario de PM2
PM2_BIN="$(command -v pm2 || command -v npx pm2 || which pm2 || echo "")"
if [ -z "$PM2_BIN" ] && [ -x "$HOME/.local/share/pnpm/pm2" ]; then
    PM2_BIN="$HOME/.local/share/pnpm/pm2"
fi
if [ -z "$PM2_BIN" ] && [ -x "/usr/local/bin/pm2" ]; then
    PM2_BIN="/usr/local/bin/pm2"
fi

echo "Binario PM2 detectado: ${PM2_BIN:-ninguno}"

# Intentar reinicio vía PM2
if [ -n "$PM2_BIN" ]; then
    $PM2_BIN restart sipeadmin-backend --update-env 2>/dev/null || \
    $PM2_BIN restart backend --update-env 2>/dev/null || \
    $PM2_BIN restart 0 --update-env 2>/dev/null || \
    $PM2_BIN restart all --update-env 2>/dev/null || \
    $PM2_BIN startOrRestart ecosystem.config.cjs --update-env 2>/dev/null || true
    $PM2_BIN save 2>/dev/null || true
fi

# Fallback seguro: Terminar el proceso Node en puerto 5001 para que el supervisor PM2 lo reviva de inmediato con el nuevo código
BACKEND_PID=$(lsof -t -i:5001 2>/dev/null || ss -lptn 'sport = :5001' 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 || fuser 5001/tcp 2>/dev/null || true)
if [ -n "$BACKEND_PID" ]; then
    echo "Reiniciando proceso backend en puerto 5001 (PID: $BACKEND_PID)..."
    kill -15 $BACKEND_PID 2>/dev/null || kill -9 $BACKEND_PID 2>/dev/null || true
fi

echo ">> 5. Recargando Caddy (si está disponible)..."
caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || true

# Diagnóstico de despliegue accesible vía web
cat << EOF > frontend/dist/deploy-debug.txt
Despliegue: $(date)
Usuario: $(whoami)
Directorio: $PROJECT_DIR
PATH: $PATH
PM2_BIN: $PM2_BIN
PID Terminado: $BACKEND_PID
EOF

if [ -n "$PM2_BIN" ]; then
    $PM2_BIN list >> frontend/dist/deploy-debug.txt 2>&1 || true
fi

echo "=== [$(date)] Despliegue completado con éxito ==="

