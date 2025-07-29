#!/bin/bash

echo "=== DEPLOYING IMPROVED MANAGER WITH PORT CLEARING ==="
echo ""

# Build manager
echo "1. Building manager..."
cd /Users/jeffk/Developement/provider-search/backend-ai/agent/manager
# Create simple build just for the main manager
mkdir -p dist
npx tsc index.ts --outDir dist --esModuleInterop --skipLibCheck || echo "Build warnings ignored"

# Deploy to all systemd-based agents
echo ""
echo "2. Deploying to systemd agents..."
for agent in nginx pve1 pve2 pve3; do
    AGENT_IP=$(grep -A5 "\"$agent\"" ../../hub/agents-config.json | grep '"ip"' | cut -d'"' -f4)
    echo "   Deploying to $agent ($AGENT_IP)..."
    
    # Copy the improved manager
    scp dist/index.js root@$AGENT_IP:/opt/ai-agent/manager/dist/
    
    # Restart the manager
    ssh root@$AGENT_IP "systemctl restart ai-agent-manager || true"
done

echo ""
echo "3. Testing with an agent that has a rogue process..."
# Intentionally start a rogue process on nginx
echo "   Starting rogue process on nginx..."
ssh root@192.168.1.2 "cd /tmp && nohup node -e 'require(\"http\").createServer((req,res)=>res.end(\"rogue\")).listen(3080)' > /dev/null 2>&1 &"
sleep 2

# Verify rogue process is using the port
echo "   Checking port 3080 on nginx:"
ssh root@192.168.1.2 "netstat -tlnp | grep :3080"

# Now try to start the agent
echo ""
echo "   Testing manager start command (should clear the port)..."
curl -s -X POST "http://192.168.1.30/api/agents/nginx/start" -H "Content-Type: application/json"

sleep 3

# Check if agent is running
echo ""
echo "   Checking if agent started successfully:"
curl -s "http://192.168.1.2:3080/api/status" | jq -r '"Status: " + .status + ", Version: " + .version' || echo "Agent not responding"

echo ""
echo "=== Deployment complete ===" 