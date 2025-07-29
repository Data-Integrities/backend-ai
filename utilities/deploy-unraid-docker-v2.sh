#!/bin/bash

# Deploy Enhanced HTTP Agent v2.0.0 to Unraid via Docker

if [ $# -eq 0 ]; then
    echo "Usage: ./deploy-unraid-docker-v2.sh <hostname>"
    echo "Example: ./deploy-unraid-docker-v2.sh unraid"
    exit 1
fi

HOSTNAME=$1
USER=root

echo "Deploying Enhanced AI Agent v2.0.0 to Unraid..."

# Get IP from hostname
IP=$(grep "alias $HOSTNAME=" ~/.zsh/aliases.zsh | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)

if [ -z "$IP" ]; then
    echo "Error: Could not find IP for hostname $HOSTNAME"
    exit 1
fi

echo "Found IP: $IP for $HOSTNAME"

# Build the agent locally first
echo "Building agent..."
cd agent && npm run build && cd ..

# Create a temporary build directory
mkdir -p /tmp/unraid-agent-build
cp -r agent/dist /tmp/unraid-agent-build/
cp -r agent/node_modules /tmp/unraid-agent-build/
cp agent/package.json /tmp/unraid-agent-build/

# Create Dockerfile for Unraid
cat > /tmp/unraid-agent-build/Dockerfile << 'DOCKERFILE'
FROM node:18-alpine

# Install required packages
RUN apk add --no-cache bash curl

# Create app directory
WORKDIR /app

# Copy application files
COPY package.json ./
COPY node_modules ./node_modules
COPY dist ./dist

# Create startup script
RUN echo '#!/bin/bash' > /app/start.sh && \
    echo 'echo "Starting Enhanced HTTP Agent v2.0.0..."' >> /app/start.sh && \
    echo 'node /app/dist/api/index.js' >> /app/start.sh && \
    chmod +x /app/start.sh

# Expose port
EXPOSE 3080

CMD ["/app/start.sh"]
DOCKERFILE

# Build Docker image
echo "Building Docker image..."
cd /tmp/unraid-agent-build
docker build -t ai-agent:v2 .

# Save image
echo "Saving Docker image..."
docker save ai-agent:v2 | gzip > ai-agent-v2.tar.gz

# Copy to Unraid
echo "Copying to Unraid..."
scp ai-agent-v2.tar.gz $USER@$IP:/tmp/

# Deploy on Unraid
echo "Deploying on Unraid..."
ssh $USER@$IP << 'REMOTE_SCRIPT'
# Load the Docker image
echo "Loading Docker image..."
gunzip -c /tmp/ai-agent-v2.tar.gz | docker load

# Stop and remove old container
echo "Stopping old container..."
docker stop ai-agent 2>/dev/null || true
docker rm ai-agent 2>/dev/null || true

# Create new container
echo "Creating new container..."
docker create \
  --name ai-agent \
  -p 3080:3080 \
  -e PORT=3080 \
  -e AGENT_ID=unraid-agent \
  -e HUB_URL=http://192.168.1.30 \
  -e NODE_ENV=production \
  --restart unless-stopped \
  ai-agent:v2

# Start container
echo "Starting container..."
docker start ai-agent

# Wait for it to start
sleep 5

# Test
echo "Testing agent..."
curl -s http://localhost:3080/api/status | grep version || echo "Agent not responding yet"

# Clean up
rm /tmp/ai-agent-v2.tar.gz

echo "Deployment complete!"
REMOTE_SCRIPT

# Clean up local files
rm -rf /tmp/unraid-agent-build

echo "Done! Agent should be running at http://$IP:3080"