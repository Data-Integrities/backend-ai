#!/bin/bash

# Deploy Hub Update Script
echo "=== Deploying Hub Update ==="

# Copy VERSION_CONFIG.json to hub
echo "Copying VERSION_CONFIG.json..."
scp VERSION_CONFIG.json root@192.168.1.30:/opt/backend-ai/

# Create update package
echo "Creating hub update package..."
cd hub
tar -czf hub-update.tar.gz dist gui package.json
cd ..

# Deploy to hub
echo "Deploying to hub..."
scp hub/hub-update.tar.gz root@192.168.1.30:/tmp/

ssh root@192.168.1.30 << 'EOF'
echo "Updating hub..."
cd /opt/backend-ai/hub

# Backup current
[ -d dist ] && mv dist dist.backup.$(date +%Y%m%d_%H%M%S)

# Extract update
tar -xzf /tmp/hub-update.tar.gz

# Restart hub
echo "Restarting hub..."
systemctl restart ai-hub || pm2 restart ai-hub || pkill -f "hub.*index.js"
sleep 2

# Start if not running
if ! pgrep -f "hub.*index.js" > /dev/null; then
    cd /opt/backend-ai/hub
    nohup node dist/api/index.js > hub.log 2>&1 &
    echo "Hub started with PID $!"
fi

rm -f /tmp/hub-update.tar.gz
echo "Hub updated"
EOF

# Test new endpoints
echo ""
echo "Testing hub endpoints..."
sleep 3

echo "Hub status:"
curl -s http://192.168.1.30/api/status 2>/dev/null | jq '{hubId, version, expectedAgentVersion, agents}' || echo "Failed to get hub status"

echo ""
echo "Version check:"
curl -s http://192.168.1.30/api/version-check 2>/dev/null | jq '.summary' || echo "Failed to get version check"

# Cleanup
rm -f hub/hub-update.tar.gz

echo ""
echo "Hub deployment complete!"