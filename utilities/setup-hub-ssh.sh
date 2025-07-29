#!/bin/bash

echo "=== Backend AI Hub SSH Setup Automation ==="
echo ""
echo "This script will set up SSH access from the hub to all agents"
echo ""

# Step 1: Generate SSH key on hub if needed
echo "1. Checking hub SSH key..."
HUB_KEY=$(ssh root@192.168.1.30 "cat /root/.ssh/id_ed25519.pub 2>/dev/null")

if [ -z "$HUB_KEY" ]; then
    echo "   No SSH key found, generating..."
    ssh root@192.168.1.30 "ssh-keygen -t ed25519 -f /root/.ssh/id_ed25519 -N ''"
    HUB_KEY=$(ssh root@192.168.1.30 "cat /root/.ssh/id_ed25519.pub")
fi

echo "   Hub SSH public key:"
echo "   $HUB_KEY"
echo ""

# Step 2: Get list of agents from hub
echo "2. Getting agent list from hub..."
AGENTS=$(curl -s http://192.168.1.30/api/agents | jq -r '.agents[] | "\(.name):\(.ip)"')

if [ -z "$AGENTS" ]; then
    echo "   ERROR: Could not get agent list from hub"
    exit 1
fi

echo "   Found agents:"
echo "$AGENTS" | while IFS=: read -r name ip; do
    echo "     - $name ($ip)"
done
echo ""

# Step 3: Add hub's public key to each agent
echo "3. Adding hub's SSH key to each agent..."
echo "$AGENTS" | while IFS=: read -r name ip; do
    echo "   Setting up $name ($ip)..."
    
    # Check if key already exists
    if ssh root@$ip "grep -q \"$HUB_KEY\" ~/.ssh/authorized_keys 2>/dev/null"; then
        echo "     ✓ Key already exists"
    else
        # Add the key
        if ssh root@$ip "mkdir -p ~/.ssh && echo '$HUB_KEY' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"; then
            echo "     ✓ Key added successfully"
        else
            echo "     ✗ Failed to add key"
        fi
    fi
done
echo ""

# Step 4: Test SSH connectivity from hub
echo "4. Testing SSH connectivity from hub..."
echo "$AGENTS" | while IFS=: read -r name ip; do
    echo -n "   Testing $name ($ip)... "
    if ssh root@192.168.1.30 "ssh -o BatchMode=yes -o ConnectTimeout=5 root@$ip 'echo OK' 2>/dev/null" | grep -q OK; then
        echo "✓ Connected"
    else
        echo "✗ Failed"
    fi
done
echo ""

# Step 5: Test manager control
echo "5. Testing manager control through hub API..."
TEST_RESULT=$(curl -s http://192.168.1.30/api/ssh/test)
echo "$TEST_RESULT" | jq '.'
echo ""

echo "=== Setup Complete ==="
echo ""
echo "You can now use the hub's manager control features!"
echo "Try right-clicking on an agent in the hub UI and selecting manager operations."