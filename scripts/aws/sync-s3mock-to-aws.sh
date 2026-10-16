#!/usr/bin/env bash
# Copy objects from local s3mock (docker compose) to an AWS S3 bucket.
set -euo pipefail

: "${S3_BUCKET:?Set S3_BUCKET to your AWS bucket name}"
: "${AWS_REGION:=us-west-2}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORKDIR="${TMPDIR:-/tmp}/vbs-s3mock-export"
MC_ALIAS="${MC_ALIAS:-localmock}"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
: "${S3_ACCESS_KEY:?Set S3_ACCESS_KEY in .env}"
: "${S3_SECRET_KEY:?Set S3_SECRET_KEY in .env}"

if ! command -v mc >/dev/null 2>&1; then
  echo "Install MinIO Client (mc): https://min.io/docs/minio/linux/reference/minio-mc.html" >&2
  exit 1
fi

if ! docker compose -f "$ROOT/docker-compose.yml" ps s3 2>/dev/null | grep -q running; then
  echo "Start local s3mock first: npm run docker:up" >&2
  exit 1
fi

rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"

mc alias set "$MC_ALIAS" http://127.0.0.1:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY" 2>/dev/null || true
mc cp --recursive "${MC_ALIAS}/vbs/" "$WORKDIR/"

export AWS_DEFAULT_REGION="$AWS_REGION"
aws s3 sync "$WORKDIR" "s3://${S3_BUCKET}/" --only-show-errors

echo "Synced local s3mock bucket 'vbs' → s3://${S3_BUCKET}/"
