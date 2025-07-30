#!/bin/bash

# Backend AI Manager Stop Script with Callback (Unraid)
# This script stops the manager and sends a callback when complete

CORRELATION_ID="$1"
MANAGER_PORT="3081"
HUB_URL="http://192.168.1.30"
AGENT_NAME="${AGENT_NAME:-unknown}"

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

log "Starting manager stop process with correlationId: $CORRELATION_ID"

# Stop the manager service
log "Stopping ai-agent-manager service..."
/etc/rc.d/rc.ai-agent-manager stop

# Launch background monitor to detect when manager is actually stopped
(
    log "Starting background monitor for manager shutdown..."
    
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
) > /var/log/ai-agent-manager-stop-${CORRELATION_ID}.log 2>&1 &

log "Manager stop initiated, background monitor launched"