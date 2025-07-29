#!/bin/bash

echo "=== PROFILING START ALL AGENTS ==="
echo "This will capture detailed startup logs from all agents"
echo ""

# Stop all agents first
echo "1. Stopping all agents..."
for agent in nginx pve1 pve2 pve3 unraid; do
    curl -s -X POST "http://192.168.1.30/api/agents/$agent/stop" -H "Content-Type: application/json" > /dev/null
done

echo "2. Waiting for agents to stop..."
sleep 5

# Clear logs on all agents
echo "3. Clearing logs..."
for ip in 192.168.1.2 192.168.1.5 192.168.1.6 192.168.1.7; do
    ssh root@$ip "journalctl --rotate && journalctl --vacuum-time=1s > /dev/null 2>&1" &
done
ssh root@192.168.1.10 "rc-service ai-agent stop > /dev/null 2>&1" &
wait

# Start log collection in background
echo "4. Starting log collectors..."
mkdir -p startup-logs
ssh root@192.168.1.2 "journalctl -u ai-agent -f -n 0" > startup-logs/nginx.log 2>&1 &
PID1=$!
ssh root@192.168.1.5 "journalctl -u ai-agent -f -n 0" > startup-logs/pve1.log 2>&1 &
PID2=$!
ssh root@192.168.1.6 "journalctl -u ai-agent -f -n 0" > startup-logs/pve2.log 2>&1 &
PID3=$!
ssh root@192.168.1.7 "journalctl -u ai-agent -f -n 0" > startup-logs/pve3.log 2>&1 &
PID4=$!
# Unraid doesn't use journalctl
ssh root@192.168.1.10 "tail -f /var/log/ai-agent.log" > startup-logs/unraid.log 2>&1 &
PID5=$!

# Start all agents
echo "5. Starting all agents at $(date '+%H:%M:%S.%3N')..."
START_TIME=$(date +%s.%N)

# Send start commands in parallel (like the hub does)
for agent in nginx pve1 pve2 pve3 unraid; do
    curl -s -X POST "http://192.168.1.30/api/agents/$agent/start" -H "Content-Type: application/json" > /dev/null &
done
wait

echo "6. Monitoring agent status..."
echo "   Time | nginx | pve1 | pve2 | pve3 | unraid"
echo "   -----|-------|------|------|------|--------"

# Monitor until all are online
ALL_ONLINE=false
for i in {0..60}; do
    CURRENT_TIME=$(date +%s.%N)
    ELAPSED=$(echo "$CURRENT_TIME - $START_TIME" | bc)
    
    # Get status of all agents
    STATUS=$(curl -s "http://192.168.1.30/api/agents")
    
    # Extract individual statuses
    NGINX=$(echo "$STATUS" | jq -r '.agents[] | select(.name == "nginx") | if .isOnline then "ON " else "OFF" end')
    PVE1=$(echo "$STATUS" | jq -r '.agents[] | select(.name == "pve1") | if .isOnline then "ON " else "OFF" end')
    PVE2=$(echo "$STATUS" | jq -r '.agents[] | select(.name == "pve2") | if .isOnline then "ON " else "OFF" end')
    PVE3=$(echo "$STATUS" | jq -r '.agents[] | select(.name == "pve3") | if .isOnline then "ON " else "OFF" end')
    UNRAID=$(echo "$STATUS" | jq -r '.agents[] | select(.name == "unraid") | if .isOnline then "ON " else "OFF" end')
    
    printf "   %3.1fs | %5s | %4s | %4s | %4s | %6s\n" "$ELAPSED" "$NGINX" "$PVE1" "$PVE2" "$PVE3" "$UNRAID"
    
    # Check if all are online
    if [[ "$NGINX" == "ON " && "$PVE1" == "ON " && "$PVE2" == "ON " && "$PVE3" == "ON " && "$UNRAID" == "ON " ]]; then
        ALL_ONLINE=true
        echo ""
        echo "All agents online after $ELAPSED seconds!"
        break
    fi
    
    sleep 2
done

# Stop log collectors
sleep 2
kill $PID1 $PID2 $PID3 $PID4 $PID5 2>/dev/null

# Analyze startup logs
echo ""
echo "7. Analyzing startup logs..."
echo ""

for agent in nginx pve1 pve2 pve3; do
    if [ -f "startup-logs/$agent.log" ]; then
        echo "=== $agent startup profile ==="
        grep -E "STARTUP|Started|Starting" startup-logs/$agent.log | head -20
        echo ""
    fi
done

# Clean up verbosity setting
echo "8. Cleaning up..."
for ip in 192.168.1.2 192.168.1.5 192.168.1.6 192.168.1.7 192.168.1.10; do
    ssh root@$ip "cd /opt/ai-agent/agent 2>/dev/null && grep -v STARTUP_VERBOSITY .env > .env.tmp && mv .env.tmp .env" 2>/dev/null &
done
wait

echo ""
echo "=== Detailed logs saved in startup-logs/ directory ===" 