#!/bin/bash

# Deploy Agents with Version Tracking
# This script builds, increments version, and deploys to all agents

echo "=== Agent Deployment with Version Tracking ==="

# Build with version increment
echo "Building agent with version increment..."
cd agent
./build-with-version.sh || exit 1
NEW_VERSION=$(node -p "require('./package.json').version")
cd ..

echo ""
echo "Deploying agent version $NEW_VERSION"
echo ""

# Create deployment package
tar -czf agent-v${NEW_VERSION}.tar.gz -C agent dist gui package.json

# Function to deploy agent with version check
deploy_agent() {
    local HOST=$1
    local NAME=$2
    
    echo "=== $NAME ($HOST) ==="
    
    # Get current version
    CURRENT=$(curl -s http://$HOST:3080/api/status 2>/dev/null | jq -r '.version // "unknown"')
    echo "Current version: $CURRENT"
    
    # Deploy
    echo -n "Deploying v$NEW_VERSION... "
    
    cat agent-v${NEW_VERSION}.tar.gz | ssh root@$HOST 'bash -c "
        # Find agent directory
        if [ -d /opt/ai-agent/agent ]; then
            cd /opt/ai-agent/agent
        elif [ -d /mnt/user/home/root/ai-agent ]; then
            cd /mnt/user/home/root/ai-agent
        else
            echo \"Error: Cannot find agent directory\"
            exit 1
        fi
        
        # Backup current version
        [ -d dist ] && mv dist dist.v${CURRENT}.bak
        
        # Extract new version
        tar -xzf - || exit 1
        
        # Restart agent
        pkill -f \"node.*api/index.js\" 2>/dev/null
        sleep 1
        
        if [ -f ./node ]; then
            nohup ./node dist/api/index.js >> agent.log 2>&1 &
        else
            nohup node dist/api/index.js >> agent.log 2>&1 &
        fi
        
        echo \"OK\"
    "' || {
        echo "FAILED"
        return 1
    }
    
    # Verify new version
    sleep 3
    NEW_RUNNING=$(curl -s http://$HOST:3080/api/status 2>/dev/null | jq -r '.version // "error"')
    WORKING_DIR=$(curl -s http://$HOST:3080/api/status 2>/dev/null | jq -r '.workingDirectory // "unknown"')
    
    if [ "$NEW_RUNNING" = "$NEW_VERSION" ]; then
        echo "✓ Successfully updated to v$NEW_VERSION"
        echo "  Working directory: $WORKING_DIR"
    else
        echo "✗ Version mismatch! Expected v$NEW_VERSION, got v$NEW_RUNNING"
    fi
    echo ""
}

# Deploy to all agents
deploy_agent "192.168.1.5" "pve1"
deploy_agent "192.168.1.6" "pve2"
deploy_agent "192.168.1.7" "pve3"
deploy_agent "192.168.1.2" "nginx"
deploy_agent "192.168.1.10" "unraid"

# Summary
echo "=== Deployment Summary ==="
echo "Target version: $NEW_VERSION"
echo ""
echo "Agent Status:"
for host in 192.168.1.5 192.168.1.6 192.168.1.7 192.168.1.2 192.168.1.10; do
    STATUS=$(curl -s http://$host:3080/api/status 2>/dev/null)
    if [ $? -eq 0 ]; then
        VERSION=$(echo "$STATUS" | jq -r '.version')
        AGENT_ID=$(echo "$STATUS" | jq -r '.agentId')
        printf "%-15s %-20s v%-10s" "$host" "$AGENT_ID" "$VERSION"
        if [ "$VERSION" = "$NEW_VERSION" ]; then
            echo " ✓"
        else
            echo " ✗"
        fi
    else
        printf "%-15s %-20s %-10s ✗ (not responding)\n" "$host" "unknown" "unknown"
    fi
done

# Cleanup
rm -f agent-v${NEW_VERSION}.tar.gz

echo ""
echo "Deployment complete!"