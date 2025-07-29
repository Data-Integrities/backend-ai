#!/bin/bash

# Deploy hub with manager to backend-ai VM
HUB_IP="192.168.1.30"
echo "Deploying Hub with Manager to $HUB_IP..."

# Build hub locally
cd /Users/jeffk/Developement/provider-search/backend-ai/hub
npm install
npm run build

# Create deployment package
tar -czf hub-with-manager.tar.gz dist gui assets package.json package-lock.json manager/ai-hub-manager.service

# Transfer and deploy
scp hub-with-manager.tar.gz root@$HUB_IP:/tmp/

ssh root@$HUB_IP << 'EOF'
cd /opt/backend-ai/hub

# Stop services
systemctl stop ai-hub.service || true
systemctl stop ai-hub-manager.service || true

# Backup current version
if [ -d dist ]; then
    mv dist dist.backup.$(date +%Y%m%d_%H%M%S)
fi

# Extract new version
tar -xzf /tmp/hub-with-manager.tar.gz
rm /tmp/hub-with-manager.tar.gz

# Install dependencies
npm install --production

# Install hub manager service
cp manager/ai-hub-manager.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable ai-hub-manager.service

# Start services
systemctl start ai-hub-manager.service
systemctl start ai-hub.service

# Check status
systemctl status ai-hub-manager.service --no-pager
systemctl status ai-hub.service --no-pager
EOF

echo "Hub with Manager deployment complete!"
echo ""
echo "Hub Manager is now available at http://$HUB_IP:3081"
echo "  - POST /update with {\"version\": \"2.0.11\"} to update hub"
echo "  - GET /status to check hub status"
echo "  - POST /restart to restart hub"
echo ""
echo "Deployment finished!"