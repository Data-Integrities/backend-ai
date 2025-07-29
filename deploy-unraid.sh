#!/bin/bash
set -e

# Deploy to unraid only
echo "Deploying to unraid..."

# Build
echo "Building agent..."
cd agent
npm run build
cd ..

# Create package
echo "Creating deployment package..."
tar -czf worker-update.tar.gz -C agent dist package.json -C ../shared dist

# Deploy
echo "Deploying to unraid..."
scp worker-update.tar.gz root@192.168.1.10:/tmp/
ssh root@192.168.1.10 "cd /opt/ai-agent && /etc/rc.d/rc.ai-agent stop && tar -xzf /tmp/worker-update.tar.gz && /etc/rc.d/rc.ai-agent start && rm /tmp/worker-update.tar.gz"

# Cleanup
rm worker-update.tar.gz

echo "Unraid deployment complete!"