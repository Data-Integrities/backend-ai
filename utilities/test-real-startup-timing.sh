#!/bin/bash

echo "=== TESTING REAL AGENT STARTUP TIMING ==="
echo "This will show the actual time from start command to agent ready"
echo ""

# Deploy the new code
echo "1. Deploying updated agent and hub..."
echo "   Deploying agent to nginx..."
scp -r agent/dist root@192.168.1.2:/opt/ai-agent/agent/

echo "   Deploying hub..."
scp -r hub/dist root@192.168.1.30:/opt/backend-ai/hub/

# Restart hub to pick up changes
echo "2. Restarting hub..."
ssh root@192.168.1.30 "systemctl restart ai-hub"
sleep 3

# Monitor hub logs
echo "3. Starting hub log monitor..."
ssh root@192.168.1.30 "journalctl -u ai-hub -f -n 0" > hub-timing.log 2>&1 &
HUB_LOG_PID=$!

# Stop nginx agent
echo "4. Stopping nginx agent..."
curl -s -X POST "http://192.168.1.30/api/agents/nginx/stop" -H "Content-Type: application/json"
sleep 3

# Clear the terminal and show timing
clear
echo "=== REAL STARTUP TIMING TEST ==="
echo ""
echo "5. Starting nginx agent NOW..."
echo "   Watch for:"
echo "   - [HUB] Start command received"
echo "   - [HUB] Manager responded" 
echo "   - === AGENT READY ==="
echo ""
echo "Starting in 3..."
sleep 1
echo "2..."
sleep 1
echo "1..."
sleep 1
echo ""

# Start the agent
START_TIME=$(date +%s.%N)
echo "[TEST] Sending start command at $(date '+%H:%M:%S.%3N')"
curl -s -X POST "http://192.168.1.30/api/agents/nginx/start" -H "Content-Type: application/json"

# Wait a bit for agent to start and report
echo ""
echo "Waiting for agent to fully start and report back..."
sleep 10

# Stop log monitoring
kill $HUB_LOG_PID 2>/dev/null

# Show the hub logs
echo ""
echo "=== HUB LOG OUTPUT ==="
cat hub-timing.log | grep -E '\[HUB\]|AGENT READY|Startup profile' | tail -20

# Clean up
rm -f hub-timing.log

echo ""
echo "=== Test complete ===" 