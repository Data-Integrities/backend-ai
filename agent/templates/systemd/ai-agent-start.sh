#!/bin/bash
#
# AI Agent Start Wrapper
# This script allows starting the agent with an optional correlationId parameter
#
# Usage: ai-agent-start.sh [correlationId]
#

CORRELATION_ID="$1"

# If correlationId provided, pass it via environment variable
if [ -n "$CORRELATION_ID" ]; then
    echo "Starting agent with correlationId: $CORRELATION_ID"
    # Set environment variable for this systemctl invocation
    systemctl set-environment CORRELATION_ID="$CORRELATION_ID"
    systemctl start ai-agent
    # Clear the environment variable after starting
    systemctl unset-environment CORRELATION_ID
else
    # Start normally without correlationId
    systemctl start ai-agent
fi

# For systemd, the service will return immediately, but that's OK
# The manager will track completion via the callback