#!/bin/bash

# Deploy agents to all nodes
# This script builds locally and includes dist folder in deployment

VERSION=${1:-2.0.10}
echo "Deploying agents version: $VERSION"
echo "================================="

cd /Users/jeffk/Developement/provider-search/backend-ai

# Update version in package.json
echo "Updating agent version to $VERSION..."
sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" agent/package.json

# Build agent
echo "Building agent..."
cd agent
npm run build || exit 1

# Build manager if it exists
if [ -d manager ]; then
    echo "Building manager..."
    cd manager
    npm run build || exit 1
    cd ..
fi

# Create deployment package WITH dist folder
echo "Creating deployment package..."
tar -czf agent-$VERSION.tar.gz \
    dist \
    gui \
    assets \
    package.json \
    package-lock.json \
    $([ -d manager ] && echo "manager")

cd ..

echo ""
echo "Package created: agent/agent-$VERSION.tar.gz"
echo "Package includes compiled dist folder!"
echo ""

# Function to deploy to a node
deploy_to_node() {
    local HOST=$1
    local IP=$2
    echo -e "\n### Deploying to $HOST ($IP) ###"
    
    # Copy the package
    scp agent/agent-$VERSION.tar.gz root@$IP:/tmp/
    
    ssh root@$IP << EOF
# Remove PM2 if it exists
pm2 kill 2>/dev/null
npm uninstall -g pm2 2>/dev/null

# Stop services
systemctl stop ai-agent.service 2>/dev/null
systemctl stop ai-agent-manager.service 2>/dev/null
lsof -ti :3080 | xargs -r kill -9 2>/dev/null
lsof -ti :3081 | xargs -r kill -9 2>/dev/null
sleep 2

# Extract new version
mkdir -p /opt/ai-agent
cd /opt/ai-agent
tar -xzf /tmp/agent-$VERSION.tar.gz
rm /tmp/agent-$VERSION.tar.gz

# The dist folder is already in the package!
# No need to run npm run build on the node

# Install production dependencies only
npm install --production

# Setup systemd services...
# (rest of deployment continues)
EOF
}

echo "Key difference: We build ONCE locally and deploy the compiled code!"
echo "No more 'dist folder missing' errors!"