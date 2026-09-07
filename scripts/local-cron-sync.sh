#!/bin/bash
# Gọi endpoint sync tồn kho Sapo Web mỗi 5 phút (fallback local macOS)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env.local"
LOG_FILE="${HOME}/Library/Logs/sapo-webhook-sync.log"

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source <(grep -E '^SAPO_WEBHOOK_SECRET=' "$ENV_FILE" | sed 's/^/export /')
fi

SECRET="${SAPO_WEBHOOK_SECRET:-f604680fdf364f8b91a0b66b71685704}"
URL="https://sapo-webhook-app.vercel.app/api/cron/sync-inventory"

while true; do
  TS="$(date '+%Y-%m-%d %H:%M:%S')"
  echo "[$TS] Trigger sync..." >> "$LOG_FILE"
  if curl -sfS -X POST \
    -H "Authorization: Bearer ${SECRET}" \
    "$URL" >> "$LOG_FILE" 2>&1; then
    echo "[$TS] OK" >> "$LOG_FILE"
  else
    echo "[$TS] FAILED (exit $?)" >> "$LOG_FILE"
  fi
  sleep 300
done
