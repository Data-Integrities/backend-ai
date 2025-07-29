#!/bin/bash
#
# AI Agent Start Wrapper for Unraid/rc.d systems
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
/etc/rc.d/rc.ai-agent start

# The rc.d script will handle the actual startup