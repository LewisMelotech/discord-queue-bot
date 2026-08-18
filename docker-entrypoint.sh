#!/bin/sh
set -e

# /app/data is usually a bind mount whose ownership comes from the host,
# not from the image's build-time chown. Fix it up here, every start,
# before dropping from root to the unprivileged "bot" user, so it works
# regardless of what owns the host-side directory.
chown -R bot:bot /app/data

exec su-exec bot "$@"
