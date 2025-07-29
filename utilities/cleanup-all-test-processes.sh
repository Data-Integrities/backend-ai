#!/bin/bash

echo "=== CLEANING UP ALL TEST PROCESSES ==="
echo "This will find and kill any rogue node processes on all agents"
echo ""

# List of all agent IPs
AGENTS=(
    "192.168.1.2:nginx"
    "192.168.1.5:pve1"
    "192.168.1.6:pve2"
    "192.168.1.7:pve3"
    "192.168.1.10:unraid"
)

for agent_info in "${AGENTS[@]}"; do
    IFS=':' read -r IP NAME <<< "$agent_info"
    echo "Checking $NAME ($IP)..."
    
    # Find node processes that aren't the manager
    ROGUE_PIDS=$(ssh root@$IP "ps aux | grep -E 'node.*dist/api/index.js' | grep -v manager | grep -v grep | awk '{print \$2}'" 2>/dev/null)
    
    if [ -n "$ROGUE_PIDS" ]; then
        echo "  Found rogue processes: $ROGUE_PIDS"
        for PID in $ROGUE_PIDS; do
            echo "  Killing process $PID..."
            ssh root@$IP "kill -9 $PID" 2>/dev/null
        done
        
        # Now try to start the service properly
        echo "  Starting ai-agent service..."
        if [ "$NAME" == "unraid" ]; then
            ssh root@$IP "rc-service ai-agent restart" 2>/dev/null || true
        else
            ssh root@$IP "systemctl restart ai-agent" 2>/dev/null || true
        fi
    else
        echo "  No rogue processes found"
    fi
    
    # Check current status
    if curl -s -f "http://$IP:3080/api/status" > /dev/null 2>&1; then
        echo "  Agent is now ONLINE ✓"
    else
        echo "  Agent is OFFLINE ✗"
    fi
    echo ""
done

echo "=== Cleanup complete ===" 