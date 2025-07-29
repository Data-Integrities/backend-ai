#!/bin/bash

# Deploy GUI files with favicons to all systems

echo "=== Deploying GUI with Icons ==="
echo "Hub: Blue 'H', Agents: Green 'A'"
echo ""

# Deploy to Hub
echo "Deploying to Hub (192.168.1.30)..."
scp hub/gui/index.html root@192.168.1.30:/opt/backend-ai/hub/gui/
scp hub/gui/favicon.svg root@192.168.1.30:/opt/backend-ai/hub/gui/
echo "✓ Hub GUI updated"
echo ""

# Function to deploy to agent
deploy_to_agent() {
    local name=$1
    local ip=$2
    local path=$3
    
    echo "Deploying to $name ($ip)..."
    scp agent/gui/index.html root@$ip:$path/gui/
    scp agent/gui/favicon.svg root@$ip:$path/gui/
    echo "✓ $name GUI updated"
}

# Deploy to all agents
deploy_to_agent "nginx" "192.168.1.2" "/opt/ai-agent/agent"
deploy_to_agent "pve1" "192.168.1.5" "/opt/ai-agent/agent"
deploy_to_agent "pve2" "192.168.1.6" "/opt/ai-agent/agent"
deploy_to_agent "pve3" "192.168.1.7" "/opt/ai-agent/agent"
deploy_to_agent "unraid" "192.168.1.10" "/mnt/user/home/root/ai-agent"

echo ""
echo "=== GUI Deployment Complete ==="
echo "All systems now have:"
echo "- Updated HTML files with correct favicon path"
echo "- Hub: Blue square with 'H' favicon"
echo "- Agents: Green square with 'A' favicon"
echo ""
echo "The icons should now appear in browser tabs."
echo "Clear browser cache if needed."