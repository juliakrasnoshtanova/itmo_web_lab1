#!/usr/bin/env bash
set -euo pipefail
CONF="$HOME/lab1/httpd-conf-template.conf"
httpd -f "$CONF" -k stop || true
echo "Apache stopped (if running)"

