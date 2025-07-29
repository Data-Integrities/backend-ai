#!/bin/bash

echo "=== COMPREHENSIVE STARTUP TIMELINE TEST ==="
echo "This will track the entire startup process from systemctl to hub detection"
echo ""

AGENT="nginx"
AGENT_IP="192.168.1.2"

# Stop agent first
echo "1. Stopping agent..."
curl -s -X POST "http://192.168.1.30/api/agents/$AGENT/stop" -H "Content-Type: application/json"
sleep 3

# Set verbosity
echo "2. Setting STARTUP_VERBOSITY=3..."
ssh root@$AGENT_IP "cd /opt/ai-agent/agent && echo 'STARTUP_VERBOSITY=3' >> .env"

# Clear logs
echo "3. Clearing logs..."
ssh root@$AGENT_IP "journalctl --rotate && journalctl --vacuum-time=1s > /dev/null 2>&1"

# Start monitoring multiple things
echo "4. Starting comprehensive monitoring..."

# Monitor systemd in background
echo "   - Monitoring systemd status..."
(while true; do
    STATUS=$(ssh root@$AGENT_IP "systemctl is-active ai-agent 2>/dev/null || echo inactive")
    echo "[$(date '+%H:%M:%S.%3N')] Systemd: $STATUS"
    sleep 0.5
done) > systemd-status.log &
SYSTEMD_PID=$!

# Monitor process in background
echo "   - Monitoring process existence..."
(while true; do
    PROC=$(ssh root@$AGENT_IP "pgrep -f 'node.*ai-agent.*index.js' > /dev/null && echo 'EXISTS' || echo 'NONE'")
    echo "[$(date '+%H:%M:%S.%3N')] Process: $PROC"
    sleep 0.5
done) > process-status.log &
PROCESS_PID=$!

# Monitor port in background
echo "   - Monitoring port 3080..."
(while true; do
    PORT=$(ssh root@$AGENT_IP "netstat -tlnp 2>/dev/null | grep :3080 | grep -q LISTEN && echo 'LISTENING' || echo 'NOT LISTENING'")
    echo "[$(date '+%H:%M:%S.%3N')] Port 3080: $PORT"
    sleep 0.5
done) > port-status.log &
PORT_PID=$!

# Monitor API in background
echo "   - Monitoring API responsiveness..."
(while true; do
    API=$(curl -s -f "http://$AGENT_IP:3080/api/status" > /dev/null 2>&1 && echo 'RESPONDING' || echo 'NOT RESPONDING')
    echo "[$(date '+%H:%M:%S.%3N')] API: $API"
    sleep 0.5
done) > api-status.log &
API_PID=$!

# Monitor hub detection in background
echo "   - Monitoring hub detection..."
(while true; do
    HUB_STATUS=$(curl -s "http://192.168.1.30/api/agents" | jq -r '.agents[] | select(.name == "nginx") | if .isOnline then "ONLINE" else "OFFLINE" end' 2>/dev/null || echo "ERROR")
    echo "[$(date '+%H:%M:%S.%3N')] Hub sees agent as: $HUB_STATUS"
    sleep 1
done) > hub-status.log &
HUB_PID=$!

# Start the agent
echo ""
echo "5. Starting agent via hub..."
START_TIME=$(date '+%H:%M:%S.%3N')
echo "   Start command sent at: $START_TIME"
curl -s -X POST "http://192.168.1.30/api/agents/$AGENT/start" -H "Content-Type: application/json"

# Wait for 30 seconds
echo "6. Monitoring for 30 seconds..."
sleep 30

# Kill all monitors
kill $SYSTEMD_PID $PROCESS_PID $PORT_PID $API_PID $HUB_PID 2>/dev/null

# Get journalctl logs
echo ""
echo "7. Getting systemd logs..."
ssh root@$AGENT_IP "journalctl -u ai-agent -n 100 --no-pager | grep -E 'STARTUP|Started|Starting|Stopped'" > systemd-logs.log

# Show timeline summary
echo ""
echo "=== TIMELINE SUMMARY ==="
echo ""
echo "Start command sent at: $START_TIME"
echo ""
echo "Key events:"
echo "----------"

# Find first occurrence of each state change
FIRST_ACTIVE=$(grep -m1 "Systemd: active" systemd-status.log 2>/dev/null)
FIRST_PROCESS=$(grep -m1 "Process: EXISTS" process-status.log 2>/dev/null)
FIRST_PORT=$(grep -m1 "Port 3080: LISTENING" port-status.log 2>/dev/null)
FIRST_API=$(grep -m1 "API: RESPONDING" api-status.log 2>/dev/null)
FIRST_HUB=$(grep -m1 "Hub sees agent as: ONLINE" hub-status.log 2>/dev/null)

echo "Systemd active:     $FIRST_ACTIVE"
echo "Process exists:     $FIRST_PROCESS"
echo "Port listening:     $FIRST_PORT"
echo "API responding:     $FIRST_API"
echo "Hub sees online:    $FIRST_HUB"

# Clean up
echo ""
echo "8. Cleaning up..."
ssh root@$AGENT_IP "cd /opt/ai-agent/agent && grep -v STARTUP_VERBOSITY .env > .env.tmp && mv .env.tmp .env"
rm -f systemd-status.log process-status.log port-status.log api-status.log hub-status.log systemd-logs.log

echo ""
echo "=== Test complete ===" 