#!/bin/bash

echo "=== SIMPLE TIMING TEST ==="
echo ""

# Stop and start nginx to see timing
echo "1. Stopping nginx..."
curl -s -X POST "http://192.168.1.30/api/agents/nginx/stop" -H "Content-Type: application/json"
sleep 3

echo "2. Starting nginx and monitoring hub logs..."
START_TIME=$(date '+%H:%M:%S.%3N')
echo "   Start time: $START_TIME"

# Start nginx
curl -s -X POST "http://192.168.1.30/api/agents/nginx/start" -H "Content-Type: application/json" &

# Monitor for agent to come online
for i in {1..20}; do
    if curl -s -f "http://192.168.1.2:3080/api/status" > /dev/null 2>&1; then
        END_TIME=$(date '+%H:%M:%S.%3N')
        echo "   Agent online at: $END_TIME"
        echo "   Approximate time: $i seconds"
        break
    fi
    sleep 1
done

echo ""
echo "3. Checking hub logs for detailed timing..."
ssh root@192.168.1.30 "journalctl -u ai-hub --since '30 seconds ago' | grep -E 'nginx|READY|startup' | grep -v 'Event from'" 