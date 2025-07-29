#!/bin/bash

# Check if target host is provided
if [ $# -eq 0 ]; then
    echo "Usage: ./deploy-agent-proxmox.sh <hostname>"
    echo "Example: ./deploy-agent-proxmox.sh pve1"
    exit 1
fi

HOSTNAME=$1
USER=root
AGENT_DIR="/opt/ai-agent"

echo "Deploying AI Agent to Proxmox host $HOSTNAME..."

# Create tarball of agent with pre-built files
cd /Users/jeffk/Developement/provider-search/backend-ai
cd agent && npm run build && cd ..
tar -czf agent-deploy.tar.gz agent/

# Get IP from hostname using aliases
IP=$(grep "alias $HOSTNAME=" ~/.zsh/aliases.zsh | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)

if [ -z "$IP" ]; then
    echo "Error: Could not find IP for hostname $HOSTNAME"
    exit 1
fi

echo "Found IP: $IP for $HOSTNAME"

# Copy to target server
scp agent-deploy.tar.gz $USER@$IP:/tmp/

# Deploy on target server
ssh $USER@$IP << EOF
# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "Installing Node.js via apt..."
    apt-get update
    apt-get install -y nodejs npm
fi

# Create agent directory
mkdir -p $AGENT_DIR
cd $AGENT_DIR

# Extract new agent
tar -xzf /tmp/agent-deploy.tar.gz
cd agent

# Create .env file
cat > .env << 'ENVEOF'
PORT=3080
AGENT_ID=$HOSTNAME-agent
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-your-api-key}
ENVEOF

# Create simple start script
cat > start-agent.sh << 'STARTEOF'
#!/bin/bash
cd /opt/ai-agent/agent
while true; do
    node dist/api/index.js
    echo "Agent crashed, restarting in 5 seconds..."
    sleep 5
done
STARTEOF

chmod +x start-agent.sh

# Create systemd service
cat > /etc/systemd/system/ai-agent.service << 'SERVICEEOF'
[Unit]
Description=AI Agent for $HOSTNAME
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/ai-agent/agent
ExecStart=/opt/ai-agent/agent/start-agent.sh
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ai-agent
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
SERVICEEOF

# Stop existing agent if running
systemctl stop ai-agent 2>/dev/null || true

# Reload systemd and start agent
systemctl daemon-reload
systemctl enable ai-agent
systemctl start ai-agent

# Check status
sleep 2
systemctl status ai-agent --no-pager

# Test agent endpoint
echo "Testing agent at http://$IP:3080/api/status ..."
curl -s http://localhost:3080/api/status || echo "Agent not yet ready"

# Cleanup
rm /tmp/agent-deploy.tar.gz

echo "Agent deployment complete on $HOSTNAME!"
EOF

# Cleanup local
rm agent-deploy.tar.gz

echo "Deployment finished for $HOSTNAME!"