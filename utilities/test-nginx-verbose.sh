#!/bin/bash

echo "=== Testing nginx startup with maximum verbosity ==="
echo ""

# Deploy to nginx
echo "1. Deploying updated agent to nginx..."
scp -r /Users/jeffk/Developement/provider-search/backend-ai/agent/dist root@192.168.1.2:/opt/ai-agent/agent/

# Stop agent
echo "2. Stopping nginx agent..."
curl -s -X POST "http://192.168.1.30/api/agents/nginx/stop" -H "Content-Type: application/json"
sleep 3

# Set verbosity
echo "3. Setting STARTUP_VERBOSITY=3..."
ssh root@192.168.1.2 "cd /opt/ai-agent/agent && echo 'STARTUP_VERBOSITY=3' >> .env"

# Clear existing logs
echo "4. Clearing old logs..."
ssh root@192.168.1.2 "journalctl --rotate && journalctl --vacuum-time=1s"

# Start monitoring logs in background
echo "5. Starting log monitor..."
ssh root@192.168.1.2 "journalctl -u ai-agent -f -n 0" > startup-debug.log 2>&1 &
LOG_PID=$!

# Start agent
echo "6. Starting agent..."
START_TIME=$(date +%s.%N)
echo "   Start time: $(date '+%H:%M:%S.%3N')"
curl -s -X POST "http://192.168.1.30/api/agents/nginx/start" -H "Content-Type: application/json"

# Monitor for agent to come online
echo "7. Monitoring for agent to come online..."
for i in {1..60}; do
    CURRENT_TIME=$(date +%s.%N)
    ELAPSED=$(echo "$CURRENT_TIME - $START_TIME" | bc)
    
    if curl -s -f "http://192.168.1.2:3080/api/status" > /dev/null 2>&1; then
        echo "   Agent online at: $(date '+%H:%M:%S.%3N') (after ${ELAPSED}s)"
        break
    fi
    
    # Show progress every 5 seconds
    if [ $((i % 5)) -eq 0 ]; then
        echo "   Still waiting... ${ELAPSED}s elapsed"
    fi
    
    sleep 1
done

# Stop log monitoring
sleep 2
kill $LOG_PID 2>/dev/null

# Show the startup logs
echo ""
echo "=== STARTUP LOGS ==="
cat startup-debug.log

# Clean up verbosity setting
echo ""
echo "8. Cleaning up..."
ssh root@192.168.1.2 "cd /opt/ai-agent/agent && grep -v STARTUP_VERBOSITY .env > .env.tmp && mv .env.tmp .env"

echo ""
echo "=== Test complete ===" 