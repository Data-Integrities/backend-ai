#!/bin/bash
# AI Agent Manager Stop Wrapper
# This script is called when stopping the manager with a correlationId

CORRELATION_ID="$1"
CONFIG_PATH="/opt/backend-ai-config.json"

# Stop the service
systemctl stop ai-agent-manager

# Send completion callback if correlationId was provided
if [ -n "$CORRELATION_ID" ]; then
    HUB_URL=$(jq -r '.hub.ip + ":" + (.hub.port|tostring)' "$CONFIG_PATH" 2>/dev/null)
    if [ -n "$HUB_URL" ]; then
        curl -X POST "http://$HUB_URL/api/executions/$CORRELATION_ID/complete" \
            -H "Content-Type: application/json" \
            -d '{"result":"Manager stopped successfully"}' \
            2>/dev/null || true
    fi
fi