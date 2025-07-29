#!/bin/bash

echo "Deploying Hub to 192.168.1.30..."

# Create tarball of hub code
cd /Users/jeffk/Developement/provider-search/backend-ai
tar -czf hub-deploy.tar.gz hub/

# Copy to hub server
scp hub-deploy.tar.gz root@192.168.1.30:/tmp/

# Deploy on hub server
ssh root@192.168.1.30 << 'EOF'
cd /opt/backend-ai

# Backup current hub
if [ -d hub ]; then
  mv hub hub.backup.$(date +%Y%m%d_%H%M%S)
fi

# Extract new hub
tar -xzf /tmp/hub-deploy.tar.gz

# Install dependencies
cd hub
npm install --production

# Build
npm run build

# Stop current hub
systemctl stop ai-hub.service 2>/dev/null || true

# Update systemd service to ensure PORT=80
if [ -f /etc/systemd/system/ai-hub.service ]; then
  sed -i 's/Environment="PORT=.*/Environment="PORT=80"/' /etc/systemd/system/ai-hub.service
else
  # Create systemd service if it doesn't exist
  cat > /etc/systemd/system/ai-hub.service << 'SERVICEEOF'
[Unit]
Description=Backend AI Hub
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/backend-ai/hub
ExecStart=/usr/bin/node /opt/backend-ai/hub/dist/api/index.js
Restart=always
RestartSec=10
Environment="NODE_ENV=production"
Environment="PORT=80"
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICEEOF
fi

systemctl daemon-reload

# Start hub
systemctl enable ai-hub.service
systemctl start ai-hub.service

# Check status
sleep 2
systemctl status ai-hub.service --no-pager

# Cleanup
rm /tmp/hub-deploy.tar.gz

echo "Hub deployment complete!"
EOF

# Cleanup local
rm hub-deploy.tar.gz

echo "Deployment finished!"