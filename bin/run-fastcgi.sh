#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
FCGI_PORT="${FCGI_PORT:-16351}"
export FCGI_PORT
nohup java -DportNum="$FCGI_PORT" -DFCGI_PORT="$FCGI_PORT" -cp out:fastcgi-lib.jar org.example.Main > fcgi.log 2>&1 &
echo $! > fcgi.pid
echo "FastCGI server started on 127.0.0.1:${FCGI_PORT} (PID $(cat fcgi.pid))"
