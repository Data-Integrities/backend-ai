#!/bin/bash

# Deploy correlation ID test version
echo "Deploying correlationID test version..."

# Build hub
echo "Building hub..."
cd /Users/jeffk/Developement/provider-search/backend-ai/hub
npm run build

# Build agent  
echo "Building agent..."
cd /Users/jeffk/Developement/provider-search/backend-ai/agent
npm run build

# Deploy to hub first
echo "Deploying hub..."
cd /Users/jeffk/Developement/provider-search/backend-ai
tar -czf hub-correlation-test.tar.gz -C hub dist gui api
scp hub-correlation-test.tar.gz root@192.168.1.30:/tmp/
ssh root@192.168.1.30 "cd /opt/backend-ai/hub && tar -xzf /tmp/hub-correlation-test.tar.gz && systemctl restart ai-hub"

# Deploy agent to nginx for testing
echo "Deploying agent to nginx..."
tar -czf agent-correlation-test.tar.gz -C agent dist gui api manager
scp agent-correlation-test.tar.gz root@192.168.1.2:/tmp/
ssh root@192.168.1.2 "cd /opt/ai-agent/agent && tar -xzf /tmp/agent-correlation-test.tar.gz && systemctl restart ai-agent-manager"

echo "Waiting for services to start..."
sleep 5

echo "Deployment complete!"
echo ""
echo "Test correlationID flow:"
echo "1. Open http://192.168.1.30"
echo "2. Start/stop an agent"
echo "3. Check console for correlationID tracking"
echo "4. Click log icon to view correlated logs"