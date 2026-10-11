#!/usr/bin/env bash
# SH-08 Backup: export every collection of the production database into
# backups/YYYY-MM-DD/<database>/ (one .bson + .metadata.json per collection).
# Usage (from my-react-app/):  bash scripts/db/backup.sh
source "$(dirname "$0")/env.sh"

OUT_DIR="$BACKUP_ROOT/$(date +%F)"
mkdir -p "$OUT_DIR"

echo "Backing up database '$SOURCE_DB' into $OUT_DIR ..."
mongodump --uri "$TOOLS_URI" --db "$SOURCE_DB" --out "$OUT_DIR"

echo
echo "Backup complete: $OUT_DIR/$SOURCE_DB"
ls -lh "$OUT_DIR/$SOURCE_DB"
