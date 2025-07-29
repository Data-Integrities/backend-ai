#!/bin/bash

# Unraid-specific Docker deployment for AI Agent
# This script deploys the agent as a Docker container on Unraid

if [ $# -eq 0 ]; then
    echo "Usage: ./deploy-agent-unraid-docker.sh <hostname>"
    echo "Example: ./deploy-agent-unraid-docker.sh unraid"
    exit 1
fi

HOSTNAME=$1
USER=root  # Unraid typically uses root

echo "Deploying AI Agent via Docker to Unraid ($HOSTNAME)..."

# Get IP from hostname using aliases
IP=$(grep "alias $HOSTNAME=" ~/.zsh/aliases.zsh | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)

if [ -z "$IP" ]; then
    echo "Error: Could not find IP for hostname $HOSTNAME"
    exit 1
fi

echo "Found IP: $IP for $HOSTNAME"

# First, create the Dockerfile and build context
echo "Creating Docker build context..."
cd /Users/jeffk/Developement/provider-search/backend-ai

# Create a Dockerfile for the agent
cat > web-agent/Dockerfile << 'DOCKERFILE'
FROM node:20-alpine

# Install additional tools the agent might need
RUN apk add --no-cache \
    bash \
    curl \
    jq \
    openssh-client \
    docker-cli

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the rest of the application
COPY . .

# Build TypeScript
RUN npm run build

# Create a startup script that can handle host commands
RUN echo '#!/bin/bash' > /app/start.sh && \
    echo 'echo "AI Agent starting with host access capabilities..."' >> /app/start.sh && \
    echo 'echo "HOST_IP: $HOST_IP"' >> /app/start.sh && \
    echo 'echo "Docker socket: $(ls -la /var/run/docker.sock 2>/dev/null || echo "Not mounted")"' >> /app/start.sh && \
    echo 'exec node dist/index.js' >> /app/start.sh && \
    chmod +x /app/start.sh

EXPOSE 3080

CMD ["/app/start.sh"]
DOCKERFILE

# Build the Docker image locally
echo "Building Docker image..."
docker build -t ai-agent -f agent/Dockerfile .

# Save the image to a tar file
echo "Saving Docker image..."
docker save ai-agent:latest | gzip > ai-agent-docker.tar.gz

# Copy files to Unraid
echo "Copying files to Unraid..."
scp ai-agent-docker.tar.gz $USER@$IP:/tmp/

# Create deployment script for Unraid
cat > deploy-on-unraid.sh << 'UNRAID_SCRIPT'
#!/bin/bash

echo "Loading Docker image..."
docker load < /tmp/ai-agent-docker.tar.gz

# Stop and remove existing container if it exists
echo "Stopping existing container if present..."
docker stop ai-agent 2>/dev/null || true
docker rm ai-agent 2>/dev/null || true

# Create persistent config directory
mkdir -p /boot/config/plugins/ai-agent/config

# Create container with proper access
echo "Creating AI Agent container..."
docker run -d \
  --name ai-agent \
  --restart unless-stopped \
  -p 3080:3080 \
  -e PORT=3080 \
  -e AGENT_ID=unraid-agent \
  -e HOST_IP=localhost \
  -e NODE_ENV=production \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /mnt/user:/mnt/user:rw \
  -v /mnt/cache:/mnt/cache:rw \
  -v /mnt/disk1:/mnt/disk1:rw \
  -v /mnt/disk2:/mnt/disk2:rw \
  -v /mnt/disk3:/mnt/disk3:rw \
  -v /mnt/disk4:/mnt/disk4:rw \
  -v /boot:/boot:rw \
  -v /boot/config/plugins/ai-agent/config:/app/config:rw \
  -v /usr/local/emhttp/plugins:/plugins:ro \
  --network bridge \
  --log-driver json-file \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  ai-agent:latest

# Wait for container to start
echo "Waiting for container to start..."
sleep 5

# Check if container is running
if docker ps | grep -q ai-agent; then
    echo "AI Agent container is running!"
    
    # Test the agent
    echo "Testing agent API..."
    curl -s http://localhost:3080/api/status | jq '.' || echo "Agent may still be starting..."
    
    # Create Unraid WebUI link (if not exists)
    if [ ! -f /boot/config/plugins/dynamix.docker.manager/userprefs/ai-agent.cfg ]; then
        echo "Creating Unraid WebUI configuration..."
        mkdir -p /boot/config/plugins/dynamix.docker.manager/userprefs
        cat > /boot/config/plugins/dynamix.docker.manager/userprefs/ai-agent.cfg << 'WEBUI'
WebUI="http://[IP]:[PORT:3080]/"
WEBUI
    fi
    
    echo ""
    echo "AI Agent successfully deployed!"
    echo "Access the agent at: http://$HOSTNAME:3080"
    echo "You can also access it from Unraid's Docker tab"
else
    echo "ERROR: AI Agent container failed to start!"
    docker logs ai-agent
fi

# Cleanup
rm -f /tmp/ai-agent-docker.tar.gz

# Create auto-start script for Unraid
echo "Creating auto-start configuration..."
cat > /boot/config/plugins/ai-agent/auto-start.sh << 'AUTOSTART'
#!/bin/bash
# AI Agent auto-start for Unraid
# This ensures the agent starts after Unraid array starts

# Wait for Docker to be ready
while ! docker info >/dev/null 2>&1; do
    echo "Waiting for Docker daemon..."
    sleep 2
done

# Start AI Agent if not running
if ! docker ps | grep -q ai-agent; then
    docker start ai-agent
fi
AUTOSTART

chmod +x /boot/config/plugins/ai-agent/auto-start.sh

# Add to Unraid's go file for boot persistence
if ! grep -q "ai-agent/auto-start.sh" /boot/config/go; then
    echo "# Start AI Agent" >> /boot/config/go
    echo "/boot/config/plugins/ai-agent/auto-start.sh &" >> /boot/config/go
fi

echo "Auto-start configured!"

# Final instructions
echo ""
echo "=========================================="
echo "AI Agent Deployment Complete!"
echo "=========================================="
echo ""
echo "The agent is now running at: http://$HOSTNAME:3080"
echo ""
echo "IMPORTANT: Manual Step Required"
echo "--------------------------------"
echo "Please enable autostart in the Unraid GUI:"
echo "1. Go to the Docker tab in Unraid"
echo "2. Find 'ai-agent' in the container list"
echo "3. Toggle the 'AUTOSTART' switch to ON"
echo ""
echo "This ensures the agent starts automatically"
echo "when your Unraid array starts."
echo "=========================================="
UNRAID_SCRIPT

# Copy and execute deployment script
scp deploy-on-unraid.sh $USER@$IP:/tmp/
ssh $USER@$IP 'bash /tmp/deploy-on-unraid.sh'

# Cleanup local files
rm -f ai-agent-docker.tar.gz deploy-on-unraid.sh

echo ""
echo "=========================================="
echo "DEPLOYMENT COMPLETE!"
echo "=========================================="
echo "Agent URL: http://$HOSTNAME:3080"
echo ""
echo "⚠️  REMINDER: Please enable autostart in Unraid GUI"
echo "=========================================="