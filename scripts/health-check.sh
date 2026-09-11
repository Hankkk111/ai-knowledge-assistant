#!/usr/bin/env bash
#
# health-check.sh — verifies the AI Knowledge Assistant deployment is healthy.
# Checks: HTTP /health endpoint, systemd service status, disk space.
# Exits non-zero on any failure, so it can gate CI/CD or be run from cron.
#
# Usage:
#   ./health-check.sh                          # checks localhost:3000
#   BASE_URL=http://1.2.3.4:3000 ./health-check.sh
#   ./health-check.sh --remote-service          # also checks systemd (run on the host itself, needs sudo)

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
DISK_THRESHOLD_PERCENT=85
SERVICE_NAME="ai-knowledge-assistant"
CHECK_SERVICE=false

for arg in "$@"; do
  if [[ "$arg" == "--remote-service" ]]; then
    CHECK_SERVICE=true
  fi
done

FAILED=0

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

fail() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] FAIL: $1" >&2
  FAILED=1
}

# --- 1. HTTP health check ---
log "Checking ${BASE_URL}/health ..."
HTTP_STATUS=$(curl -s -o /tmp/health_response.json -w "%{http_code}" --max-time 10 "${BASE_URL}/health" || echo "000")

if [[ "$HTTP_STATUS" != "200" ]]; then
  fail "Health endpoint returned HTTP ${HTTP_STATUS} (expected 200)"
else
  STATUS_FIELD=$(grep -o '"status":"[^"]*"' /tmp/health_response.json | cut -d'"' -f4 || echo "")
  if [[ "$STATUS_FIELD" != "ok" ]]; then
    fail "Health endpoint body did not report status=ok (got: $(cat /tmp/health_response.json))"
  else
    log "OK: health endpoint responding normally"
  fi
fi
rm -f /tmp/health_response.json

# --- 2. systemd service check (only meaningful when run on the host) ---
if [[ "$CHECK_SERVICE" == "true" ]]; then
  log "Checking systemd service '${SERVICE_NAME}' ..."
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    log "OK: ${SERVICE_NAME} is active"
  else
    fail "${SERVICE_NAME} is not active (systemctl status: $(systemctl is-active "$SERVICE_NAME" || true))"
  fi
fi

# --- 3. Disk space check (only meaningful when run on the host) ---
if [[ "$CHECK_SERVICE" == "true" ]]; then
  log "Checking disk space on / ..."
  DISK_USAGE=$(df / | awk 'NR==2 {gsub("%","",$5); print $5}')
  if [[ "$DISK_USAGE" -ge "$DISK_THRESHOLD_PERCENT" ]]; then
    fail "Disk usage at ${DISK_USAGE}%, exceeds threshold of ${DISK_THRESHOLD_PERCENT}%"
  else
    log "OK: disk usage at ${DISK_USAGE}%"
  fi
fi

if [[ "$FAILED" -eq 1 ]]; then
  log "One or more checks failed."
  exit 1
fi

log "All checks passed."
exit 0
