#!/bin/bash

# Check if target host is provided
if [ $# -eq 0 ]; then
    echo "Usage: ./deploy-agent.sh <hostname> [user]"
    echo "Example: ./deploy-agent.sh nginx root"
    echo "Example: ./deploy-agent.sh mongo jeffk"
    exit 1
fi

HOSTNAME=$1
USER=${2:-root}
AGENT_DIR="/opt/ai-agent"

echo "Deploying AI Agent to $HOSTNAME as $USER..."

# Create tarball of agent
cd /Users/jeffk/Developement/provider-search/backend-ai
tar -czf agent-deploy.tar.gz agent/ shared/

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
# Create agent directory
if [ "$USER" != "root" ]; then
    echo "horse123" | sudo -S mkdir -p $AGENT_DIR
    echo "horse123" | sudo -S chown $USER:$USER $AGENT_DIR
else
    mkdir -p $AGENT_DIR
fi

cd $AGENT_DIR

# Backup current agent if exists
if [ -d agent ]; then
  mv agent agent.backup.\$(date +%Y%m%d_%H%M%S)
fi

# Extract new agent
tar -xzf /tmp/agent-deploy.tar.gz
cd agent

# Create .env file
cat > .env << 'ENVEOF'
PORT=3080
AGENT_ID=$HOSTNAME-agent
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-your-api-key}
ENVEOF

# Install dependencies and build
npm install
npm run build

# Install jq if not already installed
if ! command -v jq &> /dev/null; then
    echo "Installing jq..."
    if [ "$USER" != "root" ]; then
        echo "horse123" | sudo -S apt-get update && echo "horse123" | sudo -S apt-get install -y jq
    else
        apt-get update && apt-get install -y jq
    fi
fi

# Install PM2 if not already installed
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    if [ "$USER" != "root" ]; then
        echo "horse123" | sudo -S npm install -g pm2
    else
        npm install -g pm2
    fi
fi

# Build TypeScript
npm run build

# Create ecosystem file
cat > ecosystem.config.js << 'ECOEOF'
module.exports = {
  apps: [{
    name: 'ai-agent',
    script: './dist/index.js',
    env: {
      PORT: 3080,
      NODE_ENV: 'production'
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    restart_delay: 3000,
    max_restarts: 10
  }]
};
ECOEOF

# Create logs directory
mkdir -p logs

# Stop existing agent if running
pm2 stop ai-agent 2>/dev/null || true
pm2 delete ai-agent 2>/dev/null || true

# Start agent with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 startup
if [ "$USER" != "root" ]; then
    echo "horse123" | sudo -S env PATH=\$PATH:/usr/bin pm2 startup systemd -u $USER --hp /home/$USER
else
    pm2 startup systemd -u root --hp /root
fi

# Check status
sleep 2
pm2 status

# Test agent endpoint
echo "Testing agent at http://$IP:3080/api/status ..."
curl -s http://localhost:3080/api/status | jq '.'

# Cleanup
rm /tmp/agent-deploy.tar.gz

echo "Agent deployment complete on $HOSTNAME!"
EOF

# Cleanup local
rm agent-deploy.tar.gz

echo "Deployment finished for $HOSTNAME!"