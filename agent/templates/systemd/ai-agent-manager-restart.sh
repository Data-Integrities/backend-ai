#!/bin/bash
# Wrapper script for restarting ai-agent-manager with correlation tracking

CORRELATION_ID="$1"
AGENT_NAME="${AGENT_NAME:-unknown}"

if [ -z "$CORRELATION_ID" ]; then
    echo "Error: CORRELATION_ID is required as first parameter"
    exit 1
fi

# Stop the service first
service ai-agent-manager stop

# Wait for service to fully stop
sleep 2

# Write CORRELATION_ID and AGENT_NAME to temp file for the service to pick up
echo "$CORRELATION_ID" > /tmp/ai-agent-manager.correlationId
echo "$AGENT_NAME" > /tmp/ai-agent-manager.agentName

# Start the service
service ai-agent-manager start

# Wait a moment to ensure service starts
sleep 1

# Clean up temp files after service has had time to read them
rm -f /tmp/ai-agent-manager.correlationId /tmp/ai-agent-manager.agentName