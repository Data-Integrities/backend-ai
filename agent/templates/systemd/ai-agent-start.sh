#!/bin/bash
#
# AI Agent Start Wrapper
# This script allows starting the agent with an optional correlationId parameter
#
# Usage: ai-agent-start.sh [correlationId]
#

AGENT_DIR="/opt/ai-agent/agent"
CORRELATION_ID="$1"

# If correlationId provided, write it to a file for the agent to read
if [ -n "$CORRELATION_ID" ]; then
    echo "$CORRELATION_ID" > "$AGENT_DIR/.correlationId"
    echo "Starting agent with correlationId: $CORRELATION_ID"
fi

# Start the agent service
systemctl start ai-agent

# For systemd, the service will return immediately, but that's OK
# The manager will track completion via the callback