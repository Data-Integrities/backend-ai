#!/bin/bash

# Deploy log search script to all agents
echo "Deploying log search script to all agents..."

# Make script executable
chmod +x agent/scripts/search-logs.sh

# Deploy to all agents
AGENTS=("192.168.1.2" "192.168.1.5" "192.168.1.6" "192.168.1.7" "192.168.1.10")

for agent_ip in "${AGENTS[@]}"; do
    echo "Deploying to $agent_ip..."
    
    # Create scripts directory if it doesn't exist
    ssh root@$agent_ip "mkdir -p /opt/ai-agent/agent/scripts"
    
    # Copy search script
    scp agent/scripts/search-logs.sh root@$agent_ip:/opt/ai-agent/agent/scripts/
    
    # Make executable
    ssh root@$agent_ip "chmod +x /opt/ai-agent/agent/scripts/search-logs.sh"
    
    echo "✓ Deployed to $agent_ip"
done

echo ""
echo "Log search script deployed to all agents!"
echo "The hub will now use this script for efficient log searching."