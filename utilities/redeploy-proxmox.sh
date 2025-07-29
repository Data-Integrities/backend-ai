#!/bin/bash

echo "Redeploying agent 2.0.10 to Proxmox hosts..."
echo "==========================================="

# Build agent locally first
cd agent
npm run build
tar -czf agent-2.0.10-full.tar.gz dist gui assets package.json package-lock.json node_modules
cd ..

for host in pve1 pve2 pve3; do
    case $host in
        pve1) IP="192.168.1.5" ;;
        pve2) IP="192.168.1.6" ;;
        pve3) IP="192.168.1.7" ;;
    esac
    
    echo -e "\n### Deploying to $host ($IP) ###"
    
    # Copy the full package
    scp agent/agent-2.0.10-full.tar.gz root@$IP:/tmp/
    
    ssh root@$IP << 'EOF'
# Stop everything
systemctl stop ai-agent.service
pkill -9 -f "node.*3080" 2>/dev/null
sleep 2

# Clean and extract
cd /opt/ai-agent/agent
rm -rf dist node_modules
tar -xzf /tmp/agent-2.0.10-full.tar.gz
rm /tmp/agent-2.0.10-full.tar.gz

# Create proper systemd service
cat > /etc/systemd/system/ai-agent.service << 'EOSERVICE'
[Unit]
Description=Backend AI Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ai-agent/agent
Environment="PORT=3080"
Environment="AGENT_ID=%H-agent"
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

# Start service
systemctl daemon-reload
systemctl enable ai-agent.service
systemctl start ai-agent.service
EOF
    
    echo "Waiting for $host to start..."
    sleep 3
    
    # Verify
    VERSION=$(curl -s http://$IP:3080/api/status 2>/dev/null | jq -r '.version' 2>/dev/null || echo "error")
    echo "$host agent version: $VERSION"
done

# Clean up local file
rm -f agent/agent-2.0.10-full.tar.gz

echo -e "\n### Final Status ###"
curl -s http://192.168.1.30/api/agents | jq -r '.agents[] | "\(.name): \(if .isOnline then "✅" else "❌" end) v\(.version // "?")"'