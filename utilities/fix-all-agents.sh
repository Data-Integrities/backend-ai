#!/bin/bash

echo "Fixing all agents to run version 2.0.10..."
echo "=========================================="

# Fix nginx (using PM2)
echo -e "\n### Fixing nginx ###"
ssh root@192.168.1.2 << 'EOF'
pm2 stop all 2>/dev/null
pm2 delete all 2>/dev/null
pkill -9 -f "node.*3080" 2>/dev/null
sleep 2
cd /opt/ai-agent/agent
pm2 start dist/api/index.js --name ai-agent
pm2 save
EOF

# Fix Proxmox hosts (using systemd with proper restart)
for host in pve1 pve2 pve3; do
    case $host in
        pve1) IP="192.168.1.5" ;;
        pve2) IP="192.168.1.6" ;;
        pve3) IP="192.168.1.7" ;;
    esac
    
    echo -e "\n### Fixing $host ###"
    ssh root@$IP << 'EOF'
# Stop service and kill any lingering processes
systemctl stop ai-agent.service
pkill -9 -f "node.*3080" 2>/dev/null
pkill -9 -f "node.*dist/api/index.js" 2>/dev/null
sleep 2

# Update the systemd service to use node directly
cat > /etc/systemd/system/ai-agent.service << 'EOSERVICE'
[Unit]
Description=Backend AI Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ai-agent/agent
ExecStart=/usr/bin/node /opt/ai-agent/agent/dist/api/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ai-agent

[Install]
WantedBy=multi-user.target
EOSERVICE

# Reload and start
systemctl daemon-reload
systemctl start ai-agent.service
EOF
done

# Fix unraid (Docker)
echo -e "\n### Fixing unraid ###"
ssh root@192.168.1.10 << 'EOF'
# Stop and remove old container
docker stop ai-agent 2>/dev/null
docker rm ai-agent 2>/dev/null
pkill -9 -f "node.*3080" 2>/dev/null
sleep 2

# Start fresh container
docker run -d \
    --name ai-agent \
    --restart unless-stopped \
    -p 3080:3080 \
    -e PORT=3080 \
    -e AGENT_ID=unraid-agent \
    -e HUB_URL=http://192.168.1.30:3000 \
    ai-agent:latest
EOF

echo -e "\n### Waiting for agents to start ###"
sleep 10

echo -e "\n### Final Status ###"
for host in nginx pve1 pve2 pve3 unraid; do
    STATUS=$(curl -s http://$host:3080/api/status 2>/dev/null | jq -r '.version' 2>/dev/null || echo "not responding")
    if [ "$STATUS" = "2.0.10" ]; then
        echo "$host: ✅ v$STATUS"
    else
        echo "$host: ❌ $STATUS"
    fi
done

echo -e "\n### Hub View ###"
curl -s http://192.168.1.30/api/agents | jq -r '.agents[] | "\(.name): \(if .isOnline then "✅" else "❌" end) v\(.version // "?")"'