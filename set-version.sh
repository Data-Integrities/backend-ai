#!/bin/bash

# Backend AI Version Management Script
# Updates version in all package.json files and backend-ai-config.json

set -e

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_info() {
    echo -e "${YELLOW}→${NC} $1"
}

print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if version argument provided
if [ -z "$1" ]; then
    echo "Usage: ./set-version.sh <version>"
    echo "Example: ./set-version.sh 2.1.0"
    echo ""
    echo "Current versions:"
    echo "  Shared:  $(grep '"version"' shared/package.json | head -1 | awk -F'"' '{print $4}')"
    echo "  Hub:     $(grep '"version"' hub/package.json | head -1 | awk -F'"' '{print $4}')"
    echo "  Agent:   $(grep '"version"' agent/package.json | head -1 | awk -F'"' '{print $4}')"
    echo "  Manager: $(grep '"version"' agent/manager/package.json | head -1 | awk -F'"' '{print $4}')"
    echo "  Config:  $(grep '"version"' backend-ai-config.json | head -1 | awk -F'"' '{print $4}')"
    exit 1
fi

VERSION=$1

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║   Backend AI Version Update           ║"
echo "╚═══════════════════════════════════════╝"
echo ""
echo "Setting all components to version: $VERSION"
echo ""

# Function to update version in a file
update_version() {
    local file=$1
    local component=$2
    
    if [ -f "$file" ]; then
        # Get current version
        current=$(grep '"version"' "$file" | head -1 | awk -F'"' '{print $4}')
        
        # Update version
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$file"
        else
            # Linux
            sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$file"
        fi
        
        print_status "$component: $current → $VERSION"
    else
        print_error "$component: $file not found!"
        exit 1
    fi
}

# Update all package.json files
update_version "shared/package.json" "Shared Module"
update_version "hub/package.json" "Hub"
update_version "agent/package.json" "Agent"
update_version "agent/manager/package.json" "Manager"
update_version "backend-ai-config.json" "Configuration"

# Also update hardcoded versions in source files
print_info "Updating hardcoded versions in source files..."

# Update manager version constant
if [ -f "agent/manager/index.ts" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/const MANAGER_VERSION = '[^']*'/const MANAGER_VERSION = '$VERSION'/" agent/manager/index.ts
    else
        sed -i "s/const MANAGER_VERSION = '[^']*'/const MANAGER_VERSION = '$VERSION'/" agent/manager/index.ts
    fi
    print_status "Manager source: Updated MANAGER_VERSION constant"
fi

# Update hub HTML file version
if [ -f "hub/gui/index.html" ]; then
    # Extract just the major.minor.patch version number from VERSION
    VERSION_NUM=$(echo "$VERSION" | grep -o '^[0-9]\+\.[0-9]\+\.[0-9]\+')
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # Update the HUB_VERSION constant
        sed -i '' "s/const HUB_VERSION = '[^']*'/const HUB_VERSION = '$VERSION_NUM'/" hub/gui/index.html
    else
        # Update the HUB_VERSION constant
        sed -i "s/const HUB_VERSION = '[^']*'/const HUB_VERSION = '$VERSION_NUM'/" hub/gui/index.html
    fi
    print_status "Hub HTML: Updated HUB_VERSION to $VERSION_NUM"
fi

echo ""
print_status "All versions updated to $VERSION"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff"
echo "  2. Commit changes: git commit -am 'Bump version to $VERSION'"
echo "  3. Deploy everything: ./deploy-everything.sh"
echo ""