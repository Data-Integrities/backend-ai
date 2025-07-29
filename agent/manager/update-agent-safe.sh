#!/bin/bash

# Safe agent update script - downloads from hub manager with rollback
# Usage: update-agent-safe.sh <version>

VERSION=$1
if [ -z "$VERSION" ]; then
    echo "Error: Version required"
    exit 1
fi

# Configuration
HUB_URL="http://192.168.1.30:3081"
AGENT_DIR="/opt/ai-agent/agent"
TEMP_DIR="/tmp/agent-update-$$"
BACKUP_DIR=""

echo "Updating agent to version $VERSION..."

# Download update
mkdir -p "$TEMP_DIR"
cd "$TEMP_DIR"

echo "Downloading from hub manager..."
if ! curl -sL "$HUB_URL/releases/$VERSION/agent-$VERSION.tar.gz" -o agent-update.tar.gz; then
    echo "Error: Download failed"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Verify download
if [ ! -f agent-update.tar.gz ] || [ ! -s agent-update.tar.gz ]; then
    echo "Error: Downloaded file is empty or missing"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Test tar file integrity
echo "Verifying package integrity..."
if ! tar -tzf agent-update.tar.gz >/dev/null 2>&1; then
    echo "Error: Package is corrupted"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Check if dist folder is in the package
if ! tar -tzf agent-update.tar.gz | grep -q "^dist/"; then
    echo "Error: Package does not contain dist folder"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Stop agent
echo "Stopping agent..."
systemctl stop backend-ai-agent || true

# Backup current version
cd "$AGENT_DIR"
if [ -d dist ]; then
    BACKUP_DIR="dist.backup.$(date +%Y%m%d_%H%M%S)"
    echo "Backing up current dist to $BACKUP_DIR..."
    mv dist "$BACKUP_DIR"
fi

# Extract update
echo "Extracting update..."
if ! tar -xzf "$TEMP_DIR/agent-update.tar.gz"; then
    echo "Error: Extraction failed"
    
    # Restore backup if it exists
    if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
        echo "Restoring from backup..."
        mv "$BACKUP_DIR" dist
    fi
    
    # Clean up and exit
    rm -rf "$TEMP_DIR"
    
    # Try to start agent anyway
    echo "Attempting to start agent..."
    systemctl start backend-ai-agent || true
    
    exit 1
fi

# Verify dist folder was extracted
if [ ! -d dist ]; then
    echo "Error: dist folder not found after extraction"
    
    # Restore backup
    if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
        echo "Restoring from backup..."
        mv "$BACKUP_DIR" dist
    fi
    
    # Clean up
    rm -rf "$TEMP_DIR"
    
    # Try to start agent
    systemctl start backend-ai-agent || true
    
    exit 1
fi

# Clean up temp files
rm -rf "$TEMP_DIR"

# Clean up old backups (keep only last 5)
echo "Cleaning up old backups..."
ls -dt dist.backup.* 2>/dev/null | tail -n +6 | xargs rm -rf 2>/dev/null || true

# Start agent
echo "Starting agent..."
if systemctl start backend-ai-agent; then
    echo "Update complete! Agent is running version $VERSION"
    
    # Remove the backup since update was successful
    if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
        echo "Removing backup since update was successful..."
        rm -rf "$BACKUP_DIR"
    fi
else
    echo "Warning: Agent failed to start"
    
    # Restore backup if agent won't start
    if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
        echo "Restoring from backup..."
        rm -rf dist 2>/dev/null || true
        mv "$BACKUP_DIR" dist
        echo "Attempting to start with restored version..."
        systemctl start backend-ai-agent || true
    fi
    
    exit 1
fi