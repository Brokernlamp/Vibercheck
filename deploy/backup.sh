#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="${BACKUP_DIR}/vibecheck-${STAMP}.dump"

umask 077
mkdir -p "$BACKUP_DIR"

# Custom format supports selective restore and compresses by default.
docker compose exec -T db sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$TARGET"

sha256sum "$TARGET" > "${TARGET}.sha256"

find "$BACKUP_DIR" -type f \
  \( -name 'vibecheck-*.dump' -o -name 'vibecheck-*.dump.sha256' \) \
  -mtime "+${RETENTION_DAYS}" -delete

echo "Backup written: ${TARGET}"
echo "Verify with: sha256sum -c ${TARGET}.sha256"
