#!/bin/bash

# Cleanup and Deploy Script
# Stops all old agents and deploys the new version

echo "=== Cleanup and Deploy Script ==="

# First build the new version
echo "Building new version..."
cd agent
./build-with-version.sh || exit 1
NEW_VERSION=$(node -p "require('./package.json').version")
cd ..

echo "Will deploy version: $NEW_VERSION"

# Create deployment package
tar -czf agent-deploy.tar.gz -C agent dist gui package.json

# Function to cleanup and deploy
cleanup_and_deploy() {
    local HOST=$1
    local NAME=$2
    
    echo ""
    echo "=== $NAME ($HOST) ==="
    
    ssh root@$HOST << 'CLEANUP'
    echo "Stopping all node processes..."
    # Kill all node processes related to agents
    pkill -f "node.*dist/index.js" || true
    pkill -f "node.*api/index.js" || true
    pkill -f "ai-agent" || true
    sleep 2
    
    # Double check they're gone
    if ps aux | grep -E "node.*index.js" | grep -v grep; then
        echo "Force killing remaining processes..."
        ps aux | grep -E "node.*index.js" | grep -v grep | awk '{print $2}' | xargs kill -9 2>/dev/null || true
    fi
    
    echo "All agents stopped."
CLEANUP
    
    # Now deploy
    echo "Deploying new agent..."
    scp agent-deploy.tar.gz root@$HOST:/tmp/ || return 1
    
    ssh root@$HOST << EOF
    # Find correct directory
    if [ -d /opt/ai-agent/agent ]; then
        AGENT_DIR=/opt/ai-agent/agent
    elif [ -d /mnt/user/home/root/ai-agent ]; then
        AGENT_DIR=/mnt/user/home/root/ai-agent
    else
        echo "Creating agent directory..."
        AGENT_DIR=/opt/ai-agent/agent
        mkdir -p \$AGENT_DIR
    fi
    
    echo "Installing in \$AGENT_DIR"
    cd \$AGENT_DIR
    
    # Extract new files
    tar -xzf /tmp/agent-deploy.tar.gz
    
    # Start agent
    export PORT=3080
    export AGENT_ID=${NAME}-agent
    export HUB_URL=http://192.168.1.30
    export AUTH_TOKEN=your-secure-token
    
    if [ -f ./node ]; then
        # Unraid style
        nohup ./node dist/api/index.js > agent.log 2>&1 &
    else
        # Standard
        nohup node dist/api/index.js > agent.log 2>&1 &
    fi
    
    echo "Agent started with PID \$!"
    
    # Clean up
    rm -f /tmp/agent-deploy.tar.gz
EOF
    
    # Verify
    echo "Waiting for agent to start..."
    sleep 3
    
    if curl -s http://$HOST:3080/api/status > /dev/null 2>&1; then
        VERSION=$(curl -s http://$HOST:3080/api/status | jq -r '.version')
        DIR=$(curl -s http://$HOST:3080/api/status | jq -r '.workingDirectory')
        echo "✓ Agent running version $VERSION"
        echo "  Working directory: $DIR"
    else
        echo "✗ Agent not responding on port 3080"
    fi
}

# Deploy to all agents
cleanup_and_deploy "192.168.1.5" "pve1"
cleanup_and_deploy "192.168.1.6" "pve2"
cleanup_and_deploy "192.168.1.7" "pve3"
cleanup_and_deploy "192.168.1.2" "nginx"
cleanup_and_deploy "192.168.1.10" "unraid"

# Final status check
echo ""
echo "=== Final Status ==="
echo "Expected version: $NEW_VERSION"
echo ""
printf "%-15s %-20s %-10s %s\n" "Host" "Agent ID" "Version" "Status"
printf "%-15s %-20s %-10s %s\n" "----" "--------" "-------" "------"

for host in 192.168.1.5 192.168.1.6 192.168.1.7 192.168.1.2 192.168.1.10; do
    if STATUS=$(curl -s --max-time 2 http://$host:3080/api/status 2>/dev/null); then
        VERSION=$(echo "$STATUS" | jq -r '.version')
        AGENT_ID=$(echo "$STATUS" | jq -r '.agentId')
        if [ "$VERSION" = "$NEW_VERSION" ]; then
            printf "%-15s %-20s %-10s ✓\n" "$host" "$AGENT_ID" "v$VERSION"
        else
            printf "%-15s %-20s %-10s ✗ (wrong version)\n" "$host" "$AGENT_ID" "v$VERSION"
        fi
    else
        printf "%-15s %-20s %-10s ✗ (not responding)\n" "$host" "-" "-"
    fi
done

# Cleanup
rm -f agent-deploy.tar.gz