#!/bin/bash

echo "=== Testing direct agent startup with verbosity ==="
echo ""

# Stop agent first
echo "1. Stopping agent..."
curl -s -X POST "http://192.168.1.30/api/agents/nginx/stop" -H "Content-Type: application/json"
sleep 3

# Run agent directly with verbosity
echo "2. Running agent directly with STARTUP_VERBOSITY=3..."
ssh root@192.168.1.2 "cd /opt/ai-agent/agent && STARTUP_VERBOSITY=3 /usr/bin/node dist/api/index.js" &
SSH_PID=$!

# Give it some time to start
sleep 5

# Check if it's running
echo ""
echo "3. Checking agent status..."
curl -s "http://192.168.1.2:3080/api/status" | jq -r '"Agent is " + .status + ", version " + .version'

# Kill the SSH session
kill $SSH_PID 2>/dev/null

echo ""
echo "=== Test complete ===" 