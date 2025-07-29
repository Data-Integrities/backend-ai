#!/bin/bash

# Example workflow for deploying and updating agents

# 1. First, deploy to NAS
echo "=== Step 1: Deploy to NAS ==="
./deploy-to-nas-v2.sh

# Get the version that was just deployed
VERSION=$(node -p "require('./agent/package.json').version")

# 2. Get FileBrowser auth token
echo ""
echo "=== Step 2: Get FileBrowser Auth Token ==="
TOKEN=$(curl -s -X POST http://192.168.1.10:8888/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"deploy","password":"Deploy4$6^"}' | tr -d '"')
echo "Token obtained: ${TOKEN:0:20}..."

# 3. Update a single agent
echo ""
echo "=== Step 3: Update Single Agent Example ==="
echo "Updating nginx agent to version $VERSION..."

curl -X POST http://192.168.1.2:3080/api/autoupdate?ver=$VERSION \
  -H "Authorization: Bearer your-secure-token" \
  -H "Content-Type: application/json" \
  -d "{\"authToken\": \"$TOKEN\"}"

# 4. Update the hub itself
echo ""
echo "=== Step 4: Update Hub ==="
echo "Updating hub to version $VERSION..."

curl -X POST http://192.168.1.30/api/autoupdate?ver=$VERSION \
  -H "Content-Type: application/json" \
  -d "{\"authToken\": \"$TOKEN\"}"

# 5. Update all agents via hub
echo ""
echo "=== Step 5: Update All Agents via Hub ==="
echo "Updating all agents to version $VERSION..."

curl -X POST http://192.168.1.30/api/agents/update-all \
  -H "Content-Type: application/json" \
  -d "{\"version\": \"$VERSION\", \"nasAuthToken\": \"$TOKEN\"}"

# 6. Check agent versions
echo ""
echo "=== Step 6: Check Agent Versions ==="
sleep 30  # Wait for agents to restart
curl -s http://192.168.1.30/api/agents | jq '.agents[] | {name: .name, version: .version}'