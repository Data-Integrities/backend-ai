#!/bin/bash

echo "=== DEPLOYING AGENTS WITH STARTUP PROFILING ==="
echo ""

# Build the agent with profiling
echo "1. Building agent..."
cd /Users/jeffk/Developement/provider-search/backend-ai/agent
npm run build

# Deploy to all agents
echo ""
echo "2. Deploying to all agents..."
for agent in nginx pve1 pve2 pve3; do
    echo "   Deploying to $agent..."
    AGENT_IP=$(grep -A5 "\"$agent\"" ../hub/agents-config.json | grep '"ip"' | cut -d'"' -f4)
    scp -r dist root@$AGENT_IP:/opt/ai-agent/agent/
done

# Deploy to unraid (different path)
echo "   Deploying to unraid..."
scp -r dist root@192.168.1.10:/opt/backend-ai/agent/

echo ""
echo "3. Setting STARTUP_VERBOSITY=3 on all agents..."
for agent in nginx pve1 pve2 pve3; do
    AGENT_IP=$(grep -A5 "\"$agent\"" ../hub/agents-config.json | grep '"ip"' | cut -d'"' -f4)
    ssh root@$AGENT_IP "cd /opt/ai-agent/agent && echo 'STARTUP_VERBOSITY=3' >> .env"
done
ssh root@192.168.1.10 "cd /opt/backend-ai/agent && echo 'STARTUP_VERBOSITY=3' >> .env"

echo ""
echo "=== Deployment complete ===" 