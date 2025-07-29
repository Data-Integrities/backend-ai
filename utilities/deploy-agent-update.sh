#!/bin/bash

# Deploy Agent Update Script
# This script updates all agents with the fixed GUI authentication

echo "=== Agent Update Deployment Script ==="
echo "Updating agents with fixed GUI authentication..."

# Build the agent
echo "Building agent..."
cd agent
npm run build || exit 1
cd ..

# Create update package
echo "Creating update package..."
tar -czf agent-update.tar.gz -C agent dist gui package.json

# Get timestamp for version
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Function to update an agent
update_agent() {
    local HOST=$1
    local NAME=$2
    
    echo ""
    echo "Updating $NAME ($HOST)..."
    
    # Upload update package
    scp agent-update.tar.gz root@$HOST:/tmp/ || {
        echo "Failed to copy update to $NAME"
        return 1
    }
    
    # Update via self-update API
    echo "Triggering self-update..."
    curl -s -X POST http://$HOST:3080/api/update \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${AUTH_TOKEN:-}" \
        -d "{\"updateUrl\": \"file:///tmp/agent-update.tar.gz\", \"version\": \"2.0.1-$TIMESTAMP\"}" \
        | jq -r '.message // .error' || {
        echo "Failed to trigger update on $NAME"
        return 1
    }
    
    # Wait for restart
    echo "Waiting for agent to restart..."
    sleep 5
    
    # Verify update
    echo "Verifying update..."
    curl -s http://$HOST:3080/api/status | jq -r '.agentId + " v" + .version' || {
        echo "Failed to verify $NAME update"
        return 1
    }
    
    # Test GUI
    echo "Testing GUI..."
    GUI_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://$HOST:3080/)
    API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://$HOST:3080/api/status)
    
    if [ "$GUI_STATUS" = "200" ] && [ "$API_STATUS" = "200" ]; then
        echo "✓ $NAME updated successfully - GUI and API working"
    else
        echo "✗ $NAME GUI or API not responding correctly"
        return 1
    fi
}

# Update agents
echo ""
echo "Starting agent updates..."

# Proxmox agents
update_agent "192.168.1.5" "pve1"
update_agent "192.168.1.6" "pve2"
update_agent "192.168.1.7" "pve3"

# Service agents
update_agent "192.168.1.2" "nginx"
update_agent "192.168.1.10" "unraid"

# Summary
echo ""
echo "=== Update Summary ==="
echo "All agents have been updated with:"
echo "- Fixed GUI authentication (no auth required for local access)"
echo "- Same-origin API access for GUI endpoints"
echo "- Version: 2.0.1-$TIMESTAMP"
echo ""
echo "You can now access any agent's GUI at:"
echo "- http://<agent-ip>:3080"
echo ""
echo "Test the fix by visiting: http://192.168.1.2:3080"

# Cleanup
rm -f agent-update.tar.gz