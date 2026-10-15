#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP_DIR="$ROOT/backups"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/vbs-$STAMP.dump"

cd "$ROOT"
if ! docker compose ps postgres 2>/dev/null | grep -q running; then
  echo "Start local Postgres first: npm run docker:up" >&2
  exit 1
fi

docker compose exec -T postgres pg_dump -U vbs -d vbs --no-owner --no-acl -F c >"$OUT"
echo "Wrote $OUT"
echo "Restore example:"
echo "  pg_restore -h YOUR_RDS_HOST -U vbs -d vbs --no-owner --no-acl $OUT"
