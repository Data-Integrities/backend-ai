#!/bin/bash

# Native Unraid Agent Deployment (Non-Docker)
# This installs the agent to persist across reboots

if [ $# -eq 0 ]; then
    echo "Usage: ./deploy-unraid-native.sh <hostname>"
    echo "Example: ./deploy-unraid-native.sh unraid"
    exit 1
fi

HOSTNAME=$1
USER=root

echo "Deploying Native AI Agent to Unraid (persistent installation)..."

# Get IP from hostname
IP=$(grep "alias $HOSTNAME=" ~/.zsh/aliases.zsh | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)

if [ -z "$IP" ]; then
    echo "Error: Could not find IP for hostname $HOSTNAME"
    exit 1
fi

echo "Found IP: $IP for $HOSTNAME"

# Build the agent
echo "Building agent..."
cd agent && npm run build && cd ..

# Create deployment package with Node.js binary
echo "Creating deployment package..."
mkdir -p /tmp/unraid-native-deploy

# Download Node.js binary for Linux x64 if not cached
NODE_VERSION="v20.11.1"
NODE_BINARY="node-${NODE_VERSION}-linux-x64"
if [ ! -f "/tmp/${NODE_BINARY}.tar.xz" ]; then
    echo "Downloading Node.js binary..."
    curl -L "https://nodejs.org/dist/${NODE_VERSION}/${NODE_BINARY}.tar.xz" \
         -o "/tmp/${NODE_BINARY}.tar.xz"
fi

# Extract Node binary
cd /tmp/unraid-native-deploy
tar -xf "/tmp/${NODE_BINARY}.tar.xz"
cp "${NODE_BINARY}/bin/node" ./

# Copy agent files
cp -r "$OLDPWD/agent/dist" ./
cp "$OLDPWD/agent/package.json" ./

# Create minimal node_modules with production deps
mkdir -p node_modules
cd "$OLDPWD"
npm pack agent --pack-destination /tmp/unraid-native-deploy/

# Create tarball
cd /tmp/unraid-native-deploy
tar -czf agent-native.tar.gz node dist package.json node_modules

# Copy to Unraid
echo "Copying to Unraid..."
scp agent-native.tar.gz $USER@$IP:/tmp/

# Deploy on Unraid
ssh $USER@$IP << 'REMOTE_SCRIPT'
#!/bin/bash

echo "Installing native agent on Unraid..."

# Stop Docker agent if running
docker stop ai-agent 2>/dev/null && echo "Stopped Docker agent"
docker rm ai-agent 2>/dev/null

# Create persistent directories
mkdir -p /boot/extra/ai-agent
mkdir -p /mnt/user/appdata/ai-agent

# Extract agent to USB
cd /boot/extra/ai-agent
tar -xzf /tmp/agent-native.tar.gz

# Create startup script
cat > /boot/extra/ai-agent/start-agent.sh << 'STARTUP'
#!/bin/bash
# AI Agent Startup Script for Unraid

AGENT_DIR="/boot/extra/ai-agent"
LOG_FILE="/mnt/user/appdata/ai-agent/agent.log"

# Ensure log directory exists
mkdir -p /mnt/user/appdata/ai-agent

# Kill any existing agent processes
pkill -f "ai-agent/node" 2>/dev/null

# Start agent
cd "$AGENT_DIR"
export PORT=3080
export AGENT_ID=unraid-agent
export HUB_URL=http://192.168.1.30
export NODE_ENV=production

echo "Starting AI Agent at $(date)" >> "$LOG_FILE"
nohup ./node dist/api/index.js >> "$LOG_FILE" 2>&1 &
echo $! > /var/run/ai-agent.pid

echo "AI Agent started with PID $(cat /var/run/ai-agent.pid)"
STARTUP

chmod +x /boot/extra/ai-agent/start-agent.sh

# Add to go script if not already there
if ! grep -q "ai-agent/start-agent.sh" /boot/config/go; then
    echo "" >> /boot/config/go
    echo "# Start AI Agent" >> /boot/config/go
    echo "/boot/extra/ai-agent/start-agent.sh" >> /boot/config/go
    echo "Added AI Agent to boot script"
fi

# Install production dependencies
cd /boot/extra/ai-agent
./node -e "
const deps = require('./package.json').dependencies;
const needed = ['express', 'axios', 'dotenv', 'systeminformation', 'uuid'];
console.log('Installing:', needed.join(', '));
"

# For now, copy minimal deps from Docker image
docker run --rm -v /boot/extra/ai-agent:/out node:18-alpine sh -c '
cd /tmp
npm init -y
npm install express@4.18.2 axios@1.4.0 dotenv@16.0.3 systeminformation@5.18.0 uuid@9.0.0 --production
cp -r node_modules /out/
'

# Start the agent now
/boot/extra/ai-agent/start-agent.sh

# Wait and test
sleep 5
curl -s http://localhost:3080/api/status | grep version

# Clean up
rm /tmp/agent-native.tar.gz

echo "Native agent installation complete!"
echo "Agent files: /boot/extra/ai-agent/"
echo "Logs: /mnt/user/appdata/ai-agent/agent.log"
echo "Will auto-start on boot via /boot/config/go"
REMOTE_SCRIPT

# Clean up local files
rm -rf /tmp/unraid-native-deploy

echo "Done! Native agent should be running at http://$IP:3080"