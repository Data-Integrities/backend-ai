#!/bin/bash

# Agent update script - downloads from hub manager
# Usage: update-agent-hub.sh <version>

set -e

VERSION=$1
if [ -z "$VERSION" ]; then
    echo "Error: Version required"
    exit 1
fi

# Configuration
HUB_URL="http://192.168.1.30:3081"
AGENT_DIR="/opt/ai-agent/agent"
TEMP_DIR="/tmp/agent-update-$$"

echo "Updating agent to version $VERSION..."

# Download update
mkdir -p "$TEMP_DIR"
cd "$TEMP_DIR"

echo "Downloading from hub manager..."
curl -sL "$HUB_URL/releases/$VERSION/agent-$VERSION.tar.gz" -o agent-update.tar.gz

# Verify download
if [ ! -f agent-update.tar.gz ] || [ ! -s agent-update.tar.gz ]; then
    echo "Error: Download failed"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Stop agent
echo "Stopping agent..."
systemctl stop backend-ai-agent || true

# Backup current version
cd "$AGENT_DIR"
if [ -d dist ]; then
    mv dist "dist.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Extract update
echo "Extracting update..."
tar -xzf "$TEMP_DIR/agent-update.tar.gz"

# Clean up
rm -rf "$TEMP_DIR"

# Start agent
echo "Starting agent..."
systemctl start backend-ai-agent

echo "Update complete!"