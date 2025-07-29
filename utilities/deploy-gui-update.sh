#!/bin/bash

# Deploy GUI Update Script
# Updates only the GUI files (HTML) for hub and agents

echo "=== GUI Update Deployment Script ==="
echo "Updating page titles and favicons..."

# Update Hub GUI
echo ""
echo "Updating Hub GUI..."
scp hub/gui/index.html root@192.168.1.30:/opt/ai-hub/gui/ || {
    echo "Failed to update hub GUI"
}

# Test hub
HUB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://192.168.1.30/)
if [ "$HUB_STATUS" = "200" ]; then
    echo "✓ Hub GUI updated successfully"
else
    echo "✗ Hub GUI not responding"
fi

# Function to update agent GUI
update_agent_gui() {
    local HOST=$1
    local NAME=$2
    
    echo ""
    echo "Updating $NAME GUI ($HOST)..."
    
    # SSH and determine agent directory
    ssh root@$HOST << 'EOF' > /tmp/agent_dir.txt
if [ -d /opt/ai-agent/agent ]; then
    echo "/opt/ai-agent/agent"
elif [ -d /mnt/user/home/root/ai-agent ]; then
    echo "/mnt/user/home/root/ai-agent"
else
    echo "ERROR"
fi
EOF
    
    AGENT_DIR=$(cat /tmp/agent_dir.txt | tr -d '\n')
    rm -f /tmp/agent_dir.txt
    
    if [ "$AGENT_DIR" = "ERROR" ]; then
        echo "Failed to find agent directory on $NAME"
        return 1
    fi
    
    # Copy GUI file
    scp agent/gui/index.html root@$HOST:$AGENT_DIR/gui/ || {
        echo "Failed to copy GUI to $NAME"
        return 1
    }
    
    # Test
    GUI_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://$HOST:3080/)
    if [ "$GUI_STATUS" = "200" ]; then
        echo "✓ $NAME GUI updated successfully"
    else
        echo "✗ $NAME GUI not responding"
    fi
}

# Update all agents
update_agent_gui "192.168.1.5" "pve1"
update_agent_gui "192.168.1.6" "pve2"
update_agent_gui "192.168.1.7" "pve3"
update_agent_gui "192.168.1.2" "nginx"
update_agent_gui "192.168.1.10" "unraid"

echo ""
echo "=== Update Complete ==="
echo "Page titles updated:"
echo "- Hub: 'Infrastructure AI Hub' with 🏢 icon"
echo "- Agents: '<machine-name> AI Agent' with 🤖 icon"
echo ""
echo "Test URLs:"
echo "- Hub: http://192.168.1.30/"
echo "- Nginx Agent: http://192.168.1.2:3080/"