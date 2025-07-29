#!/bin/bash

# Clean deployment system using NAS
# This replaces all individual deployment scripts

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAS_IP="192.168.1.10"
NAS_SHARE="/mnt/user/dataintegrities/backend-ai"
VERSION=$(node -p "require('./agent/package.json').version")
BUILD_NUMBER=$(date +%Y%m%d-%H%M%S)
DEPLOY_DIR="${VERSION}-${BUILD_NUMBER}"

echo -e "${BLUE}=== Backend AI NAS Deployment ===${NC}"
echo "Version: ${VERSION}"
echo "Build: ${BUILD_NUMBER}"
echo ""

# Step 1: Build packages
echo -e "${GREEN}Building packages...${NC}"

# Build agent package
echo "Building agent..."
cd agent
npm run build
cd ..
tar -czf agent-${VERSION}.tar.gz \
    -C agent dist gui assets package.json

# Build hub package  
echo "Building hub..."
cd hub
npm run build
cd ..
tar -czf hub-${VERSION}.tar.gz \
    -C hub dist gui assets package.json agents-config.json

# Step 2: Create deployment directory on NAS
echo -e "${GREEN}Creating deployment directory on NAS...${NC}"
ssh root@${NAS_IP} "mkdir -p ${NAS_SHARE}/${DEPLOY_DIR}"

# Step 3: Copy packages to NAS
echo -e "${GREEN}Copying packages to NAS...${NC}"
scp agent-${VERSION}.tar.gz root@${NAS_IP}:${NAS_SHARE}/${DEPLOY_DIR}/
scp hub-${VERSION}.tar.gz root@${NAS_IP}:${NAS_SHARE}/${DEPLOY_DIR}/

# Step 4: Create deployment manifest
echo -e "${GREEN}Creating deployment manifest...${NC}"
cat > deployment-manifest.json <<EOF
{
  "version": "${VERSION}",
  "build": "${BUILD_NUMBER}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "packages": {
    "agent": {
      "file": "agent-${VERSION}.tar.gz",
      "url": "http://${NAS_IP}/dataintegrities/backend-ai/${DEPLOY_DIR}/agent-${VERSION}.tar.gz"
    },
    "hub": {
      "file": "hub-${VERSION}.tar.gz", 
      "url": "http://${NAS_IP}/dataintegrities/backend-ai/${DEPLOY_DIR}/hub-${VERSION}.tar.gz"
    }
  }
}
EOF

scp deployment-manifest.json root@${NAS_IP}:${NAS_SHARE}/${DEPLOY_DIR}/

# Step 5: Create a 'latest' symlink for easy access
ssh root@${NAS_IP} "cd ${NAS_SHARE} && ln -sfn ${DEPLOY_DIR} latest"

# Step 6: Clean up local files
rm -f agent-${VERSION}.tar.gz hub-${VERSION}.tar.gz deployment-manifest.json

echo ""
echo -e "${BLUE}=== Deployment Complete ===${NC}"
echo "Packages deployed to: ${NAS_SHARE}/${DEPLOY_DIR}"
echo ""
echo "To update systems, use:"
echo "  Agents: curl -X POST http://agent-ip:3080/api/update \\"
echo "    -H 'Authorization: Bearer your-secure-token' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"updateUrl\": \"http://${NAS_IP}/dataintegrities/backend-ai/latest/agent-${VERSION}.tar.gz\", \"version\": \"${VERSION}\"}'"
echo ""
echo "Note: Hub auto-update endpoint needs to be implemented"