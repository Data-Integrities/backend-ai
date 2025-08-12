#!/bin/bash

# Backend AI Version Update Script
# Updates version in all necessary files
# Usage: ./update-versions.sh [version]

if [ -z "$1" ]; then
    echo "Usage: ./update-versions.sh [version]"
    echo "Example: ./update-versions.sh 2.1.85"
    exit 1
fi

VERSION="$1"
echo "Updating Backend AI to version $VERSION"

# Update version in all package.json files
echo "Updating version in package files..."
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" backend-ai-config.json
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" hub/package.json
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" agent/package.json
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" agent/manager/package.json
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" shared/package.json

# Update HUB_VERSION constant in index.html
echo "Updating HUB_VERSION in index.html..."
sed -i.bak "s/const HUB_VERSION = '[^']*';/const HUB_VERSION = '$VERSION';/" hub/gui/index.html

# Update agent and manager versions in backend-ai-config.json
echo "Updating agent and manager versions in backend-ai-config.json..."
# Use jq for more reliable JSON manipulation
if command -v jq &> /dev/null; then
    # Use jq to update versions
    jq '.agents[].versions.agent = "'"$VERSION"'" | .agents[].versions.manager = "'"$VERSION"'"' backend-ai-config.json > backend-ai-config.json.tmp && mv backend-ai-config.json.tmp backend-ai-config.json
else
    # Fallback to sed if jq is not available
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i.bak -E '/"versions": \{/,/\}/{
            s/"agent": "[^"]*"/"agent": "'"$VERSION"'"/g
            s/"manager": "[^"]*"/"manager": "'"$VERSION"'"/g
        }' backend-ai-config.json
    else
        # Linux
        sed -i -E '/"versions": \{/,/\}/{
            s/"agent": "[^"]*"/"agent": "'"$VERSION"'"/g
            s/"manager": "[^"]*"/"manager": "'"$VERSION"'"/g
        }' backend-ai-config.json
    fi
fi

# Clean up backup files
rm -f backend-ai-config.json.bak hub/package.json.bak agent/package.json.bak agent/manager/package.json.bak shared/package.json.bak hub/gui/index.html.bak

echo "Version updated to $VERSION in all files"