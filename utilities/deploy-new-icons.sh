#!/bin/bash

# Deploy New Letter-Based Icons
echo "=== Deploying New Letter-Based Icons ==="
echo "Hub: Blue 'H', Agent: Green 'A'"
echo ""

# Deploy Hub GUI and assets
echo "Updating Hub (192.168.1.30)..."
ssh root@192.168.1.30 "mkdir -p /opt/backend-ai/hub/assets" 2>/dev/null
scp hub/assets/favicon.svg root@192.168.1.30:/opt/backend-ai/hub/assets/
scp hub/gui/index.html root@192.168.1.30:/opt/backend-ai/hub/gui/

# Function to deploy agent GUI and assets
deploy_agent() {
    local HOST=$1
    local NAME=$2
    
    echo ""
    echo "Updating $NAME ($HOST)..."
    
    # Create assets directory and copy files
    cat agent/assets/favicon.svg | ssh root@$HOST 'bash -c "
        # Find agent directory
        if [ -d /opt/ai-agent/agent ]; then
            AGENT_DIR=/opt/ai-agent/agent
        elif [ -d /mnt/user/home/root/ai-agent ]; then
            AGENT_DIR=/mnt/user/home/root/ai-agent
        else
            echo \"Error: Cannot find agent directory\"
            exit 1
        fi
        
        # Create directories
        mkdir -p \$AGENT_DIR/assets
        mkdir -p \$AGENT_DIR/gui
        
        # Write favicon
        cat > \$AGENT_DIR/assets/favicon.svg
        
        echo \"Assets updated in \$AGENT_DIR\"
    "'
    
    # Copy GUI HTML
    cat agent/gui/index.html | ssh root@$HOST 'bash -c "
        if [ -d /opt/ai-agent/agent ]; then
            cat > /opt/ai-agent/agent/gui/index.html
        elif [ -d /mnt/user/home/root/ai-agent ]; then
            cat > /mnt/user/home/root/ai-agent/gui/index.html
        fi
    "'
    
    echo "✓ $NAME updated with new icon"
}

# Deploy to all agents
deploy_agent "192.168.1.5" "pve1"
deploy_agent "192.168.1.6" "pve2"
deploy_agent "192.168.1.7" "pve3"
deploy_agent "192.168.1.2" "nginx"
deploy_agent "192.168.1.10" "unraid"

echo ""
echo "=== Icon Deployment Complete ==="
echo "All systems now use letter-based icons:"
echo "- Hub: Blue square with 'H'"
echo "- Agents: Green square with 'A'"
echo ""
echo "Clear your browser cache if you don't see the new icons immediately."