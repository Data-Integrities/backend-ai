#!/bin/bash

# Backend AI Manager Stop Script with Callback
# This script stops the manager and sends a callback when complete

CORRELATION_ID="$1"
MANAGER_PORT="3081"
HUB_URL="http://192.168.1.30"
AGENT_NAME="${AGENT_NAME:-unknown}"
export AGENT_NAME

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

log "Starting manager stop process with correlationId: $CORRELATION_ID"
log "AGENT_NAME environment variable: '$AGENT_NAME'"
log "Script arguments: $*"
log "Full environment: $(env | grep AGENT || echo 'No AGENT variables found')"

# Write AGENT_NAME to temp file for background process
echo "$AGENT_NAME" > /tmp/ai-agent-manager-stop-${CORRELATION_ID}.agentName
log "Written AGENT_NAME to temp file: $(cat /tmp/ai-agent-manager-stop-${CORRELATION_ID}.agentName)"

# Stop the manager service
log "Stopping ai-agent-manager service..."
systemctl stop ai-agent-manager

# Launch background monitor to detect when manager is actually stopped
(
    # Read AGENT_NAME from temp file since SSH doesn't preserve environment variables in background processes
    if [ -f /tmp/ai-agent-manager-stop-${CORRELATION_ID}.agentName ]; then
        AGENT_NAME=$(cat /tmp/ai-agent-manager-stop-${CORRELATION_ID}.agentName)
        log "Read AGENT_NAME from temp file: $AGENT_NAME"
    else
        AGENT_NAME="unknown"
        log "WARNING: Could not read AGENT_NAME from temp file"
    fi
    
    log "Starting background monitor for manager shutdown with AGENT_NAME: $AGENT_NAME"
    
    # Wait a moment for the stop to take effect
    sleep 2
    
    # Monitor until manager stops responding
    MAX_ATTEMPTS=30
    ATTEMPT=0
    
    while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
        if curl -s -f "http://localhost:${MANAGER_PORT}/status" > /dev/null 2>&1; then
            log "Manager still responding, waiting... (attempt $((ATTEMPT + 1))/$MAX_ATTEMPTS)"
            sleep 1
            ATTEMPT=$((ATTEMPT + 1))
        else
            log "Manager has stopped responding"
            break
        fi
    done
    
    # Send callback to hub
    if [ -n "$CORRELATION_ID" ]; then
        log "Sending completion callback to hub..."
        
        PAYLOAD=$(cat <<EOF
{
    "result": "Manager stopped successfully on ${AGENT_NAME}",
    "agentId": "${AGENT_NAME}",
    "agentName": "${AGENT_NAME}",
    "detectedBy": "manager-stop-monitor"
}
EOF
)
        
        if curl -s -X POST \
            -H "Content-Type: application/json" \
            -d "$PAYLOAD" \
            "${HUB_URL}/api/executions/${CORRELATION_ID}/complete" > /dev/null 2>&1; then
            log "Successfully notified hub of manager stop completion"
        else
            log "Failed to notify hub of manager stop completion"
        fi
    fi
    
    log "Background monitor completed"
    
    # Clean up temp file
    rm -f /tmp/ai-agent-manager-stop-${CORRELATION_ID}.agentName
) > /var/log/ai-agent-manager-stop-${CORRELATION_ID}.log 2>&1 &

log "Manager stop initiated, background monitor launched"