#!/bin/sh
# OpenShoot container entrypoint.
#
#   web      (default) wait for the DB → migrate + seed → `node server.js` (Next standalone, /app)
#   worker   wait for the DB → job worker loop (`tsx scripts/worker.ts`, /tools)
#   migrate  wait for the DB → migrate + seed, then exit (one-off / init container)
#   <other>  executed as-is, e.g. `docker run --rm -it openshoot sh`
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

start_loopback_forwards() {
  if [ -n "${LOOPBACK_FORWARD:-}" ]; then
    log "forwarding loopback ports: ${LOOPBACK_FORWARD}"
    node "$TOOLS_DIR/docker/loopback-forward.mjs" &
  fi
}

run_tool() {
  (cd "$TOOLS_DIR" && tsx "scripts/$1")
}

prepare_database() {
  default_migrate="$1"
  migrate="${MIGRATE_ON_START:-$default_migrate}"
  seed="${SEED_ON_START:-$migrate}"
  node "$TOOLS_DIR/docker/wait-for-db.mjs"
  if [ "$migrate" = "true" ]; then run_tool migrate.ts; fi
  if [ "$seed" = "true" ]; then run_tool seed.ts; fi
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
    cd "$TOOLS_DIR"
    log "starting job worker"
    exec tsx scripts/worker.ts
    ;;
  migrate)
    MIGRATE_ON_START=true
    prepare_database true
    log "database is migrated"
    ;;
esac
