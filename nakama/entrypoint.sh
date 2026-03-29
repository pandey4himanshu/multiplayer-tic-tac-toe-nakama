#!/bin/sh
set -eu

DATABASE_ADDRESS="${NAKAMA_DATABASE_ADDRESS:-root@cockroachdb:26257}"
SERVER_KEY="${NAKAMA_SERVER_KEY:-defaultkey}"
SESSION_KEY="${NAKAMA_SESSION_KEY:-defaultencryptionkey}"
REFRESH_KEY="${NAKAMA_REFRESH_KEY:-defaultrefreshencryptionkey}"
HTTP_KEY="${NAKAMA_HTTP_KEY:-defaulthttpkey}"
CONSOLE_USERNAME="${NAKAMA_CONSOLE_USERNAME:-admin}"
CONSOLE_PASSWORD="${NAKAMA_CONSOLE_PASSWORD:-password}"
CONSOLE_SIGNING_KEY="${NAKAMA_CONSOLE_SIGNING_KEY:-defaultsigningkey}"

/nakama/nakama migrate up --database.address "$DATABASE_ADDRESS"

exec /nakama/nakama \
  --name nakama1 \
  --database.address "$DATABASE_ADDRESS" \
  --logger.level INFO \
  --session.token_expiry_sec 7200 \
  --runtime.path /nakama/data/modules \
  --socket.server_key "$SERVER_KEY" \
  --session.encryption_key "$SESSION_KEY" \
  --session.refresh_encryption_key "$REFRESH_KEY" \
  --runtime.http_key "$HTTP_KEY" \
  --console.username "$CONSOLE_USERNAME" \
  --console.password "$CONSOLE_PASSWORD" \
  --console.signing_key "$CONSOLE_SIGNING_KEY"
