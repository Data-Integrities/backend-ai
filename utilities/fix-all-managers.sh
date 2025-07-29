#!/bin/bash

echo "Fixing agent managers on all nodes..."
echo "===================================="

# Function to fix agent manager on a host
fix_manager() {
    local HOST=$1
    local IP=$2
    echo -e "\n### Fixing manager on $HOST ($IP) ###"
    
    ssh root@$IP << 'EOF'
# Kill any process on port 3081
lsof -ti :3081 | xargs -r kill -9
sleep 2

# Fix the systemd service to use correct path
if [ -f /opt/ai-agent/manager/dist/index.js ]; then
    # Update service file
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

    # Reload and start
    systemctl daemon-reload
    systemctl enable ai-agent-manager.service
    systemctl restart ai-agent-manager.service
    
    # Also fix agent service
    systemctl restart ai-agent.service
    
    echo "Manager fixed and started"
else
    echo "Manager not found, skipping"
fi
EOF
}

# Fix all Linux hosts
fix_manager "nginx" "192.168.1.2"
fix_manager "pve1" "192.168.1.5"
fix_manager "pve2" "192.168.1.6"
fix_manager "pve3" "192.168.1.7"

# For unraid, install native agent (no Docker)
echo -e "\n### Installing native agent on unraid ###"
ssh root@192.168.1.10 << 'EOF'
# Stop and remove Docker container
docker stop ai-agent 2>/dev/null
docker rm ai-agent 2>/dev/null

# Kill any node processes on ports 3080/3081
lsof -ti :3080 | xargs -r kill -9
lsof -ti :3081 | xargs -r kill -9
sleep 2

# Create directory
mkdir -p /mnt/user/appdata/ai-agent
cd /mnt/user/appdata/ai-agent

echo "Unraid setup prepared. Agent files need to be deployed."
EOF

# Deploy agent to unraid
echo "Deploying agent to unraid..."
scp -r agent/dist agent/gui agent/assets agent/package*.json root@192.168.1.10:/mnt/user/appdata/ai-agent/
scp -r agent/manager root@192.168.1.10:/mnt/user/appdata/ai-agent/

ssh root@192.168.1.10 << 'EOF'
cd /mnt/user/appdata/ai-agent

# Install dependencies
npm install --production

# Create startup script for unraid
cat > /boot/config/go << 'EOGO' 
#!/bin/bash
# Start AI Agent
cd /mnt/user/appdata/ai-agent
/usr/local/bin/node manager/dist/index.js > /var/log/ai-agent-manager.log 2>&1 &
/usr/local/bin/node dist/api/index.js > /var/log/ai-agent.log 2>&1 &
EOGO

# Start services now
cd /mnt/user/appdata/ai-agent
nohup /usr/local/bin/node manager/dist/index.js > /var/log/ai-agent-manager.log 2>&1 &
nohup /usr/local/bin/node dist/api/index.js > /var/log/ai-agent.log 2>&1 &

echo "Unraid agent started"
EOF

echo -e "\n### Waiting for services to start ###"
sleep 10

# Final status check
echo -e "\n### Final Manager Status ###"
for host in nginx pve1 pve2 pve3 unraid; do
    case $host in
        nginx) IP="192.168.1.2" ;;
        pve1) IP="192.168.1.5" ;;
        pve2) IP="192.168.1.6" ;;
        pve3) IP="192.168.1.7" ;;
        unraid) IP="192.168.1.10" ;;
    esac
    
    MANAGER=$(curl -s http://$IP:3081/status 2>/dev/null | jq -r '.running' 2>/dev/null || echo "no-manager")
    AGENT=$(curl -s http://$IP:3080/api/status 2>/dev/null | jq -r '.version' 2>/dev/null || echo "offline")
    
    echo "$host: Manager=$MANAGER, Agent=$AGENT"
done

echo -e "\n### Hub View ###"
curl -s http://192.168.1.30/api/agents | jq -r '.agents[] | "\(.name): \(if .isOnline then "✅" else "❌" end) v\(.version // "?")"'