#!/bin/sh
# OpenShoot container entrypoint.
#
#   web      (default) wait for the DB → migrate + seed → `node server.js` (Next standalone, /app)
#   worker   wait for the DB → job worker loop (`pnpm worker` command, /tools)
#   migrate  wait for the DB → migrate + seed, then exit (one-off / init container)
#   <other>  executed as-is, e.g. `docker run --rm -it openshoot sh`
#
# migrate / seed / worker run the exact commands of the package.json scripts `db:migrate`,
# `db:seed` and `worker` (from /tools), so the image behaves like `pnpm <script>` in dev.
#
# Knobs (env):
#   MIGRATE_ON_START  run migrations before starting (default: true for web, false for worker)
#   SEED_ON_START     run the idempotent seed after migrating (default: same as MIGRATE_ON_START)
#   DB_WAIT_TIMEOUT   seconds to wait for Postgres (default: 60)
#   LOOPBACK_FORWARD  "port:host:port[,…]" loopback TCP forwards (docker-compose S3 wiring)
set -eu

TOOLS_DIR=/tools
APP_DIR=/app

log() { printf '[entrypoint] %s\n' "$*" >&2; }

role="${1:-web}"

case "$role" in
  web | worker | migrate) ;;
  *) exec "$@" ;;
esac

# Lets the HEALTHCHECK know whether this container serves HTTP.
printf '%s\n' "$role" > /tmp/openshoot-role

# The command of a package.json script, e.g. "tsx --import ./scripts/preload/… scripts/worker.ts".
script_command() {
  cmd=$(node -p "require('$TOOLS_DIR/package.json').scripts['$1'] ?? ''")
  if [ -z "$cmd" ]; then
    log "package.json has no \"$1\" script"
    exit 1
  fi
  printf '%s' "$cmd"
}

run_script() {
  cmd=$(script_command "$1")
  (cd "$TOOLS_DIR" && PATH="$TOOLS_DIR/node_modules/.bin:$PATH" sh -c "exec $cmd")
}

start_loopback_forwards() {
  if [ -n "${LOOPBACK_FORWARD:-}" ]; then
    log "forwarding loopback ports: ${LOOPBACK_FORWARD}"
    node "$TOOLS_DIR/docker/loopback-forward.mjs" &
  fi
}

prepare_database() {
  migrate="${MIGRATE_ON_START:-$1}"
  seed="${SEED_ON_START:-$migrate}"
  node "$TOOLS_DIR/docker/wait-for-db.mjs"
  if [ "$migrate" = "true" ]; then run_script db:migrate; fi
  if [ "$seed" = "true" ]; then run_script db:seed; fi
}

case "$role" in
  web)
    start_loopback_forwards
    prepare_database true
    cd "$APP_DIR"
    # Next standalone binds to $HOSTNAME, which Docker sets to the container id.
    export HOSTNAME=0.0.0.0
    export PORT="${PORT:-3000}"
    log "starting web server on :${PORT}"
    exec node server.js
    ;;
  worker)
    start_loopback_forwards
    prepare_database false
    cmd=$(script_command worker)
    cd "$TOOLS_DIR"
    export PATH="$TOOLS_DIR/node_modules/.bin:$PATH"
    log "starting job worker"
    exec sh -c "exec $cmd"
    ;;
  migrate)
    MIGRATE_ON_START=true
    prepare_database true
    log "database is migrated"
    ;;
esac
