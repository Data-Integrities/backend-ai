#!/bin/bash

echo "=== TESTING CLEAN START ALL (no rogue processes) ==="
echo ""

# First verify all ports are clear
echo "1. Checking for any processes on agent ports..."
for ip in 192.168.1.2 192.168.1.5 192.168.1.6 192.168.1.7 192.168.1.10; do
    echo -n "   $ip: "
    ssh root@$ip "netstat -tlnp 2>/dev/null | grep -E ':(3080|3081)' | wc -l" 2>/dev/null || echo "0"
done

echo ""
echo "2. Stopping all agents via hub..."
for agent in nginx pve1 pve2 pve3 unraid; do
    curl -s -X POST "http://192.168.1.30/api/agents/$agent/stop" -H "Content-Type: application/json" > /dev/null
done

echo "3. Waiting for agents to stop..."
sleep 5

echo ""
echo "4. Starting all agents at $(date '+%H:%M:%S.%3N')..."
START_TIME=$(date +%s.%N)

# Send all start commands in parallel
for agent in nginx pve1 pve2 pve3 unraid; do
    curl -s -X POST "http://192.168.1.30/api/agents/$agent/start" -H "Content-Type: application/json" > /dev/null &
done
wait

echo "5. Monitoring agent status..."
echo "   Time | nginx | pve1 | pve2 | pve3 | unraid"
echo "   -----|-------|------|------|------|--------"

# Monitor until all are online
for i in {0..30}; do
    CURRENT_TIME=$(date +%s.%N)
    ELAPSED=$(printf "%.1f" $(echo "$CURRENT_TIME - $START_TIME" | bc))
    
    # Get status of all agents
    STATUS=$(curl -s "http://192.168.1.30/api/agents")
    
    # Extract individual statuses
    NGINX=$(echo "$STATUS" | jq -r '.agents[] | select(.name == "nginx") | if .isOnline then "ON " else "OFF" end')
    PVE1=$(echo "$STATUS" | jq -r '.agents[] | select(.name == "pve1") | if .isOnline then "ON " else "OFF" end')
    PVE2=$(echo "$STATUS" | jq -r '.agents[] | select(.name == "pve2") | if .isOnline then "ON " else "OFF" end')
    PVE3=$(echo "$STATUS" | jq -r '.agents[] | select(.name == "pve3") | if .isOnline then "ON " else "OFF" end')
    UNRAID=$(echo "$STATUS" | jq -r '.agents[] | select(.name == "unraid") | if .isOnline then "ON " else "OFF" end')
    
    printf "  %4.1fs | %5s | %4s | %4s | %4s | %6s\n" "$ELAPSED" "$NGINX" "$PVE1" "$PVE2" "$PVE3" "$UNRAID"
    
    # Check if all are online
    if [[ "$NGINX" == "ON " && "$PVE1" == "ON " && "$PVE2" == "ON " && "$PVE3" == "ON " && "$UNRAID" == "ON " ]]; then
        echo ""
        echo "All agents online after $ELAPSED seconds!"
        break
    fi
    
    sleep 2
done

echo ""
echo "=== Test complete ===" 