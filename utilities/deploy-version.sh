#!/bin/bash

# Deploy a new version of hub and agent
# Usage: ./deploy-version.sh [version]

VERSION=${1:-$(date +%Y%m%d-%H%M%S)}
echo "Deploying version: $VERSION"

# Update version numbers
echo "Updating version numbers..."
cd /Users/jeffk/Developement/provider-search/backend-ai

# Update hub version
sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" hub/package.json

# Update agent version
sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" agent/package.json

# Build hub
echo "Building hub..."
cd hub
npm run build
tar -czf hub-$VERSION.tar.gz dist gui assets package.json package-lock.json VERSION_CONFIG.json
cd ..

# Build agent
echo "Building agent..."
cd agent
npm run build
tar -czf agent-$VERSION.tar.gz dist gui assets package.json package-lock.json
cd ..

# Upload to hub manager
echo "Uploading releases to hub manager..."
curl -X POST http://192.168.1.30:3081/releases/$VERSION/upload \
  -F "hub=@hub/hub-$VERSION.tar.gz" \
  -F "agent=@agent/agent-$VERSION.tar.gz" \
  -s | jq '.'

if [ $? -ne 0 ]; then
  echo "Failed to upload releases to hub manager"
  exit 1
fi

# Update hub via hub manager
echo "Updating hub to version $VERSION..."
ssh root@192.168.1.30 "curl -X POST http://localhost:3081/update \
  -H 'Content-Type: application/json' \
  -d '{\"version\": \"$VERSION\"}'"

# Wait for hub to restart
echo "Waiting for hub to restart..."
sleep 10

# Hub will update all agents automatically
echo "Hub will now update all connected agents to version $VERSION"

# Clean up local files
rm -f hub/hub-$VERSION.tar.gz agent/agent-$VERSION.tar.gz

echo ""
echo "Deployment complete!"
echo "Hub version: $VERSION"
echo "Agent version: $VERSION"
echo ""
echo "Check deployment status:"
echo "  curl http://192.168.1.30/api/agents | jq '.agents[] | {name, version}'"