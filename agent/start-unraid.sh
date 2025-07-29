#!/bin/bash
# Unraid startup script for AI Agent

# Kill any existing agent process
pkill -f "node.*ai-agent/agent/dist" || true

# Start the agent
cd /opt/ai-agent/agent
nohup /usr/local/bin/node /opt/ai-agent/agent/dist/api/index.js > /var/log/backend-ai-agent.log 2>&1 &

echo "AI Agent started with PID: $!"