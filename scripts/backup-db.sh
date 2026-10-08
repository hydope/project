#!/bin/bash
# ─── ShiaRishta DB backup ─────────────────────────────────────────────────────
# Dumps the MySQL database to a timestamped, gzipped file.
# Run via cron: 0 2 * * * /path/to/backup-db.sh
# Keeps 14 days of backups, deletes older ones.
#
# Required env vars (or edit defaults below):
#   DB_HOST, DB_NAME, DB_USER, DB_PASS, BACKUP_DIR

set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_NAME="${DB_NAME:-shiarishta_app}"
DB_USER="${DB_USER:-shiarishta_appuser}"
DB_PASS="${DB_PASS:-}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/db-backups}"
RETENTION_DAYS=14

if [ -z "$DB_PASS" ]; then
  echo "ERROR: DB_PASS is not set" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
FILE="$BACKUP_DIR/${DB_NAME}-${STAMP}.sql.gz"

echo "[$(date -u +%FT%TZ)] Starting backup to $FILE"
mysqldump \
  --host="$DB_HOST" \
  --user="$DB_USER" \
  --password="$DB_PASS" \
  --single-transaction \
  --routines \
  --triggers \
  "$DB_NAME" | gzip > "$FILE"

SIZE=$(du -h "$FILE" | cut -f1)
echo "[$(date -u +%FT%TZ)] Backup complete: $FILE ($SIZE)"

# Verify the dump is not empty/corrupt.
if ! gzip -t "$FILE"; then
  echo "ERROR: Backup file is corrupt!" >&2
  exit 1
fi

# Prune old backups.
find "$BACKUP_DIR" -name "${DB_NAME}-*.sql.gz" -mtime +$RETENTION_DAYS -delete
COUNT=$(ls "$BACKUP_DIR"/${DB_NAME}-*.sql.gz 2>/dev/null | wc -l)
echo "[$(date -u +%FT%TZ)] Retention: $COUNT backups kept (${RETENTION_DAYS}-day window)"

# ── Restore ──────────────────────────────────────────────────────────────────
# gunzip < backup.sql.gz | mysql --host=$DB_HOST --user=$DB_USER --password=$DB_PASS $DB_NAME
