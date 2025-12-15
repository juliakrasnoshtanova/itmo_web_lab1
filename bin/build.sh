#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p out
javac -encoding UTF-8 -cp fastcgi-lib.jar -d out $(find src -name "*.java")
echo "Compiled to ./out"

