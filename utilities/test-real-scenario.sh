#!/bin/bash

echo "=== TESTING REAL START ALL SCENARIO ==="
echo "This simulates exactly what happens when you click Start All"
echo ""

# Stop all agents first
echo "1. Stopping all agents (like Stop All button)..."
for agent in nginx pve1 pve2 pve3 unraid; do
    curl -s -X POST "http://192.168.1.30/api/agents/$agent/stop" -H "Content-Type: application/json" > /dev/null
done

echo "2. Waiting for all agents to stop..."
sleep 5

# Check initial status
echo "3. Initial status check:"
INITIAL_STATUS=$(curl -s "http://192.168.1.30/api/agents" | jq -r '.agents[] | "\(.name): \(if .isOnline then "ONLINE" else "OFFLINE" end)"')
echo "$INITIAL_STATUS"

# Start timing
START_TIME=$(date +%s)
echo ""
echo "4. Starting all agents at $(date '+%H:%M:%S')..."

# Send start commands to all agents (like Start All does)
for agent in nginx pve1 pve2 pve3 unraid; do
    echo "   Sending start command to $agent..."
    curl -s -X POST "http://192.168.1.30/api/agents/$agent/start" -H "Content-Type: application/json" > /dev/null &
done
wait

echo ""
echo "5. Monitoring agent status (simulating GUI refresh every 5 seconds)..."
echo "   Time | nginx | pve1 | pve2 | pve3 | unraid"
echo "   -----|-------|------|------|------|--------"

# Monitor for 60 seconds
for i in {0..12}; do
    ELAPSED=$((i * 5))
    
    # Get status of all agents
    STATUS=$(curl -s "http://192.168.1.30/api/agents")
    
    # Extract individual statuses
    NGINX=$(echo "$STATUS" | jq -r '.agents[] | select(.name == "nginx") | if .isOnline then "ON " else "OFF" end')
    PVE1=$(echo "$STATUS" | jq -r '.agents[] | select(.name == "pve1") | if .isOnline then "ON " else "OFF" end')
    PVE2=$(echo "$STATUS" | jq -r '.agents[] | select(.name == "pve2") | if .isOnline then "ON " else "OFF" end')
    PVE3=$(echo "$STATUS" | jq -r '.agents[] | select(.name == "pve3") | if .isOnline then "ON " else "OFF" end')
    UNRAID=$(echo "$STATUS" | jq -r '.agents[] | select(.name == "unraid") | if .isOnline then "ON " else "OFF" end')
    
    printf "   %3ds | %5s | %4s | %4s | %4s | %6s\n" "$ELAPSED" "$NGINX" "$PVE1" "$PVE2" "$PVE3" "$UNRAID"
    
    # Check if all are online
    if [[ "$NGINX" == "ON " && "$PVE1" == "ON " && "$PVE2" == "ON " && "$PVE3" == "ON " && "$UNRAID" == "ON " ]]; then
        echo ""
        echo "All agents online after $ELAPSED seconds!"
        break
    fi
    
    sleep 5
done

# Final timing
END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))

echo ""
echo "6. Final status:"
curl -s "http://192.168.1.30/api/agents" | jq -r '.agents[] | "\(.name): \(if .isOnline then "ONLINE" else "OFFLINE" end), version: \(.version)"'

echo ""
echo "Total time: $TOTAL_TIME seconds"
echo ""
echo "=== Test complete ===" 