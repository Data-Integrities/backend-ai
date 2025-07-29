#!/bin/bash

echo "=== Add New Agent to Backend AI System ==="
echo ""

# Get parameters
if [ $# -lt 3 ]; then
    echo "Usage: $0 <agent-name> <agent-ip> <system-type> [aliases...]"
    echo ""
    echo "Example: $0 docker 192.168.1.48 ubuntu docker-host containers"
    echo ""
    echo "System types: ubuntu, debian, unraid"
    exit 1
fi

AGENT_NAME=$1
AGENT_IP=$2
SYSTEM_TYPE=$3
shift 3
ALIASES=("$@")

echo "Adding new agent:"
echo "  Name: $AGENT_NAME"
echo "  IP: $AGENT_IP"
echo "  System: $SYSTEM_TYPE"
echo "  Aliases: ${ALIASES[@]}"
echo ""

# Step 1: Add to agents-config.json
echo "1. Adding agent to hub configuration..."

# Create JSON for new agent
ALIASES_JSON=$(printf '"%s",' "${ALIASES[@]}" | sed 's/,$//')
if [ -z "$ALIASES_JSON" ]; then
    ALIASES_JSON="\"$AGENT_NAME\""
else
    ALIASES_JSON="\"$AGENT_NAME\", $ALIASES_JSON"
fi

NEW_AGENT_JSON=$(cat <<EOF
    {
      "agent-name": "$AGENT_NAME",
      "ip": "$AGENT_IP",
      "port": 3080,
      "accessUser": "root",
      "aliases": [$ALIASES_JSON],
      "systemType": "$SYSTEM_TYPE",
      "serviceManager": "systemd",
      "nodePath": "/usr/bin/node",
      "notes": "Added via add-new-agent.sh"
    }
EOF
)

# Update the config file
CONFIG_FILE="/Users/jeffk/Developement/provider-search/backend-ai/hub/agents-config.json"
if [ -f "$CONFIG_FILE" ]; then
    # Create backup
    cp "$CONFIG_FILE" "$CONFIG_FILE.backup"
    
    # Add new agent to the agents array
    jq --argjson newAgent "$NEW_AGENT_JSON" '.agents += [$newAgent]' "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
    echo "   ✓ Agent added to configuration"
else
    echo "   ✗ Configuration file not found: $CONFIG_FILE"
    exit 1
fi

# Step 2: Deploy agent software
echo ""
echo "2. Deploying agent software to $AGENT_IP..."
cd /Users/jeffk/Developement/provider-search/backend-ai

if [ -f "utilities/deploy-agent.sh" ]; then
    bash utilities/deploy-agent.sh "$AGENT_IP"
else
    echo "   ✗ Deploy script not found"
    echo "   Please deploy manually using:"
    echo "   scp -r agent root@$AGENT_IP:/opt/ai-agent/"
fi

# Step 3: Set up SSH access from hub
echo ""
echo "3. Setting up SSH access from hub..."

# Get hub's public key
HUB_KEY=$(ssh root@192.168.1.30 "docker exec ai-hub cat /root/.ssh/id_ed25519.pub 2>/dev/null")

if [ -z "$HUB_KEY" ]; then
    echo "   Hub SSH key not found, generating..."
    ssh root@192.168.1.30 "docker exec ai-hub ssh-keygen -t ed25519 -f /root/.ssh/id_ed25519 -N ''"
    HUB_KEY=$(ssh root@192.168.1.30 "docker exec ai-hub cat /root/.ssh/id_ed25519.pub")
fi

# Add hub's key to new agent
echo "   Adding hub's SSH key to agent..."
if ssh root@$AGENT_IP "mkdir -p ~/.ssh && echo '$HUB_KEY' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"; then
    echo "   ✓ SSH key added"
else
    echo "   ✗ Failed to add SSH key"
fi

# Step 4: Deploy hub configuration
echo ""
echo "4. Deploying updated hub configuration..."
ssh root@192.168.1.30 "cd /opt/backend-ai/hub && git pull && npm run build && systemctl restart ai-hub"

# Step 5: Verify agent is online
echo ""
echo "5. Verifying agent status..."
sleep 5

AGENT_STATUS=$(curl -s http://192.168.1.30/api/agents | jq -r ".agents[] | select(.name == \"$AGENT_NAME\") | .isOnline")

if [ "$AGENT_STATUS" = "true" ]; then
    echo "   ✓ Agent is online!"
else
    echo "   ✗ Agent is not responding"
    echo "   Check the agent logs: ssh root@$AGENT_IP 'journalctl -u ai-agent -n 50'"
fi

echo ""
echo "=== Agent Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Verify agent in hub UI: http://192.168.1.30"
echo "2. Test agent commands: 'ask $AGENT_NAME to check system status'"
echo "3. Configure agent-specific services if needed"