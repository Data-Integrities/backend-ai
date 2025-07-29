#!/bin/bash

echo "Deploying complete agent with manager to all nodes..."
echo "==================================================="

# First, build the package
echo "Building agent package..."
./build-agent-package.sh 2.0.10
if [ ! -f agent/agent-complete-2.0.10.tar.gz ]; then
    echo "ERROR: Failed to build agent package"
    exit 1
fi
mv agent/agent-complete-2.0.10.tar.gz .

# Function to deploy to a node
deploy_to_node() {
    local HOST=$1
    local IP=$2
    echo -e "\n### Deploying to $HOST ($IP) ###"
    
    # Copy the package
    scp agent-complete-2.0.10.tar.gz root@$IP:/tmp/
    
    ssh root@$IP << 'EOF'
# Stop everything
systemctl stop ai-agent.service 2>/dev/null
systemctl stop ai-agent-manager.service 2>/dev/null
lsof -ti :3080 | xargs -r kill -9 2>/dev/null
lsof -ti :3081 | xargs -r kill -9 2>/dev/null
sleep 2

# Create directory and extract
mkdir -p /opt/ai-agent/agent
cd /opt/ai-agent/agent
tar -xzf /tmp/agent-complete-2.0.10.tar.gz
rm /tmp/agent-complete-2.0.10.tar.gz

# Move manager to parent directory
if [ -d manager ]; then
    mv manager /opt/ai-agent/
fi

# Install dependencies
npm install --production

# Create agent service
cat > /etc/systemd/system/ai-agent.service << 'EOSERVICE'
[Unit]
Description=Backend AI Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ai-agent/agent
Environment="PORT=3080"
Environment="AGENT_ID=$HOSTNAME-agent"
Environment="HUB_URL=http://192.168.1.30:3000"
ExecStart=/usr/bin/node /opt/ai-agent/agent/dist/api/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ai-agent

[Install]
WantedBy=multi-user.target
EOSERVICE

# Create manager service
cat > /etc/systemd/system/ai-agent-manager.service << 'EOSERVICE'
[Unit]
Description=AI Agent Manager
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ai-agent/manager
ExecStart=/usr/bin/node /opt/ai-agent/manager/dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ai-agent-manager

[Install]
WantedBy=multi-user.target
EOSERVICE

# Enable and start services
systemctl daemon-reload
systemctl enable ai-agent-manager.service ai-agent.service
systemctl start ai-agent-manager.service
systemctl start ai-agent.service

echo "Deployment complete"
EOF
}

# Deploy to all nodes except nginx (already has it)
deploy_to_node "pve1" "192.168.1.5"
deploy_to_node "pve2" "192.168.1.6"
deploy_to_node "pve3" "192.168.1.7"

# Special handling for unraid - native install
echo -e "\n### Deploying to unraid (192.168.1.10) ###"
scp agent-complete-2.0.10.tar.gz root@192.168.1.10:/tmp/

ssh root@192.168.1.10 << 'EOF'
# Stop Docker container if exists
docker stop ai-agent 2>/dev/null
docker rm ai-agent 2>/dev/null

# Kill existing processes
pkill -f "node.*3080" 2>/dev/null
pkill -f "node.*3081" 2>/dev/null
sleep 2

# Create directory
mkdir -p /mnt/user/appdata/ai-agent
cd /mnt/user/appdata/ai-agent

# Extract
tar -xzf /tmp/agent-complete-2.0.10.tar.gz
rm /tmp/agent-complete-2.0.10.tar.gz

# Install node if not present
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    cd /tmp
    wget https://nodejs.org/dist/v18.19.0/node-v18.19.0-linux-x64.tar.xz
    tar -xf node-v18.19.0-linux-x64.tar.xz
    cp -r node-v18.19.0-linux-x64/{bin,lib,share} /usr/local/
    rm -rf node-v18.19.0-linux-x64*
fi

cd /mnt/user/appdata/ai-agent

# Install dependencies
/usr/local/bin/npm install --production

# Create startup script
cat > /boot/config/plugins/user.scripts/scripts/ai-agent/script << 'EOSCRIPT'
#!/bin/bash
# AI Agent startup script
cd /mnt/user/appdata/ai-agent

# Start manager
PORT=3081 /usr/local/bin/node manager/dist/index.js > /var/log/ai-agent-manager.log 2>&1 &
echo $! > /var/run/ai-agent-manager.pid

# Start agent
PORT=3080 AGENT_ID=unraid-agent HUB_URL=http://192.168.1.30:3000 /usr/local/bin/node dist/api/index.js > /var/log/ai-agent.log 2>&1 &
echo $! > /var/run/ai-agent.pid
EOSCRIPT

chmod +x /boot/config/plugins/user.scripts/scripts/ai-agent/script

# Start now
cd /mnt/user/appdata/ai-agent
PORT=3081 nohup /usr/local/bin/node manager/dist/index.js > /var/log/ai-agent-manager.log 2>&1 &
PORT=3080 AGENT_ID=unraid-agent HUB_URL=http://192.168.1.30:3000 nohup /usr/local/bin/node dist/api/index.js > /var/log/ai-agent.log 2>&1 &

echo "Unraid agent deployed"
EOF

# Also fix nginx manager
echo -e "\n### Fixing nginx manager ###"
ssh root@192.168.1.2 "systemctl restart ai-agent-manager && systemctl restart ai-agent"

# Clean up
rm -f agent-complete-2.0.10.tar.gz

echo -e "\n### Waiting for services to start ###"
sleep 15

# Final check
echo -e "\n### Final Status ###"
for host in nginx pve1 pve2 pve3 unraid; do
    case $host in
        nginx) IP="192.168.1.2" ;;
        pve1) IP="192.168.1.5" ;;
        pve2) IP="192.168.1.6" ;;
        pve3) IP="192.168.1.7" ;;
        unraid) IP="192.168.1.10" ;;
    esac
    
    MANAGER=$(curl -s http://$IP:3081/status 2>/dev/null | jq -r '.running' 2>/dev/null || echo "offline")
    AGENT=$(curl -s http://$IP:3080/api/status 2>/dev/null | jq -r '.version' 2>/dev/null || echo "offline")
    
    if [ "$AGENT" = "2.0.10" ] && [ "$MANAGER" = "true" ]; then
        echo "$host: ✅ Agent=$AGENT, Manager=$MANAGER"
    else
        echo "$host: ❌ Agent=$AGENT, Manager=$MANAGER"
    fi
done

echo -e "\n### Hub View ###"
curl -s http://192.168.1.30/api/agents | jq -r '.agents[] | "\(.name): \(if .isOnline then "✅" else "❌" end) v\(.version // "?")"'