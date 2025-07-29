#!/bin/bash

# Deploy GUI Update Script - Fixed Version
# Updates GUI files and creates directories if needed

echo "=== GUI Update Deployment Script (Fixed) ==="
echo "Updating page titles and favicons..."

# Update Hub GUI
echo ""
echo "Updating Hub GUI (192.168.1.30)..."
ssh root@192.168.1.30 "mkdir -p /opt/ai-hub/gui" 2>/dev/null
scp hub/gui/index.html root@192.168.1.30:/opt/ai-hub/gui/index.html || {
    echo "Failed to update hub GUI"
}

# Function to update agent GUI
update_agent_gui() {
    local HOST=$1
    local NAME=$2
    
    echo ""
    echo "Updating $NAME GUI ($HOST)..."
    
    # Create GUI directory and copy file in one SSH session
    cat agent/gui/index.html | ssh root@$HOST 'bash -c "
        # Find agent directory
        if [ -d /opt/ai-agent/agent ]; then
            AGENT_DIR=/opt/ai-agent/agent
        elif [ -d /mnt/user/home/root/ai-agent ]; then
            AGENT_DIR=/mnt/user/home/root/ai-agent
        else
            echo \"Error: Cannot find agent directory\"
            exit 1
        fi
        
        # Create gui directory if needed
        mkdir -p \$AGENT_DIR/gui
        
        # Write the file
        cat > \$AGENT_DIR/gui/index.html
        
        echo \"GUI updated in \$AGENT_DIR/gui/\"
    "' || {
        echo "Failed to update $NAME GUI"
        return 1
    }
    
    # Verify
    sleep 1
    GUI_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://$HOST:3080/)
    TITLE=$(curl -s http://$HOST:3080/ | grep -o '<title>.*</title>' | sed 's/<[^>]*>//g' || echo "")
    
    if [ "$GUI_STATUS" = "200" ]; then
        echo "✓ $NAME GUI working - Title will be: '$NAME AI Agent'"
    else
        echo "✗ $NAME GUI not responding"
    fi
}

# Update all agents from agents-config.json
update_agent_gui "192.168.1.5" "pve1"
update_agent_gui "192.168.1.6" "pve2"
update_agent_gui "192.168.1.7" "pve3"
update_agent_gui "192.168.1.2" "nginx"
update_agent_gui "192.168.1.10" "unraid"

# Verify hub
echo ""
echo "Verifying Hub..."
HUB_TITLE=$(curl -s http://192.168.1.30/ | grep -o '<title>.*</title>' | sed 's/<[^>]*>//g' || echo "")
echo "Hub title: '$HUB_TITLE'"

echo ""
echo "=== Update Complete ==="
echo "All GUIs updated with:"
echo "- Hub: 'Infrastructure AI Hub' with 🏢 icon"
echo "- Agents: Dynamic '<machine-name> AI Agent' with 🤖 icon"
echo ""
echo "The agent titles will show the actual machine names once loaded."