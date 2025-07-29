#!/bin/bash

# Deploy .env files to all agents
# This is a one-time setup to ensure all agents have matching AUTH_TOKEN

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}=== Deploying .env files to agents ===${NC}"

# Create .env content for agents
cat > /tmp/agent.env << 'EOF'
# Agent Environment Configuration
PORT=3080
HUB_URL=http://192.168.1.30
AUTH_TOKEN="backend-ai-secure-token-2024"
EOF

# Deploy to each agent
AGENTS=("192.168.1.2:nginx" "192.168.1.5:pve1" "192.168.1.6:pve2" "192.168.1.7:pve3" "192.168.1.10:unraid")

for agent in "${AGENTS[@]}"; do
    IFS=':' read -r ip name <<< "$agent"
    echo -e "${GREEN}Deploying to ${name} (${ip})...${NC}"
    
    # For Unraid, different path
    if [ "$name" == "unraid" ]; then
        AGENT_DIR="/mnt/user/home/root/ai-agent"
    else
        AGENT_DIR="/opt/ai-agent/agent"
    fi
    
    # Copy .env file
    scp /tmp/agent.env root@${ip}:${AGENT_DIR}/.env
    
    # Set AGENT_ID based on hostname
    ssh root@${ip} "sed -i '3i AGENT_ID=\"${name}-agent\"' ${AGENT_DIR}/.env"
    
    echo "  ✓ Deployed to ${name}"
done

# Deploy hub .env (already exists, but ensure it's correct)
echo -e "${GREEN}Checking hub .env...${NC}"
ssh root@192.168.1.30 "grep AUTH_TOKEN /opt/backend-ai/hub/.env || echo 'AUTH_TOKEN=\"backend-ai-secure-token-2024\"' >> /opt/backend-ai/hub/.env"

# Clean up
rm /tmp/agent.env

echo -e "${BLUE}=== Deployment complete ===${NC}"
echo "All agents now have matching AUTH_TOKEN configuration"
echo ""
echo "Next steps:"
echo "1. Restart all agents to pick up new .env files"
echo "2. Test hub-to-agent communication"