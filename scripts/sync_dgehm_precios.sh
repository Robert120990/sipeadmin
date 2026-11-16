#!/usr/bin/env bash
# ==============================================================================
# SIPE Admin - Lectura y Envío Remoto de Precios de Competencia DGEHM
# Servidor Lector/Orquestador: 169.58.207.115 (Usuario: rsboosted)
# Servidor Destino Producción: admin.sipesv.com (5.252.55.29)
# ==============================================================================

export PATH="/usr/local/bin:/usr/bin:/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:$PATH"

TASK_DIR="/home/rsboosted/sipe-tasks"
set -a
[ -f "$TASK_DIR/.env" ] && source "$TASK_DIR/.env" 2>/dev/null || true
set +a
LOG_FILE="$TASK_DIR/sync_dgehm.log"
LOCK_FILE="/tmp/sipe_sync_dgehm.lock"
export SYNC_API_KEY="${SYNC_API_KEY:-${PORTAL_SYNC_API_KEY:-sipe_orchestrator_2026_secure_token}}"
export SIPE_ADMIN_URL="${SIPE_ADMIN_URL:-https://admin.sipesv.com}"

# Evitar traslape de ejecuciones concurrentes
if [ -f "$LOCK_FILE" ]; then
    PID=$(cat "$LOCK_FILE" 2>/dev/null || true)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARN] Sincronización DGEHM previa aún en ejecución (PID: $PID). Omitiendo ciclo." >> "$LOG_FILE"
        exit 0
    fi
fi

echo "$$" > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

echo "[$(date '+%Y-%m-%d %H:%M:%S')] [START] 🚀 Leyendo precios DGEHM/SINAPP desde 169.58.207.115 y enviando a admin.sipesv.com..." >> "$LOG_FILE"

START_TIME=$(date +%s)
OUTPUT=$(node "$TASK_DIR/read_and_send_dgehm.js" 2>&1)
EXIT_CODE=$?
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

if [ "$EXIT_CODE" -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] ✅ Precios leídos y enviados en ${ELAPSED}s: $OUTPUT" >> "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] ❌ Fallo leyendo/enviando precios en ${ELAPSED}s: $OUTPUT" >> "$LOG_FILE"
fi

# Mantener log acotado
if [ -f "$LOG_FILE" ] && [ $(wc -l < "$LOG_FILE") -gt 5000 ]; then
    tail -n 2500 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi
