#!/bin/bash

# Deploy agent 2.0.10 with manager, removing PM2
VERSION="2.0.10"
echo "Deploying Backend AI Agent v$VERSION with Manager..."
echo "=================================================="

# Build agent locally
cd agent
npm run build
tar -czf agent-$VERSION.tar.gz dist gui assets package.json package-lock.json
cd ..

# Function to deploy to Linux host with manager
deploy_with_manager() {
    local HOST=$1
    local IP=$2
    echo -e "\n### Deploying to $HOST ($IP) ###"
    
    # Copy files
    scp agent/agent-$VERSION.tar.gz root@$IP:/tmp/
    
    # Deploy and install manager
    ssh root@$IP << 'ENDSSH'
# Stop and remove PM2 if present
if command -v pm2 &> /dev/null; then
    echo "Removing PM2 processes..."
    pm2 stop all 2>/dev/null || true
    pm2 delete all 2>/dev/null || true
    pm2 kill 2>/dev/null || true
fi

# Stop existing services
systemctl stop ai-agent.service 2>/dev/null || true
systemctl stop ai-agent-manager.service 2>/dev/null || true

# Kill any lingering processes
pkill -9 -f "node.*3080" 2>/dev/null || true
pkill -9 -f "node.*3081" 2>/dev/null || true
sleep 2

# Create directory structure
mkdir -p /opt/ai-agent/agent

# Extract agent
cd /opt/ai-agent/agent
rm -rf dist  # Remove old compiled code
tar -xzf /tmp/agent-$VERSION.tar.gz
rm /tmp/agent-$VERSION.tar.gz

# Install dependencies
npm install --production

# Create .env file
cat > .env << EOF
PORT=3080
AGENT_ID=$HOST-agent
HUB_URL=http://192.168.1.30:3000
EOF

# Create agent manager
cat > /opt/ai-agent/manager.js << 'EOF'
#!/usr/bin/env node

const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);
const app = express();
const PORT = 3081;

app.use(express.json());

// Status endpoint
app.get('/status', async (req, res) => {
    try {
        const { stdout } = await execAsync('systemctl is-active ai-agent.service');
        res.json({ running: stdout.trim() === 'active' });
    } catch (error) {
        res.json({ running: false });
    }
});

// Start agent
app.post('/start', async (req, res) => {
    try {
        await execAsync('systemctl start ai-agent.service');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Stop agent
app.post('/stop', async (req, res) => {
    try {
        await execAsync('systemctl stop ai-agent.service');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Restart agent
app.post('/restart', async (req, res) => {
    try {
        await execAsync('systemctl restart ai-agent.service');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update agent
app.post('/update', async (req, res) => {
    const { version } = req.body;
    if (!version) {
        return res.status(400).json({ success: false, error: 'Version required' });
    }
    
    try {
        await execAsync(`/opt/ai-agent/update-agent.sh ${version}`);
        res.json({ success: true, message: `Update to version ${version} started` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get logs
app.get('/logs', async (req, res) => {
    try {
        const lines = parseInt(req.query.lines) || 100;
        const { stdout } = await execAsync(`journalctl -u ai-agent.service -n ${lines} --no-pager`);
        res.json({ logs: stdout, lines });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Agent Manager listening on port ${PORT}`);
});
EOF

# Create update script
cat > /opt/ai-agent/update-agent.sh << 'EOF'
#!/bin/bash
VERSION=$1
NAS_URL="http://192.168.1.10:8888"
AGENT_URL="$NAS_URL/api/raw/$VERSION/agent-$VERSION.tar.gz"

echo "Downloading agent version $VERSION..."
cd /tmp
curl -sL "$AGENT_URL" -o agent-update.tar.gz || exit 1

if [ ! -s agent-update.tar.gz ]; then
    echo "Download failed"
    exit 1
fi

cd /opt/ai-agent/agent
mv dist dist.backup.$(date +%Y%m%d_%H%M%S)
tar -xzf /tmp/agent-update.tar.gz
rm /tmp/agent-update.tar.gz

systemctl restart ai-agent.service
echo "Update complete"
EOF
chmod +x /opt/ai-agent/update-agent.sh

# Create agent service
cat > /etc/systemd/system/ai-agent.service << 'EOF'
[Unit]
Description=Backend AI Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ai-agent/agent
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node /opt/ai-agent/agent/dist/api/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ai-agent

[Install]
WantedBy=multi-user.target
EOF

# Create manager service
cat > /etc/systemd/system/ai-agent-manager.service << 'EOF'
[Unit]
Description=AI Agent Manager
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ai-agent
ExecStart=/usr/bin/node /opt/ai-agent/manager.js
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
systemctl enable ai-agent-manager.service ai-agent.service
systemctl start ai-agent-manager.service
systemctl start ai-agent.service

# Check status
sleep 3
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

# Deploy to all machines
deploy_with_manager "nginx" "192.168.1.2"
deploy_with_manager "pve1" "192.168.1.5"
deploy_with_manager "pve2" "192.168.1.6"
deploy_with_manager "pve3" "192.168.1.7"

# Special handling for unraid
echo -e "\n### Deploying to unraid ###"
ssh root@192.168.1.10 << 'EOF'
# Stop old container and processes
docker stop ai-agent 2>/dev/null || true
docker rm ai-agent 2>/dev/null || true
pkill -9 -f "node.*3080" 2>/dev/null || true
sleep 2

# Create fresh container with proper environment
docker run -d \
    --name ai-agent \
    --restart unless-stopped \
    -p 3080:3080 \
    -p 3081:3081 \
    -e PORT=3080 \
    -e AGENT_ID=unraid-agent \
    -e HUB_URL=http://192.168.1.30:3000 \
    -v /mnt/user/appdata/ai-agent:/opt/ai-agent/data \
    ai-agent:latest
EOF

# Clean up
rm -f agent/agent-$VERSION.tar.gz

echo -e "\n### Deployment Complete ###"
sleep 10

# Final status
echo -e "\n### Final Status ###"
for host in nginx pve1 pve2 pve3 unraid; do
    case $host in
        nginx) IP="192.168.1.2" ;;
        pve1) IP="192.168.1.5" ;;
        pve2) IP="192.168.1.6" ;;
        pve3) IP="192.168.1.7" ;;
        unraid) IP="192.168.1.10" ;;
    esac
    
    AGENT_STATUS=$(curl -s http://$IP:3080/api/status 2>/dev/null | jq -r '.version' 2>/dev/null || echo "offline")
    MANAGER_STATUS=$(curl -s http://$IP:3081/status 2>/dev/null | jq -r '.running' 2>/dev/null || echo "no-manager")
    
    if [ "$AGENT_STATUS" = "$VERSION" ]; then
        echo "$host: ✅ Agent v$AGENT_STATUS, Manager: $MANAGER_STATUS"
    else
        echo "$host: ❌ Agent: $AGENT_STATUS, Manager: $MANAGER_STATUS"
    fi
done

echo -e "\n### Hub View ###"
curl -s http://192.168.1.30/api/agents | jq -r '.agents[] | "\(.name): \(if .isOnline then "✅ ONLINE" else "❌ OFFLINE" end) v\(.version // "unknown")"'

echo -e "\n### All agents should now: ###"
echo "  - Be running version $VERSION"
echo "  - Have agent managers on port 3081"
echo "  - Show as green in the hub UI"
echo "  - Work with 'Start All' and 'Stop All' commands"