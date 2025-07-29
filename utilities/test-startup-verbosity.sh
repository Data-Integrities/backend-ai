#!/bin/bash

echo "=== Testing Agent Startup with Verbosity Levels ==="
echo ""

AGENT="nginx"
AGENT_IP="192.168.1.2"

# Function to test startup with given verbosity
test_startup() {
    local VERBOSITY=$1
    echo "=== Testing with STARTUP_VERBOSITY=$VERBOSITY ==="
    
    # Stop agent first
    echo "Stopping agent..."
    curl -s -X POST "http://192.168.1.30/api/agents/$AGENT/stop" -H "Content-Type: application/json" > /dev/null
    sleep 3
    
    # Set verbosity on the agent
    echo "Setting verbosity level..."
    ssh root@$AGENT_IP "echo 'STARTUP_VERBOSITY=$VERBOSITY' >> /opt/ai-agent/agent/.env"
    
    # Start agent and capture logs
    echo "Starting agent..."
    START_TIME=$(date +%s)
    curl -s -X POST "http://192.168.1.30/api/agents/$AGENT/start" -H "Content-Type: application/json" > /dev/null
    
    # Monitor logs for 10 seconds
    echo "Monitoring startup logs..."
    ssh root@$AGENT_IP "journalctl -u ai-agent -f -n 0" &
    LOG_PID=$!
    
    # Wait for agent to come online
    for i in {1..20}; do
        if curl -s -f "http://$AGENT_IP:3080/api/status" > /dev/null 2>&1; then
            END_TIME=$(date +%s)
            ELAPSED=$((END_TIME - START_TIME))
            echo ""
            echo "Agent online after $ELAPSED seconds"
            break
        fi
        sleep 1
    done
    
    # Stop log monitoring
    kill $LOG_PID 2>/dev/null
    
    # Clean up env file
    ssh root@$AGENT_IP "grep -v STARTUP_VERBOSITY /opt/ai-agent/agent/.env > /tmp/.env && mv /tmp/.env /opt/ai-agent/agent/.env"
    
    echo ""
    echo "----------------------------------------"
    echo ""
}

# Test different verbosity levels
test_startup 0  # Silent
test_startup 1  # Basic
test_startup 2  # Detailed
test_startup 3  # Debug

echo "=== Testing Complete ===" 