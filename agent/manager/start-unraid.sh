#!/bin/bash
# Unraid startup script for AI Agent Manager

# Kill any existing agent manager process
pkill -f "node.*ai-agent/manager"

# Start the agent manager
cd /opt/ai-agent/manager
nohup /usr/local/bin/node /opt/ai-agent/manager/dist/index.js > /var/log/ai-agent-manager.log 2>&1 &

echo "AI Agent Manager started with PID: $!"