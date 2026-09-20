#!/bin/bash
set -e

echo "=== [$(date)] Iniciando despliegue de SIPE Admin ==="

PROJECT_DIR="/opt/sipeadmin"
cd "$PROJECT_DIR"

echo ">> 1. Actualizando código desde git..."
git fetch origin main
git reset --hard origin/main

echo ">> 2. Instalando dependencias con pnpm..."
pnpm install

echo ">> 3. Compilando frontend SPA para producción..."
pnpm --filter frontend run build

echo ">> 4. Reiniciando backend en PM2..."
pm2 reload ecosystem.config.cjs || pm2 start ecosystem.config.cjs
pm2 save

echo ">> 5. Recargando Caddy..."
caddy reload --config /etc/caddy/Caddyfile

echo "=== [$(date)] Despliegue completado con éxito ==="
