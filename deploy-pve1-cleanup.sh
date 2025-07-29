#!/bin/bash

echo "🧹 Cleaning up and updating pve1 agent/manager..."

# Stop services first
echo "⏹️  Stopping services..."
ssh root@192.168.1.5 "systemctl stop ai-agent ai-agent-manager"

# Backup current configuration
echo "💾 Backing up current configuration..."
ssh root@192.168.1.5 "cp -r /opt/ai-agent /opt/ai-agent.backup.$(date +%Y%m%d_%H%M%S)"

# Remove old directories
echo "🗑️  Removing old agent directories..."
ssh root@192.168.1.5 "rm -rf /opt/ai-agent/web-agent /opt/ai-agent/web-agent.backup.* /opt/ai-agent/manager.js"

# Build latest versions
echo "🔨 Building latest agent and manager..."
cd agent
npm run build
cd ..

# Create deployment package with both agent and manager
echo "📦 Creating deployment package..."
rm -f agent-manager-update.tar.gz
tar -czf agent-manager-update.tar.gz \
  -C agent dist package.json \
  -C ../agent/manager dist package.json

# Deploy to pve1
echo "🚀 Deploying to pve1..."
scp agent-manager-update.tar.gz root@192.168.1.5:/tmp/

ssh root@192.168.1.5 << 'EOF'
cd /opt/ai-agent

# Extract agent files
echo "📦 Extracting agent..."
mkdir -p agent-new
cd agent-new
tar -xzf /tmp/agent-manager-update.tar.gz
cd ..

# Move agent files to correct location
rm -rf agent/dist agent/package.json
mv agent-new/dist agent/
mv agent-new/package.json agent/

# Extract and move manager files  
echo "📦 Extracting manager..."
mkdir -p manager-new
cd manager-new
tar -xzf /tmp/agent-manager-update.tar.gz dist package.json
cd ..

# Move manager files to correct location
rm -rf manager/dist manager/package.json
mv manager-new/dist manager/
mv manager-new/package.json manager/

# Cleanup
rm -rf agent-new manager-new
rm /tmp/agent-manager-update.tar.gz

# Install dependencies if needed
cd agent && npm install --production
cd ../manager && npm install --production

echo "✅ Files updated"
EOF

# Start services
echo "▶️  Starting services..."
ssh root@192.168.1.5 "systemctl start ai-agent-manager && sleep 2 && systemctl start ai-agent"

# Verify
echo "✅ Verifying installation..."
ssh root@192.168.1.5 "systemctl status ai-agent-manager --no-pager | head -10"
ssh root@192.168.1.5 "systemctl status ai-agent --no-pager | head -10"

echo ""
echo "🎉 pve1 cleanup and update complete!"
echo "Agent version: 2.0.20"
echo "Manager version: 2.0.19"

# Cleanup local file
rm -f agent-manager-update.tar.gz