#!/bin/bash
# Poll live site until the new deployment (Pollinations fallback) goes live
BASE="https://echo-wheat-one.vercel.app"
TARGET='1j7sahjxz0lgf.js'
echo "Waiting for new deployment (old chunk: $TARGET)..."
for i in $(seq 1 24); do
  sleep 30
  CUR=$(curl -s -m 20 "$BASE/" | grep -o 'src="/_next/static/immutable/chunks/[^"]*"' | head -1)
  TS=$(date -u +"%H:%M:%S")
  if [ -z "$CUR" ]; then
    echo "[$TS try=$i] no chunk found (deploy swap in progress?)"
  elif echo "$CUR" | grep -q "$TARGET"; then
    echo "[$TS try=$i] still OLD build ($CUR)"
  else
    echo "[$TS try=$i] NEW BUILD IS LIVE: $CUR"
    exit 0
  fi
done
echo "TIMEOUT after 12 minutes"
exit 1
