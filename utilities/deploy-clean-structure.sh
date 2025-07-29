#!/bin/bash

echo "🚀 Deploying clean Backend AI structure..."

# Build the projects first
echo "Building Agent..."
cd clean-structure/agent
npm install
npm run build

echo "Building Hub..."
cd ../hub
npm install
npm run build

cd ../..

# Create deployment packages
echo "Creating deployment packages..."
tar -czf agent-deploy.tar.gz -C clean-structure agent
tar -czf hub-deploy.tar.gz -C clean-structure hub

echo "✅ Deployment packages ready!"
echo ""
echo "To deploy:"
echo ""
echo "1. Deploy Hub to 192.168.1.30:"
echo "   scp hub-deploy.tar.gz jeffk@192.168.1.30:/tmp/"
echo "   ssh jeffk@192.168.1.30"
echo "   cd /home/jeffk/dev/provider-search/backend-ai"
echo "   sudo tar -xzf /tmp/hub-deploy.tar.gz"
echo "   sudo systemctl restart ai-hub"
echo ""
echo "2. Deploy Agent to nginx (192.168.1.2):"
echo "   scp agent-deploy.tar.gz user@192.168.1.2:/tmp/"
echo "   ssh user@192.168.1.2"
echo "   cd /path/to/agent"
echo "   tar -xzf /tmp/agent-deploy.tar.gz"
echo "   # Copy appropriate README:"
echo "   cp agent/examples/README-nginx.md agent/AGENT_README.md"
echo "   # Start with PM2:"
echo "   pm2 restart nginx-agent || pm2 start agent/dist/index.js --name nginx-agent"
echo ""
echo "3. Deploy Agent to Proxmox hosts (192.168.1.5, .6, .7):"
echo "   # Similar process but use README-proxmox-host.md"