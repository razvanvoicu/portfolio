#!/bin/sh
set -e

node /backend/src/server.js &

# Cloud Run's readiness probe only watches nginx's port (8080). Node has a
# much heavier module graph (gRPC/Firestore) and can still be starting up
# when nginx would otherwise already be accepting traffic, causing /stats/
# to 502 during cold starts. Wait for it to actually be listening first,
# with a bounded fallback so a genuinely stuck backend can't block the whole
# service from ever serving static content.
i=0
while [ "$i" -lt 15 ]; do
  if wget -q -O /dev/null http://127.0.0.1:8081/stats/healthz 2>/dev/null; then
    break
  fi
  i=$((i + 1))
  sleep 1
done

exec nginx -g "daemon off;"
