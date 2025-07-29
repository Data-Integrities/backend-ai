#!/bin/bash

# Quick deploy of manager fix for correlationID completion
echo "Deploying manager fix for correlationID completion..."

# Build manager
cd /Users/jeffk/Developement/provider-search/backend-ai/agent
npm run build

# Deploy manager to all agents
AGENTS=("192.168.1.2" "192.168.1.5" "192.168.1.6" "192.168.1.7")

for agent_ip in "${AGENTS[@]}"; do
    echo "Updating manager on $agent_ip..."
    
    # Copy manager files
    scp -q manager/dist/index.js root@$agent_ip:/opt/ai-agent/agent/manager/dist/
    
    # Restart manager
    ssh root@$agent_ip "systemctl restart ai-agent-manager" 2>/dev/null || \
    ssh root@$agent_ip "pkill -f 'node.*manager' && cd /opt/ai-agent/agent/manager && nohup node dist/index.js > /var/log/ai-agent-manager.log 2>&1 &"
    
    echo "✓ Manager updated on $agent_ip"
done

# Update unraid manager separately (different path)
echo "Updating manager on unraid (192.168.1.10)..."
scp -q manager/dist/index.js root@192.168.1.10:/opt/ai-agent/agent/manager/dist/
ssh root@192.168.1.10 "/etc/rc.d/rc.ai-agent-manager restart"
echo "✓ Manager updated on unraid"

echo ""
echo "Manager fix deployed! Stop operations should now complete correlationIDs properly."
echo "Test by:"
echo "1. Open http://192.168.1.30"
echo "2. Stop an agent"
echo "3. Console should show 'success' instead of 'pending'"