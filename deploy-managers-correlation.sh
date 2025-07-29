#!/bin/bash

# Deploy managers with correlationID support to all agents
echo "📦 Building agent/manager with correlationID support..."
cd /Users/jeffk/Developement/provider-search/backend-ai/agent
npm run build

# Create manager deployment package
echo "📦 Creating manager deployment package..."
cd manager
tar -czf ../../manager-correlation.tar.gz \
  index.ts \
  manager-unraid.ts \
  dist/

cd ../..

# Function to deploy manager
deploy_manager() {
    local agent_name=$1
    local agent_ip=$2
    local is_unraid=$3
    
    echo "🚀 Deploying manager to $agent_name ($agent_ip)..."
    
    scp manager-correlation.tar.gz root@$agent_ip:/tmp/
    
    if [ "$is_unraid" = "true" ]; then
        ssh root@$agent_ip << 'EOF'
cd /opt/ai-agent/agent/manager
tar -xzf /tmp/manager-correlation.tar.gz
rm /tmp/manager-correlation.tar.gz

# Restart manager
echo "Restarting Unraid manager..."
pkill -f "node.*manager-unraid" || true
sleep 1
cd /opt/ai-agent/agent/manager && nohup /usr/local/bin/node manager-unraid.js > /var/log/ai-agent-manager.log 2>&1 &

echo "✅ Manager deployed!"
EOF
    else
        ssh root@$agent_ip << 'EOF'
cd /opt/ai-agent/agent/manager
tar -xzf /tmp/manager-correlation.tar.gz
rm /tmp/manager-correlation.tar.gz

# Restart manager service
echo "Restarting manager service..."
systemctl restart ai-agent-manager

echo "✅ Manager deployed!"
systemctl status ai-agent-manager --no-pager | head -10
EOF
    fi
}

# Deploy to all agents
echo "🚀 Deploying managers to all agents..."

# Regular Linux agents
deploy_manager "pve1" "192.168.1.31" "false"
deploy_manager "pve2" "192.168.1.32" "false"
deploy_manager "pve3" "192.168.1.33" "false"
deploy_manager "pve4" "192.168.1.34" "false"
deploy_manager "pve5" "192.168.1.35" "false"
deploy_manager "nginx" "192.168.1.45" "false"
deploy_manager "docker" "192.168.1.48" "false"

# Unraid agent
deploy_manager "unraid" "192.168.1.44" "true"

# Cleanup
rm manager-correlation.tar.gz

echo "✅ All managers updated with correlationID support!"