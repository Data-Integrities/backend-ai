#!/bin/bash

# Build complete agent package with dist folder included
VERSION=${1:-2.0.10}

echo "Building complete agent package v$VERSION..."
echo "========================================"

cd /Users/jeffk/Developement/provider-search/backend-ai

# Build agent
echo "Building agent..."
cd agent
npm run build || exit 1

# Build manager
echo "Building manager..."
cd manager
npm run build || exit 1
cd ..

# Create package with dist folders
echo "Creating agent-complete-$VERSION.tar.gz..."
tar -czf agent-complete-$VERSION.tar.gz \
    dist \
    gui \
    assets \
    package.json \
    package-lock.json \
    manager/dist \
    manager/package.json \
    manager/package-lock.json \
    manager/update-agent.sh

cd ..

echo ""
echo "Package created: agent/agent-complete-$VERSION.tar.gz"
echo "This includes:"
echo "  - agent/dist (compiled TypeScript)"
echo "  - agent/gui, assets, package files"
echo "  - manager/dist (compiled manager)"
echo "  - manager package files"
echo ""
echo "Deploy with: ./deploy-complete-agent.sh"