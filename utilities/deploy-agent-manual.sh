#!/bin/bash

# Manual Agent Update Script
# Updates agents without using self-update API

echo "=== Manual Agent Update Script ==="
echo "Updating agents with fixed GUI authentication..."

# Build the agent
echo "Building agent..."
cd agent
npm run build || exit 1
cd ..

# Create update package
echo "Creating update package..."
tar -czf agent-update.tar.gz -C agent dist gui package.json

# Function to manually update an agent
manual_update() {
    local HOST=$1
    local NAME=$2
    
    echo ""
    echo "Updating $NAME ($HOST)..."
    
    # Copy update package
    scp agent-update.tar.gz root@$HOST:/tmp/ || {
        echo "Failed to copy to $NAME"
        return 1
    }
    
    # SSH and update
    ssh root@$HOST << 'EOF'
# Find and stop current agent
echo "Stopping current agent..."
pkill -f "node.*api/index.js" || true
sleep 2

# Extract update based on location
if [ -d /opt/ai-agent/agent ]; then
    echo "Updating in /opt/ai-agent/agent..."
    cd /opt/ai-agent/agent
elif [ -d /mnt/user/home/root/ai-agent ]; then
    echo "Updating in /mnt/user/home/root/ai-agent..."
    cd /mnt/user/home/root/ai-agent
else
    echo "Error: Cannot find agent directory"
    exit 1
fi

# Backup and extract
if [ -d dist ]; then
    mv dist dist.backup.$(date +%Y%m%d_%H%M%S)
fi
tar -xzf /tmp/agent-update.tar.gz

# Start agent
echo "Starting agent..."
if [ -f ./node ]; then
    # Unraid style
    nohup ./node dist/api/index.js >> agent.log 2>&1 &
else
    # Standard Node.js
    nohup node dist/api/index.js >> agent.log 2>&1 &
fi

echo "Agent started with PID $!"
sleep 3

# Test
curl -s http://localhost:3080/api/status | grep -q "agentId" && echo "Agent API working" || echo "Agent API not responding"
EOF
    
    # Verify from outside
    echo "Verifying update..."
    sleep 2
    curl -s http://$HOST:3080/api/status | jq -r '.agentId' || echo "Failed to verify"
}

# Update all agents
manual_update "192.168.1.5" "pve1"
manual_update "192.168.1.6" "pve2"
manual_update "192.168.1.7" "pve3"
manual_update "192.168.1.2" "nginx"
manual_update "192.168.1.10" "unraid"

echo ""
echo "=== Update Complete ==="
echo "All agents updated with fixed GUI authentication"
echo "Test the nginx agent GUI: http://192.168.1.2:3080"

# Cleanup
rm -f agent-update.tar.gz