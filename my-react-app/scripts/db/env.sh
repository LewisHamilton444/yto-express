# Shared setup for the backup/restore scripts (SH-08). Sourced, not run.
# Loads MONGO_URI from server/.env (never hardcoded, never printed) and works
# out the production database name from it.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVER_DIR="$APP_DIR/server"
BACKUP_ROOT="$APP_DIR/backups"
RESTORE_DB="yto_restore_test"

if ! command -v mongodump >/dev/null || ! command -v mongorestore >/dev/null; then
  echo "MongoDB Database Tools not found. Install them with:"
  echo "  brew tap mongodb/brew && brew install mongodb-database-tools"
  exit 1
fi

# Read MONGO_URI with the same dotenv package the server uses.
MONGO_URI="$(cd "$SERVER_DIR" && node -e "require('dotenv').config({ path: '.env', quiet: true }); process.stdout.write(process.env.MONGO_URI || '')")"
if [ -z "$MONGO_URI" ]; then
  echo "MONGO_URI is not set in server/.env"
  exit 1
fi
export MONGO_URI

# The database named in the URI path (mongodb+srv://.../<name>?...), or
# MongoDB's default "test" when the URI names none.
SOURCE_DB="$(node -e "const p = new URL(process.env.MONGO_URI.replace(/^mongodb(\+srv)?:/, 'http:')).pathname.replace('/', ''); process.stdout.write(p || 'test')")"

# The same address with the database name removed. The tools are told which
# database to use with explicit flags instead; a name left in the URI makes
# mongorestore ignore --nsFrom/--nsTo and skip the backup folder.
TOOLS_URI="$(node -e "process.stdout.write(process.env.MONGO_URI.replace(/^(mongodb(?:\+srv)?:\/\/[^/?]+)\/[^?]*/, '\$1/'))")"

# Safety: the restore target must never be the production database.
if [ "$SOURCE_DB" = "$RESTORE_DB" ]; then
  echo "Refusing to continue: production database and restore target are both '$RESTORE_DB'."
  exit 1
fi
