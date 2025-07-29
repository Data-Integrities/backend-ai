#!/bin/bash

echo "=== DEPLOYING UNRAID AGENT MANAGER WITH RC.D ==="
echo ""

# Build the Unraid manager
echo "1. Building Unraid-specific manager..."
cd agent/manager
npx tsc manager-unraid.ts --outDir dist --esModuleInterop --skipLibCheck --resolveJsonModule || echo "Build warnings ignored"
cd ../..

echo ""
echo "2. Deploying to Unraid..."

# Deploy the manager
echo "   Copying manager files..."
scp agent/manager/dist/manager-unraid.js root@192.168.1.10:/opt/ai-agent/manager/dist/index.js

# Deploy rc.d script
echo "   Installing rc.d script..."
scp unraid/rc.ai-agent-manager root@192.168.1.10:/etc/rc.d/
ssh root@192.168.1.10 "chmod +x /etc/rc.d/rc.ai-agent-manager"

echo ""
echo "3. Stopping old manager processes..."
ssh root@192.168.1.10 "pkill -f 'node.*ai-agent/manager' || true"
sleep 2

echo ""
echo "4. Starting manager via rc.d..."
ssh root@192.168.1.10 "/etc/rc.d/rc.ai-agent-manager start"

echo ""
echo "5. Checking manager status..."
sleep 2
ssh root@192.168.1.10 "/etc/rc.d/rc.ai-agent-manager status"

echo ""
echo "6. Testing manager API..."
if curl -s -f "http://192.168.1.10:3081/status" > /dev/null 2>&1; then
    echo "   ✓ Manager API is responding"
    curl -s "http://192.168.1.10:3081/status" | jq '.'
else
    echo "   ✗ Manager API is not responding"
fi

echo ""
echo "7. To make it start on boot, add to Unraid's go script:"
echo "   /etc/rc.d/rc.ai-agent-manager start"
echo ""
echo "=== Deployment complete ===" 