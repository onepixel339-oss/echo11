#!/bin/bash
# ECHO dev bootstrap — server dies between tool calls, so every verification
# call sources this first. Starts dev server and waits until it responds.
cd /home/z/my-project
if ! curl -s -o /dev/null --max-time 3 http://localhost:3000; then
  setsid nohup bun run dev > /tmp/devsrv.log 2>&1 < /dev/null & disown
  for i in $(seq 1 40); do
    sleep 2
    if curl -s -o /dev/null --max-time 3 http://localhost:3000; then break; fi
  done
fi
curl -s -o /dev/null -w "server:%{http_code}\n" http://localhost:3000 --max-time 8
