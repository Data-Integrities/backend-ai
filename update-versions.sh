#!/bin/bash

# Deploy script for Backend AI with version update
# Usage: ./deploy-version.sh [version]

if [ -z "$1" ]; then
    echo "Usage: ./deploy-version.sh [version]"
    echo "Example: ./deploy-version.sh 2.1.85"
    exit 1
fi

VERSION="$1"
echo "Deploying Backend AI version $VERSION"

# Update version in all package.json files
echo "Updating version to $VERSION..."
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" backend-ai-config.json
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" hub/package.json
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" agent/package.json
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" agent/manager/package.json
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" shared/package.json

# Update HTML version
HUB_VERSION="$VERSION"
sed -i.bak "s/<title>Backend AI Hub Control Panel (v[^)]*)<\/title>/<title>Backend AI Hub Control Panel (v${HUB_VERSION})<\/title>/" hub/gui/index.html

# Clean up backup files
rm -f backend-ai-config.json.bak hub/package.json.bak agent/package.json.bak agent/manager/package.json.bak shared/package.json.bak hub/gui/index.html.bak

echo "Version updated to $VERSION in all files"

# Run deploy-everything.sh
echo "Running deployment..."
./deploy-everything.sh

echo "Deployment complete for version $VERSION"