#!/bin/bash

echo "=== TESTING REAL START ALL TIMING ==="
echo "This will show actual timing from start commands to all agents ready"
echo ""

# Deploy updated agent to all systems
echo "1. Deploying updated agent to all systems..."
for agent in nginx pve1 pve2 pve3; do
    AGENT_IP=$(grep -A5 "\"$agent\"" hub/agents-config.json | grep '"ip"' | cut -d'"' -f4)
    echo "   Deploying to $agent ($AGENT_IP)..."
    scp -r agent/dist root@$AGENT_IP:/opt/ai-agent/agent/ 2>/dev/null
done

# Deploy to unraid
echo "   Deploying to unraid..."
scp -r agent/dist root@192.168.1.10:/opt/ai-agent/agent/ 2>/dev/null

# Monitor hub logs
echo ""
echo "2. Starting hub log monitor..."
ssh root@192.168.1.30 "journalctl -u ai-hub -f -n 0" > start-all-timing.log 2>&1 &
HUB_LOG_PID=$!

# Stop all agents
echo "3. Stopping all agents..."
for agent in nginx pve1 pve2 pve3 unraid; do
    curl -s -X POST "http://192.168.1.30/api/agents/$agent/stop" -H "Content-Type: application/json" > /dev/null
done
sleep 5

# Clear screen for clean output
clear
echo "=== REAL START ALL TIMING TEST ==="
echo ""
echo "4. Starting ALL agents NOW..."
echo "   Watch for each agent's:"
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

# Record exact start time
START_TIME=$(date +%s.%N)
echo "[TEST] Sending start commands at $(date '+%H:%M:%S.%3N')"

# Start all agents in parallel (like the hub does)
for agent in nginx pve1 pve2 pve3 unraid; do
    echo "  Starting $agent..."
    curl -s -X POST "http://192.168.1.30/api/agents/$agent/start" -H "Content-Type: application/json" > /dev/null &
done
wait

echo ""
echo "Waiting for all agents to fully start and report back..."

# Monitor for up to 60 seconds
TIMEOUT=60
ELAPSED=0
ALL_READY=false

while [ $ELAPSED -lt $TIMEOUT ]; do
    sleep 2
    ELAPSED=$((ELAPSED + 2))
    
    # Check if all agents are online
    ONLINE_COUNT=$(curl -s "http://192.168.1.30/api/agents" | jq -r '.agents[] | select(.isOnline == true) | .name' | wc -l)
    
    if [ $ONLINE_COUNT -eq 5 ]; then
        ALL_READY=true
        break
    fi
    
    echo "  $ELAPSED seconds: $ONLINE_COUNT/5 agents online..."
done

# Calculate total time
END_TIME=$(date +%s.%N)
TOTAL_TIME=$(echo "$END_TIME - $START_TIME" | bc)

# Stop log monitoring
kill $HUB_LOG_PID 2>/dev/null
sleep 1

# Show results
echo ""
echo "=== RESULTS ==="
printf "Total time for all agents to be online: %.1f seconds\n" $TOTAL_TIME
echo ""

# Extract timing data from logs
echo "=== INDIVIDUAL AGENT TIMINGS ==="
echo ""

for agent in nginx pve1 pve2 pve3 unraid; do
    echo "--- $agent ---"
    
    # Get start command time
    START_CMD=$(grep "\[HUB\] Start command received for $agent" start-all-timing.log | tail -1)
    if [ -n "$START_CMD" ]; then
        echo "$START_CMD"
    fi
    
    # Get manager response time
    MANAGER_RESP=$(grep "\[HUB\] Manager responded.*for $agent" start-all-timing.log | tail -1)
    if [ -n "$MANAGER_RESP" ]; then
        echo "$MANAGER_RESP"
    fi
    
    # Get agent ready time and profile
    AGENT_READY=$(grep -A15 "AGENT READY.*${agent}" start-all-timing.log | grep -E "Total startup time:|imports_complete:|api_confirmed_ready:" | head -3)
    if [ -n "$AGENT_READY" ]; then
        echo "$AGENT_READY"
    fi
    
    echo ""
done

# Show any errors
echo "=== ERRORS (if any) ==="
grep -i "error\|failed\|500" start-all-timing.log | grep -v "grep" | head -10

# Clean up
rm -f start-all-timing.log

echo ""
echo "=== Test complete ===" 