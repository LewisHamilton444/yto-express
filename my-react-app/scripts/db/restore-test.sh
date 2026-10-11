#!/usr/bin/env bash
# SH-08 Restore test: load a backup into the SEPARATE database
# "yto_restore_test". Production is never written to: every collection is
# renamed from <production>.* to yto_restore_test.* on the way in, and --drop
# only clears yto_restore_test's own collections first.
# Usage (from my-react-app/):  bash scripts/db/restore-test.sh [backups/YYYY-MM-DD]
#   (defaults to the newest backup folder)
source "$(dirname "$0")/env.sh"

BACKUP_DIR="${1:-$(ls -d "$BACKUP_ROOT"/*/ 2>/dev/null | sort | tail -1)}"
BACKUP_DIR="${BACKUP_DIR%/}"
if [ -z "$BACKUP_DIR" ] || [ ! -d "$BACKUP_DIR/$SOURCE_DB" ]; then
  echo "No backup of '$SOURCE_DB' found. Run: bash scripts/db/backup.sh"
  exit 1
fi

echo "Restoring $BACKUP_DIR/$SOURCE_DB into test database '$RESTORE_DB' (production '$SOURCE_DB' is not touched) ..."
mongorestore --uri "$TOOLS_URI" \
  --nsInclude "$SOURCE_DB.*" \
  --nsFrom "$SOURCE_DB.*" --nsTo "$RESTORE_DB.*" \
  --drop \
  "$BACKUP_DIR"

echo
echo "Restore complete. Now run: node scripts/db/verify.mjs"
