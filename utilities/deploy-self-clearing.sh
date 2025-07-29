#!/bin/bash

echo "=== DEPLOYING SELF-CLEARING AGENTS AND MANAGERS ==="
echo ""

# Build manager too
echo "1. Building manager..."
cd agent/manager
mkdir -p dist
npx tsc index.ts --outDir dist --esModuleInterop --skipLibCheck || echo "Build warnings ignored"
cd ../..

echo ""
echo "2. Deploying to all agents..."
for agent in nginx pve1 pve2 pve3; do
    AGENT_IP=$(grep -A5 "\"$agent\"" hub/agents-config.json | grep '"ip"' | cut -d'"' -f4)
    echo "   Deploying to $agent ($AGENT_IP)..."
    
    # Deploy agent
    scp -r agent/dist root@$AGENT_IP:/opt/ai-agent/agent/
    
    # Deploy manager
    scp agent/manager/dist/index.js root@$AGENT_IP:/opt/ai-agent/manager/dist/
    
    # Restart manager first (it will clear its own port)
    ssh root@$AGENT_IP "systemctl restart ai-agent-manager"
done

# Deploy to unraid
echo "   Deploying to unraid..."
scp -r agent/dist root@192.168.1.10:/opt/ai-agent/agent/
# Unraid manager is different, skip for now

echo ""
echo "3. Testing self-clearing with intentional port conflict..."

# Create a rogue process on nginx port 3080
echo "   Creating rogue process on nginx:3080..."
ssh root@192.168.1.2 "nohup sh -c 'echo \"HTTP/1.1 200 OK\n\nROGUE\" | nc -l -p 3080' > /dev/null 2>&1 &"
sleep 1

# Verify rogue process
echo "   Verifying rogue process is listening..."
ssh root@192.168.1.2 "netstat -tlnp | grep :3080"

# Now start the agent
echo ""
echo "   Starting nginx agent (should clear the port automatically)..."
curl -s -X POST "http://192.168.1.30/api/agents/nginx/start" -H "Content-Type: application/json"

sleep 3

# Check if agent started successfully
echo ""
echo "   Checking if agent is running:"
if curl -s "http://192.168.1.2:3080/api/status" | jq -r '.status' | grep -q "online"; then
    echo "   ✓ Agent successfully started after clearing port!"
else
    echo "   ✗ Agent failed to start"
fi

echo ""
echo "=== Deployment complete ===" 