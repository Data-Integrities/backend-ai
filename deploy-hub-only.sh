#!/bin/bash
set -e

VERSION=${1:-"2.1.34"}

echo "Deploying Hub Only - Version $VERSION"

# Build hub
echo "Building hub..."
cd hub
npm run build
cd ..

# Create deployment package
echo "Creating deployment package..."
tar -czf hub-update.tar.gz -C hub dist gui api package.json

# Deploy to hub
echo "Deploying to hub..."
ssh root@192.168.1.30 "cd /opt/backend-ai/hub && systemctl stop ai-hub && tar -xzf - && systemctl start ai-hub" < hub-update.tar.gz

# Cleanup
rm hub-update.tar.gz

echo "Hub deployment complete!"