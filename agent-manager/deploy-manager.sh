#!/bin/bash

# Deploy agent-manager to a target machine
# Usage: ./deploy-manager.sh <ip_address>

set -e

TARGET=$1
if [ -z "$TARGET" ]; then
    echo "Usage: $0 <ip_address>"
    exit 1
fi

echo "Building agent-manager..."
npm install
npm run build

echo "Creating deployment package..."
tar -czf agent-manager.tar.gz dist package.json update-agent.sh

echo "Deploying to $TARGET..."

# Create directory structure
ssh root@$TARGET "mkdir -p /opt/ai-agent/manager"

# Copy files
scp agent-manager.tar.gz root@$TARGET:/tmp/
scp backend-ai-agent.service backend-ai-manager.service root@$TARGET:/tmp/

# Install on target
ssh root@$TARGET << 'EOF'
cd /opt/ai-agent/manager
tar -xzf /tmp/agent-manager.tar.gz
cp /tmp/update-agent.sh /opt/ai-agent/
chmod +x /opt/ai-agent/update-agent.sh

# Install systemd services
cp /tmp/backend-ai-agent.service /etc/systemd/system/
cp /tmp/backend-ai-manager.service /etc/systemd/system/
systemctl daemon-reload

# Install dependencies
npm install --production

# Stop old services if running
systemctl stop backend-ai-agent 2>/dev/null || true
pkill -f "node.*dist/api/index.js" 2>/dev/null || true
pkill -f "node.*web-agent" 2>/dev/null || true

# Start manager (agent will be managed by it)
systemctl enable backend-ai-manager
systemctl start backend-ai-manager

# Clean up
rm /tmp/agent-manager.tar.gz /tmp/*.service

echo "Deployment complete!"
echo "Manager status:"
systemctl status backend-ai-manager --no-pager
EOF

echo "Done! Agent manager deployed to $TARGET"
echo "Check status: curl http://$TARGET:3081/status"