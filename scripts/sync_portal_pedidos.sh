#!/usr/bin/env bash
# ==============================================================================
# SIPE Admin - Sincronización Remota Automática de Pedidos y Precios
# Servidor Orquestador: 169.58.207.115 (Usuario: rsboosted)
# Servidor Destino Producción: admin.sipesv.com (5.252.55.29)
# ==============================================================================

TASK_DIR="/home/rsboosted/sipe-tasks"
LOG_FILE="$TASK_DIR/sync_portal.log"
LOCK_FILE="/tmp/sipe_sync_portal.lock"
API_URL="https://admin.sipesv.com/api/operaciones/portal/auto-sync-remote"
API_KEY="sipe_orchestrator_2026_secure_token"

# Evitar traslape de ejecuciones concurrentes
if [ -f "$LOCK_FILE" ]; then
    PID=$(cat "$LOCK_FILE" 2>/dev/null || true)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARN] Ciclo previo aún en ejecución (PID: $PID). Omitiendo ciclo actual." >> "$LOG_FILE"
        exit 0
    fi
fi

echo "$$" > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

echo "[$(date '+%Y-%m-%d %H:%M:%S')] [START] 🚀 Disparando sincronización unificada hacia admin.sipesv.com..." >> "$LOG_FILE"

START_TIME=$(date +%s)
HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 180 -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "x-api-key: $API_KEY" \
    -d "{\"source\": \"CRON_169.58.207.115\", \"triggered_at\": \"$(date -Iseconds)\"}")

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')
HTTP_STATUS=$(echo "$HTTP_RESPONSE" | tail -n 1)

if [ "$HTTP_STATUS" -eq 200 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] ✅ Sincronización completada en ${ELAPSED}s (HTTP $HTTP_STATUS): $HTTP_BODY" >> "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] ❌ Fallo en sincronización (HTTP $HTTP_STATUS en ${ELAPSED}s): $HTTP_BODY" >> "$LOG_FILE"
fi

# Mantener log acotado
if [ -f "$LOG_FILE" ] && [ $(wc -l < "$LOG_FILE") -gt 5000 ]; then
    tail -n 2500 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi
