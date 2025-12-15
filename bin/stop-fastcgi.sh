#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -f fcgi.pid ]]; then
  kill "$(cat fcgi.pid)" || true
  rm -f fcgi.pid
  echo "FastCGI server stopped"
else
  pkill -f org.example.Main && echo "FastCGI server stopped (pkill)" || echo "No FastCGI process found"
fi

