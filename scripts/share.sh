#!/bin/bash
set -ueo pipefail

trap cleanup int exit

function cleanup() {
  if [[ -n "${parcel_pid:-}" ]]; then kill -9 "${parcel_pid:?}"; fi
  if [[ -n "${signal_pid:-}" ]]; then kill -9 "${signal_pid:?}"; fi
  if [[ -n "${ngrok_web_pid:-}" ]]; then kill -9 "${ngrok_web_pid:?}"; fi
  if [[ -n "${ngrok_signal_pid:-}" ]]; then kill -9 "${ngrok_signal_pid:?}"; fi
  rm -rf ngrok*.log
}

rm -rf ngrok*.log

ngrok http 1234 -log ngrok.http.log > /dev/null 2>&1 &
ngrok_web_pid=$!
ngrok http 5000 -log ngrok.signal.log > /dev/null 2>&1 &
ngrok_signal_pid=$!

sleep 4

web_url=$(grep https ngrok.http.log | awk 'match($0, /[a-z0-9]+\.ngrok\.io/) { print substr($0, RSTART, RLENGTH) }')
signal_url=$(grep https ngrok.signal.log | awk 'match($0, /[a-z0-9]+\.ngrok\.io/) { print substr($0, RSTART, RLENGTH) }')

if [[ -z "${web_url:-}" ]] || [[ -z "${signal_url:-}" ]]; then
  tail ngrok.http.log
  tail ngrok.signal.log
  exit 1
fi

export WS_URL=wss://${signal_url:?}
export DEBUG_LOG=true

parcel build src/index.html
serve -s ./dist -p 1234 > /dev/null 2>&1 &
parcel_pid=$!
LOG_PRETTY=true node src/signal.js &
signal_pid=$!

echo -e "\u001b[1m\u001b[37mShare camera here \u001b[1m\u001b[36mhttps://${web_url:?}/new\u001b[39m\u001b[22m"

qrcode -o share.png "https://${web_url:?}/new" > /dev/null 2>&1

xdg-open ./share.png > /dev/null 2>&1

wait
