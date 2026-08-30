#!/usr/bin/env bash
# Disposable local MongoDB replica set for the integration test suite.
# LOCAL ONLY. Never point this at production. Data lives under /tmp and is
# wiped by `stop`.
set -euo pipefail

RS_NAME="elexifyIntegrationRs"
PORT="27201"
DATA_DIR="/tmp/elexify-integration-rs-${PORT}"
LOG_FILE="${DATA_DIR}/mongod.log"
PID_FILE="${DATA_DIR}/mongod.pid"

start() {
  if [ -f "${PID_FILE}" ] && kill -0 "$(cat "${PID_FILE}")" 2>/dev/null; then
    echo "Replica set already running (pid $(cat "${PID_FILE}"))."
    exit 0
  fi

  rm -rf "${DATA_DIR}"
  mkdir -p "${DATA_DIR}"

  mongod \
    --replSet "${RS_NAME}" \
    --port "${PORT}" \
    --dbpath "${DATA_DIR}" \
    --bind_ip 127.0.0.1 \
    --fork \
    --logpath "${LOG_FILE}" \
    --quiet

  # mongod --fork writes its own pidfile info into the log, not a pidfile by
  # default; capture it via the port instead so `stop` can find it reliably.
  for _ in $(seq 1 30); do
    if mongosh --quiet --port "${PORT}" --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done

  mongosh --quiet --port "${PORT}" --eval "
    rs.initiate({
      _id: '${RS_NAME}',
      members: [{ _id: 0, host: '127.0.0.1:${PORT}' }]
    })
  "

  for _ in $(seq 1 30); do
    STATE=$(mongosh --quiet --port "${PORT}" --eval "rs.status().myState" 2>/dev/null || echo "")
    if [ "${STATE}" = "1" ]; then
      break
    fi
    sleep 0.5
  done

  lsof -ti tcp:"${PORT}" -sTCP:LISTEN > "${PID_FILE}" || true

  echo "Replica set '${RS_NAME}' ready on port ${PORT}."
  echo "TEST_MONGODB_URI=mongodb://127.0.0.1:${PORT}/elexify_integration?replicaSet=${RS_NAME}"
}

stop() {
  mongosh --quiet --port "${PORT}" --eval "db.adminCommand({shutdown: 1, force: true})" >/dev/null 2>&1 || true
  sleep 1
  if [ -f "${PID_FILE}" ]; then
    xargs -r kill -9 < "${PID_FILE}" 2>/dev/null || true
  fi
  lsof -ti tcp:"${PORT}" -sTCP:LISTEN 2>/dev/null | xargs -r kill -9 || true
  rm -rf "${DATA_DIR}"
  echo "Replica set stopped and disposable data dir removed."
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  *) echo "Usage: $0 {start|stop}"; exit 1 ;;
esac
