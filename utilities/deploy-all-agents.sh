#!/bin/bash

# Deploy agent 2.0.10 to all machines
VERSION="2.0.10"
echo "Deploying Backend AI Agent v$VERSION to all machines..."
echo "======================================================"

# Build agent if not already built
if [ ! -f "agent/agent-$VERSION.tar.gz" ]; then
    echo "Building agent v$VERSION..."
    cd agent
    npm run build
    tar -czf agent-$VERSION.tar.gz dist gui assets package.json package-lock.json
    cd ..
fi

# Function to deploy to a Linux host
deploy_linux() {
    local HOST=$1
    local IP=$2
    echo -e "\n### Deploying to $HOST ($IP) ###"
    
    # Copy deployment files
    scp agent/agent-$VERSION.tar.gz agent/manager/manager.js agent/manager/update-agent.sh root@$IP:/tmp/
    
    # Deploy via SSH
    ssh root@$IP << 'ENDSSH'
# Create directories
mkdir -p /opt/ai-agent/agent

# Stop existing services
systemctl stop ai-agent.service 2>/dev/null || true
systemctl stop ai-agent-manager.service 2>/dev/null || true

# Extract agent
cd /opt/ai-agent/agent
tar -xzf /tmp/agent-$VERSION.tar.gz
rm /tmp/agent-$VERSION.tar.gz

# Copy manager files
cp /tmp/manager.js /opt/ai-agent/
cp /tmp/update-agent.sh /opt/ai-agent/
chmod +x /opt/ai-agent/update-agent.sh
rm /tmp/manager.js /tmp/update-agent.sh

# Install dependencies
npm install --production

# Create .env file
cat > .env << EOF
PORT=3080
AGENT_ID=$HOST-agent
HUB_URL=http://192.168.1.30:3000
EOF

# Create agent service
cat > /etc/systemd/system/ai-agent.service << EOF
[Unit]
Description=Backend AI Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ai-agent/agent
ExecStart=/usr/bin/node dist/api/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ai-agent

[Install]
WantedBy=multi-user.target
EOF

# Create manager service
cat > /etc/systemd/system/ai-agent-manager.service << EOF
[Unit]
Description=AI Agent Manager
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ai-agent
ExecStart=/usr/bin/node manager.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ai-agent-manager

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and start services
systemctl daemon-reload
systemctl enable ai-agent.service ai-agent-manager.service
systemctl start ai-agent-manager.service
systemctl start ai-agent.service

# Check status
sleep 2
echo "Services status:"
systemctl is-active ai-agent-manager.service
systemctl is-active ai-agent.service
ENDSSH
    
    # Verify deployment
    sleep 3
    echo "Verifying deployment..."
    MANAGER_STATUS=$(curl -s http://$IP:3081/status 2>/dev/null | jq -r '.running' 2>/dev/null || echo "error")
    AGENT_VERSION=$(curl -s http://$IP:3080/api/status 2>/dev/null | jq -r '.version' 2>/dev/null || echo "error")
    
    echo "  Manager status: $MANAGER_STATUS"
    echo "  Agent version: $AGENT_VERSION"
}

# Deploy to unraid (special case)
deploy_unraid() {
    echo -e "\n### Deploying to unraid (192.168.1.10) ###"
    
    # For unraid, we need to handle the docker environment differently
    scp agent/agent-$VERSION.tar.gz deploy-agent-unraid-docker.sh root@192.168.1.10:/tmp/
    
    ssh root@192.168.1.10 << 'ENDSSH'
# Run the unraid deployment script
chmod +x /tmp/deploy-agent-unraid-docker.sh
/tmp/deploy-agent-unraid-docker.sh
rm /tmp/deploy-agent-unraid-docker.sh /tmp/agent-$VERSION.tar.gz
ENDSSH
    
    # Verify deployment
    sleep 5
    echo "Verifying unraid deployment..."
    AGENT_VERSION=$(curl -s http://192.168.1.10:3080/api/status 2>/dev/null | jq -r '.version' 2>/dev/null || echo "error")
    echo "  Agent version: $AGENT_VERSION"
}

# Deploy to all machines
deploy_linux "nginx" "192.168.1.2"
deploy_linux "pve1" "192.168.1.5"
deploy_linux "pve2" "192.168.1.6"
deploy_linux "pve3" "192.168.1.7"
deploy_unraid

echo -e "\n### Deployment Complete ###"
echo "Waiting for agents to register with hub..."
sleep 5

# Check final status
echo -e "\n### Final Status ###"
curl -s http://192.168.1.30/api/agents | jq -r '.agents[] | "\(.name): \(if .isOnline then "✅ ONLINE" else "❌ OFFLINE" end) v\(.version // "unknown")"'

echo -e "\n### Summary ###"
echo "All agents should now be:"
echo "  - Running version $VERSION"
echo "  - Have agent managers on port 3081"
echo "  - Be visible as green in the hub UI"
echo ""
echo "You can now use 'Start All Agents' and 'Stop All Agents' from the hamburger menu!"