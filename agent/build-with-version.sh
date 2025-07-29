#!/bin/bash

# Build script that increments version automatically

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

# Split version into components
IFS='.' read -r -a VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR="${VERSION_PARTS[0]}"
MINOR="${VERSION_PARTS[1]}"
PATCH="${VERSION_PARTS[2]}"

# Increment patch version
PATCH=$((PATCH + 1))
NEW_VERSION="$MAJOR.$MINOR.$PATCH"

echo "New version: $NEW_VERSION"

# Update package.json with new version
node -p "
const pkg = require('./package.json');
pkg.version = '$NEW_VERSION';
require('fs').writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\\n');
"

# Build with timestamp
export BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
npm run build

echo "Built version $NEW_VERSION at $BUILD_TIME"