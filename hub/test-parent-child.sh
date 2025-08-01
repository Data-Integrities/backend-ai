#!/bin/bash

# Test parent-child callback monitoring

API_BASE="http://192.168.1.30:3000/api"

echo "Testing parent-child callback monitoring..."
echo

# Generate parent correlation ID
PARENT_ID="test-parent_$(date +%s)_$(openssl rand -hex 4)"
echo "Parent correlation ID: $PARENT_ID"

# Get available agents
AGENTS=$(curl -s "$API_BASE/agents" | jq -r '.agents[] | select(.isOnline == true) | .name' | head -3)
AGENT_ARRAY=$(echo "$AGENTS" | jq -R . | jq -s .)

if [ -z "$AGENTS" ]; then
    echo "Error: No online agents found"
    exit 1
fi

echo "Testing with agents: $AGENTS"
echo

# Send multi-agent start command
echo "Sending multi-agent start command..."
RESPONSE=$(curl -s -X POST "$API_BASE/agents/multi/start" \
    -H "Content-Type: application/json" \
    -d "{
        \"agents\": $AGENT_ARRAY,
        \"parentCorrelationId\": \"$PARENT_ID\"
    }")

echo "Response: $RESPONSE"
echo

# Monitor parent execution status
echo "Monitoring parent execution status..."
for i in {1..30}; do
    STATUS=$(curl -s "$API_BASE/executions/$PARENT_ID" | jq -r '.status')
    if [ "$STATUS" != "pending" ]; then
        echo "Parent status changed to: $STATUS"
        
        # Get full execution details
        EXECUTION=$(curl -s "$API_BASE/executions/$PARENT_ID")
        echo "Full execution details:"
        echo "$EXECUTION" | jq '.'
        
        # Check child results
        CHILD_RESULTS=$(echo "$EXECUTION" | jq '.result.childResults')
        if [ "$CHILD_RESULTS" != "null" ]; then
            echo
            echo "Child operation summary:"
            echo "$CHILD_RESULTS" | jq '.'
        fi
        
        break
    fi
    
    echo -n "."
    sleep 2
done

echo
echo "Test complete!"