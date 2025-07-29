#!/bin/bash

# Quick Agent Code Update Script
# Updates only the compiled agent code (dist folder)

echo "=== Quick Agent Code Update ==="
echo "Building agent..."
cd agent
npm run build || exit 1
cd ..

# Create minimal update package (just dist folder)
tar -czf agent-code-update.tar.gz -C agent dist

# Function to update agent code
update_agent() {
    local HOST=$1
    local NAME=$2
    
    echo -n "Updating $NAME ($HOST)... "
    
    # Copy and extract in one command
    cat agent-code-update.tar.gz | ssh root@$HOST 'bash -c "
        # Find agent directory
        if [ -d /opt/ai-agent/agent ]; then
            cd /opt/ai-agent/agent
        elif [ -d /mnt/user/home/root/ai-agent ]; then
            cd /mnt/user/home/root/ai-agent
        else
            echo \"Error: Cannot find agent directory\"
            exit 1
        fi
        
        # Backup old dist
        [ -d dist ] && mv dist dist.bak
        
        # Extract new dist
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
    
    # Quick test
    sleep 2
    if curl -s http://$HOST:3080/api/status | grep -q "workingDirectory"; then
        echo "✓ Updated with working directory"
    else
        echo "✗ Update may have failed"
    fi
}

echo ""
echo "Updating agents..."

# Update all agents
update_agent "192.168.1.5" "pve1"
update_agent "192.168.1.6" "pve2"
update_agent "192.168.1.7" "pve3"
update_agent "192.168.1.2" "nginx"
update_agent "192.168.1.10" "unraid"

echo ""
echo "Testing working directory on nginx agent:"
curl -s http://192.168.1.2:3080/api/status | jq '.workingDirectory'

# Cleanup
rm -f agent-code-update.tar.gz