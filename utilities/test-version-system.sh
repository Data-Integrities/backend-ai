#!/bin/bash

# Test Version System Script
echo "=== Testing Version System ==="
echo ""

# Test agent status endpoints
echo "Testing Agent Status Endpoints:"
echo "-------------------------------"

AGENTS=("192.168.1.5:pve1" "192.168.1.6:pve2" "192.168.1.7:pve3" "192.168.1.2:nginx" "192.168.1.10:unraid")

for agent in "${AGENTS[@]}"; do
    IFS=':' read -r ip name <<< "$agent"
    echo -n "$name ($ip): "
    
    STATUS=$(curl -s -H "Authorization: Bearer your-secure-token" http://$ip:3080/api/status 2>/dev/null)
    if [ $? -eq 0 ]; then
        VERSION=$(echo "$STATUS" | jq -r '.version // "unknown"')
        DIR=$(echo "$STATUS" | jq -r '.workingDirectory // "unknown"')
        echo "v$VERSION in $DIR"
    else
        echo "Not responding"
    fi
done

echo ""
echo "Testing Hub Endpoints:"
echo "---------------------"

# Test hub GUI
echo -n "Hub GUI: "
if curl -s -o /dev/null -w "%{http_code}" http://192.168.1.30/ | grep -q "200"; then
    echo "✓ Working"
else
    echo "✗ Not working"
fi

# Test agents endpoint
echo -n "Agents endpoint: "
AGENTS_RESP=$(curl -s http://192.168.1.30/api/agents 2>/dev/null)
if [ $? -eq 0 ] && echo "$AGENTS_RESP" | jq -e '.agents' > /dev/null 2>&1; then
    TOTAL=$(echo "$AGENTS_RESP" | jq -r '.totalAgents // 0')
    ONLINE=$(echo "$AGENTS_RESP" | jq -r '.onlineAgents // 0')
    echo "✓ Working ($ONLINE/$TOTAL agents online)"
    
    # Show version status if available
    if echo "$AGENTS_RESP" | jq -e '.expectedAgentVersion' > /dev/null 2>&1; then
        EXPECTED=$(echo "$AGENTS_RESP" | jq -r '.expectedAgentVersion')
        echo "  Expected agent version: $EXPECTED"
    fi
else
    echo "✗ Not working"
fi

echo ""
echo "Summary:"
echo "--------"
echo "• Agent /api/status endpoints include version and workingDirectory"
echo "• Hub /api/agents endpoint shows which agents need updates"
echo "• Hub /api/status endpoint shows hub version and expected agent version"
echo "• Hub /api/version-check endpoint provides detailed version report"

echo ""
echo "See API_STATUS_DOCUMENTATION.md for full details on using these endpoints."