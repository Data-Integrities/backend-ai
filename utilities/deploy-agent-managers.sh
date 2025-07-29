#!/bin/bash

# Deploy agent managers to all agents

set -e

echo "Deploying agent managers to all agents..."

# Create agent manager package
echo "Creating agent manager package..."
cd agent/manager
tar -czf ../../agent-manager.tar.gz dist/ package.json package-lock.json update-agent.sh update-agent-safe.sh ai-agent-manager.service

cd ../..

# List of agents to deploy to
AGENTS=(
    "root@192.168.1.2"   # nginx
    "root@192.168.1.5"   # pve1
    "root@192.168.1.6"   # pve2
    "root@192.168.1.7"   # pve3
    "root@192.168.1.10"  # unraid
)

# Deploy to each agent
for AGENT in "${AGENTS[@]}"; do
    echo ""
    echo "Deploying to $AGENT..."
    
    # Create manager directory
    ssh $AGENT "mkdir -p /opt/ai-agent/manager"
    
    # Copy package
    scp agent-manager.tar.gz $AGENT:/opt/ai-agent/manager/
    
    # Extract and setup
    ssh $AGENT "cd /opt/ai-agent/manager && tar -xzf agent-manager.tar.gz && rm agent-manager.tar.gz"
    
    # Install systemd service
    ssh $AGENT "cp /opt/ai-agent/manager/ai-agent-manager.service /etc/systemd/system/"
    ssh $AGENT "systemctl daemon-reload"
    ssh $AGENT "systemctl enable ai-agent-manager"
    ssh $AGENT "systemctl restart ai-agent-manager"
    
    # Check status
    sleep 2
    ssh $AGENT "systemctl status ai-agent-manager --no-pager | grep Active"
    
    echo "✓ Deployed to $AGENT"
done

# Clean up local package
rm -f agent-manager.tar.gz

echo ""
echo "Agent managers deployed to all agents!"
echo ""
echo "Checking manager versions..."
curl -s http://192.168.1.30/api/agents | jq -r '.agents[] | "\(.name): Agent v\(.version) | Manager v\(.managerVersion // "checking...")"'