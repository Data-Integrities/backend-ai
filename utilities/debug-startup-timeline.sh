#!/bin/bash

echo "=== COMPREHENSIVE AGENT STARTUP TIMELINE DEBUGGER ==="
echo "This will track every step of the startup process"
echo ""

AGENT="nginx"
HUB_URL="http://192.168.1.30"
AGENT_IP="192.168.1.2"
AGENT_URL="http://${AGENT_IP}:3080"
MANAGER_URL="http://${AGENT_IP}:3081"

# Function to print timestamp
timestamp() {
    echo "[$(date '+%H:%M:%S.%3N')] $1"
}

# Function to check if agent is responding
check_agent() {
    if curl -s -f "${AGENT_URL}/api/status" > /dev/null 2>&1; then
        echo "ONLINE"
    else
        echo "OFFLINE"
    fi
}

# Function to check manager
check_manager() {
    if curl -s -f "${MANAGER_URL}/status" > /dev/null 2>&1; then
        echo "ONLINE"
    else
        echo "OFFLINE"
    fi
}

# Function to get systemd status
get_systemd_status() {
    ssh root@${AGENT_IP} "systemctl is-active ai-agent 2>/dev/null || echo 'unknown'"
}

# Function to check if process exists
check_process() {
    ssh root@${AGENT_IP} "pgrep -f 'node.*ai-agent.*index.js' > /dev/null && echo 'RUNNING' || echo 'NOT RUNNING'"
}

# Function to get last log lines
get_logs() {
    ssh root@${AGENT_IP} "journalctl -u ai-agent -n 5 --no-pager 2>/dev/null | tail -5"
}

timestamp "=== STARTING COMPREHENSIVE STARTUP DEBUG ==="

# Initial state
timestamp "Initial agent status: $(check_agent)"
timestamp "Initial manager status: $(check_manager)"
timestamp "Initial systemd status: $(get_systemd_status)"
timestamp "Initial process status: $(check_process)"

# Stop agent first
timestamp "Stopping agent via hub..."
curl -s -X POST "${HUB_URL}/api/agents/${AGENT}/stop" -H "Content-Type: application/json" > /dev/null

# Wait for stop
timestamp "Waiting for agent to stop..."
for i in {1..10}; do
    sleep 1
    STATUS=$(check_agent)
    timestamp "  Check $i: Agent=$STATUS, Process=$(check_process), Systemd=$(get_systemd_status)"
    if [ "$STATUS" = "OFFLINE" ]; then
        break
    fi
done

timestamp "=== STARTING AGENT ==="
START_TIME=$(date +%s.%N)

# Start agent via hub
timestamp "Sending start command to hub..."
RESPONSE=$(curl -s -X POST "${HUB_URL}/api/agents/${AGENT}/start" -H "Content-Type: application/json")
timestamp "Hub response: $RESPONSE"

# Now monitor everything
timestamp "=== MONITORING STARTUP PROGRESS ==="

for i in {1..60}; do
    CURRENT_TIME=$(date +%s.%N)
    ELAPSED=$(echo "$CURRENT_TIME - $START_TIME" | bc)
    
    AGENT_STATUS=$(check_agent)
    MANAGER_STATUS=$(check_manager)
    SYSTEMD_STATUS=$(get_systemd_status)
    PROCESS_STATUS=$(check_process)
    
    timestamp "T+${ELAPSED}s: Agent=$AGENT_STATUS, Manager=$MANAGER_STATUS, Systemd=$SYSTEMD_STATUS, Process=$PROCESS_STATUS"
    
    # Get more details if process is running but agent not responding
    if [ "$PROCESS_STATUS" = "RUNNING" ] && [ "$AGENT_STATUS" = "OFFLINE" ]; then
        timestamp "  Process is running but agent not responding. Checking details..."
        
        # Check if port is listening
        PORT_STATUS=$(ssh root@${AGENT_IP} "netstat -tlnp 2>/dev/null | grep :3080 | grep -q LISTEN && echo 'LISTENING' || echo 'NOT LISTENING'")
        timestamp "  Port 3080 status: $PORT_STATUS"
        
        # Check process details
        PROCESS_INFO=$(ssh root@${AGENT_IP} "ps aux | grep -E 'node.*ai-agent.*index.js' | grep -v grep | head -1")
        timestamp "  Process info: $PROCESS_INFO"
        
        # Get recent logs
        timestamp "  Recent logs:"
        get_logs | while read line; do
            timestamp "    $line"
        done
    fi
    
    # Stop when agent comes online
    if [ "$AGENT_STATUS" = "ONLINE" ]; then
        timestamp "=== AGENT IS NOW ONLINE ==="
        FINAL_TIME=$(date +%s.%N)
        TOTAL_TIME=$(echo "$FINAL_TIME - $START_TIME" | bc)
        timestamp "Total startup time: ${TOTAL_TIME} seconds"
        
        # Get final status
        timestamp "Final status check:"
        curl -s "${AGENT_URL}/api/status" | jq -r '"  Version: \(.version), PID: \(.pid // "unknown"), Uptime: \(.system.uptime // "unknown")"' 2>/dev/null || echo "  Unable to get detailed status"
        
        break
    fi
    
    sleep 1
done

if [ "$AGENT_STATUS" != "ONLINE" ]; then
    timestamp "=== TIMEOUT: Agent did not come online within 60 seconds ==="
fi

timestamp "=== DEBUG COMPLETE ==="