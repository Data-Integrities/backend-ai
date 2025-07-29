#!/bin/bash

# Deploy to NAS with version-based folder structure
# Enables agent auto-update via /api/update endpoint

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NAS_IP="192.168.1.10"
NAS_SHARE="/mnt/user/dataintegrities/backend-ai"
FILEBROWSER_URL="http://192.168.1.10:8888"
DEPLOY_USER="deploy"
DEPLOY_PASS='Deploy4$6^'

# Get version from package.json
VERSION=$(node -p "require('./agent/package.json').version")
BUILD_NUMBER=$(date +%Y%m%d-%H%M%S)

echo -e "${BLUE}=== Backend AI NAS Deployment v2 ===${NC}"
echo "Version: ${VERSION}"
echo "Build: ${BUILD_NUMBER}"
echo ""

# Step 1: Build packages
echo -e "${GREEN}Building packages...${NC}"

# Build agent
echo "Building agent..."
cd agent
npm run build
cd ..
tar -czf agent-${VERSION}.tar.gz \
    -C agent dist gui assets package.json .env.template

# Build hub  
echo "Building hub..."
cd hub
npm run build
cd ..
tar -czf hub-${VERSION}.tar.gz \
    -C hub dist gui assets package.json agents-config.json .env

# Step 2: Create version directory on NAS
echo -e "${GREEN}Creating version directory on NAS...${NC}"
ssh root@${NAS_IP} "mkdir -p ${NAS_SHARE}/${VERSION}"

# Step 3: Copy packages to version folder
echo -e "${GREEN}Copying packages to NAS...${NC}"
scp agent-${VERSION}.tar.gz root@${NAS_IP}:${NAS_SHARE}/${VERSION}/
scp hub-${VERSION}.tar.gz root@${NAS_IP}:${NAS_SHARE}/${VERSION}/

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
      "path": "${VERSION}/agent-${VERSION}.tar.gz"
    },
    "hub": {
      "file": "hub-${VERSION}.tar.gz",
      "path": "${VERSION}/hub-${VERSION}.tar.gz"
    }
  }
}
EOF

scp deployment-manifest.json root@${NAS_IP}:${NAS_SHARE}/${VERSION}/

# Step 5: Update 'latest' symlink
ssh root@${NAS_IP} "cd ${NAS_SHARE} && ln -sfn ${VERSION} latest"

# Step 6: Clean up local files
rm -f agent-${VERSION}.tar.gz hub-${VERSION}.tar.gz deployment-manifest.json

echo ""
echo -e "${BLUE}=== Deployment Complete ===${NC}"
echo "Packages deployed to: ${NAS_SHARE}/${VERSION}"
echo ""
echo -e "${YELLOW}To update agents to version ${VERSION}:${NC}"
echo ""
echo "1. Get auth token:"
echo "   TOKEN=\$(curl -s -X POST ${FILEBROWSER_URL}/api/login \\"
echo "     -d '{\"username\":\"${DEPLOY_USER}\",\"password\":\"${DEPLOY_PASS}\"}' | tr -d '\"')"
echo ""
echo "2. Trigger agent update:"
echo "   curl -X POST http://agent-ip:3080/api/update \\"
echo "     -H 'Authorization: Bearer your-secure-token' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"version\": \"${VERSION}\", \"downloadUrl\": \"'${FILEBROWSER_URL}'/api/raw/'${VERSION}'/agent-'${VERSION}'.tar.gz\", \"authToken\": \"'\$TOKEN'\"}'\"
echo ""
echo "3. Or use hub to update all agents:"
echo "   curl -X POST http://192.168.1.30/api/agents/update \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"version\": \"${VERSION}\"}'\"