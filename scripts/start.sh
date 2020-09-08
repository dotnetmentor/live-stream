#!/bin/bash
set -ueo pipefail

trap cleanup int exit

function cleanup() {
  if [[ -n "${parcel_pid:-}" ]]; then
    kill -9 "${parcel_pid:?}"
  fi
  if [[ -n "${signal_pid:-}" ]]; then
    kill -9 "${signal_pid:?}"
  fi
}

export WS_URL=ws://localhost:5000
export DEBUG_LOG=''

parcel start src/index.html &
parcel_pid=$!
LOG_PRETTY=true node src/signal.js &
signal_pid=$!

echo -e "\u001b[1m\u001b[37mShare camera here \u001b[1m\u001b[36mhttp://localhost:1234/new\u001b[39m\u001b[22m"

wait
