#!/bin/bash

# Check if target host is provided
if [ $# -eq 0 ]; then
    echo "Usage: ./deploy-agent-simple.sh <hostname>"
    echo "Example: ./deploy-agent-simple.sh pve1"
    exit 1
fi

HOSTNAME=$1
USER=root
AGENT_DIR="/opt/ai-agent"

echo "Deploying AI Agent (simple version) to $HOSTNAME..."

# Build the agent locally
cd /Users/jeffk/Developement/provider-search/backend-ai/web-agent
npm run build

# Create a minimal deployment package with just the built files
cd ..
mkdir -p agent-minimal/dist
cp -r web-agent/dist/* agent-minimal/dist/
cp -r web-agent/public agent-minimal/
cp web-agent/package.json agent-minimal/

# Create a simple run script that doesn't need npm
cat > agent-minimal/run-agent.sh << 'EOF'
#!/bin/bash
cd /opt/ai-agent

# Check if node exists
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed on this system"
    echo "The agent cannot run without Node.js"
    echo "Please install Node.js when the system has internet access"
    exit 1
fi

# Set environment variables
export PORT=3080
export AGENT_ID=$(hostname)-agent
export NODE_ENV=production

# Run the agent
exec node dist/index.js
EOF

chmod +x agent-minimal/run-agent.sh

# Create tarball
tar -czf agent-minimal.tar.gz agent-minimal/

# Get IP from hostname using aliases
IP=$(grep "alias $HOSTNAME=" ~/.zsh/aliases.zsh | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)

if [ -z "$IP" ]; then
    echo "Error: Could not find IP for hostname $HOSTNAME"
    exit 1
fi

echo "Found IP: $IP for $HOSTNAME"

# Copy to target server
scp agent-minimal.tar.gz $USER@$IP:/tmp/

# Deploy on target server
ssh $USER@$IP << EOF
# Create agent directory
mkdir -p $AGENT_DIR
cd $AGENT_DIR

# Remove old agent if exists
rm -rf agent-minimal

# Extract new agent
tar -xzf /tmp/agent-minimal.tar.gz
cd agent-minimal

# Create systemd service
cat > /etc/systemd/system/ai-agent-simple.service << 'SERVICEEOF'
[Unit]
Description=AI Agent for $HOSTNAME (Simple)
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/ai-agent/agent-minimal
ExecStart=/opt/ai-agent/agent-minimal/run-agent.sh
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ai-agent
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
SERVICEEOF

# Stop existing services if running
systemctl stop ai-agent 2>/dev/null || true
systemctl stop ai-agent-simple 2>/dev/null || true

# Reload systemd and start agent
systemctl daemon-reload
systemctl enable ai-agent-simple
systemctl start ai-agent-simple

# Check status
sleep 2
systemctl status ai-agent-simple --no-pager

# Check if node is available
if command -v node &> /dev/null; then
    echo "Node.js is installed, agent should be running"
    sleep 3
    curl -s http://localhost:3080/api/status || echo "Agent may still be starting..."
else
    echo ""
    echo "WARNING: Node.js is not installed on this system!"
    echo "The agent service is configured but cannot run without Node.js"
    echo "Install Node.js when internet access is available with:"
    echo "  apt-get update && apt-get install -y nodejs"
    echo "Then restart the agent with:"
    echo "  systemctl restart ai-agent-simple"
fi

# Cleanup
rm /tmp/agent-minimal.tar.gz

echo "Agent deployment complete on $HOSTNAME!"
EOF

# Cleanup local
rm -rf agent-minimal agent-minimal.tar.gz

echo "Deployment finished for $HOSTNAME!"