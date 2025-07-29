#!/bin/bash

echo "=== TESTING SINGLE AGENT STOP/START TIMING ==="
echo "Testing with nginx agent to isolate the issue"
echo ""

AGENT="nginx"
AGENT_IP="192.168.1.2"

# Function to check real agent status
check_real_status() {
    # Check multiple indicators
    local API_STATUS="DOWN"
    local PROCESS_STATUS="DOWN"
    local HUB_STATUS="OFFLINE"
    
    # Direct API check
    if curl -s -f "http://$AGENT_IP:3080/api/status" > /dev/null 2>&1; then
        API_STATUS="UP"
    fi
    
    # Process check
    if ssh root@$AGENT_IP "pgrep -f 'node.*ai-agent.*index.js' > /dev/null 2>&1"; then
        PROCESS_STATUS="UP"
    fi
    
    # Hub's view
    HUB_STATUS=$(curl -s "http://192.168.1.30/api/agents" | jq -r '.agents[] | select(.name == "nginx") | if .isOnline then "ONLINE" else "OFFLINE" end')
    
    echo "API: $API_STATUS, Process: $PROCESS_STATUS, Hub: $HUB_STATUS"
}

echo "1. Initial status:"
check_real_status

echo ""
echo "2. Stopping agent via hub..."
STOP_RESPONSE=$(curl -s -X POST "http://192.168.1.30/api/agents/$AGENT/stop" -H "Content-Type: application/json")
echo "   Hub response: $STOP_RESPONSE"

echo ""
echo "3. Monitoring shutdown (checking every 2 seconds)..."
for i in {1..10}; do
    echo "   ${i}s: $(check_real_status)"
    sleep 2
done

echo ""
echo "4. Starting agent via hub..."
START_TIME=$(date +%s)
START_RESPONSE=$(curl -s -X POST "http://192.168.1.30/api/agents/$AGENT/start" -H "Content-Type: application/json")
echo "   Hub response: $START_RESPONSE"

echo ""
echo "5. Monitoring startup (checking every 2 seconds)..."
for i in {1..30}; do
    STATUS=$(check_real_status)
    echo "   ${i}s: $STATUS"
    
    # Check if fully online
    if [[ "$STATUS" == *"API: UP"* ]] && [[ "$STATUS" == *"Process: UP"* ]] && [[ "$STATUS" == *"Hub: ONLINE"* ]]; then
        END_TIME=$(date +%s)
        TOTAL_TIME=$((END_TIME - START_TIME))
        echo ""
        echo "Agent fully online after $TOTAL_TIME seconds"
        break
    fi
    
    sleep 2
done

echo ""
echo "=== Test complete ===" 