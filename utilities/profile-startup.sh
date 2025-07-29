#!/bin/bash

echo "=== Agent Startup Profiling Test ==="
echo "This will stop all agents, then start them with profiling enabled"
echo ""

# Stop all agents first
echo "1. Stopping all agents..."
for agent in nginx pve1 pve2 pve3; do
    echo "   Stopping $agent..."
    curl -s -X POST http://192.168.1.30/api/agents/$agent/stop -H "Content-Type: application/json" > /dev/null
done

echo "2. Waiting for agents to stop..."
sleep 3

# Deploy profiled version to nginx for testing
echo "3. Deploying profiled agent to nginx..."
scp /Users/jeffk/Developement/provider-search/backend-ai/agent/dist/api/index-profiled.js root@192.168.1.2:/opt/ai-agent/agent/dist/api/index-profiled.js
scp /Users/jeffk/Developement/provider-search/backend-ai/agent/dist/api/startup-profiler.js root@192.168.1.2:/opt/ai-agent/agent/dist/api/

# Create temporary systemd service override to use profiled version
echo "4. Creating temporary service override..."
ssh root@192.168.1.2 'mkdir -p /etc/systemd/system/ai-agent.service.d && cat > /etc/systemd/system/ai-agent.service.d/profile.conf << EOF
[Service]
ExecStart=
ExecStart=/usr/bin/node /opt/ai-agent/agent/dist/api/index-profiled.js
EOF'

ssh root@192.168.1.2 'systemctl daemon-reload'

# Start nginx with profiling
echo "5. Starting nginx agent with profiling..."
START_TIME=$(date +%s%N)
curl -s -X POST http://192.168.1.30/api/agents/nginx/start -H "Content-Type: application/json"

# Wait for it to start
echo "6. Waiting for agent to start..."
for i in {1..30}; do
    if curl -s http://192.168.1.2:3080/api/status > /dev/null 2>&1; then
        END_TIME=$(date +%s%N)
        TOTAL_TIME=$(( ($END_TIME - $START_TIME) / 1000000 ))
        echo "   Agent started in ${TOTAL_TIME}ms"
        break
    fi
    sleep 0.5
done

# Get the logs with profiling data
echo ""
echo "7. Profiling data from agent logs:"
echo "=================================="
ssh root@192.168.1.2 'journalctl -u ai-agent -n 50 --no-pager | grep -E "\[PROFILE\]|\[STARTUP\]|=== STARTUP"' | tail -30

# Clean up - restore normal service
echo ""
echo "8. Restoring normal service..."
ssh root@192.168.1.2 'rm -f /etc/systemd/system/ai-agent.service.d/profile.conf && systemctl daemon-reload'

echo ""
echo "Profile test complete!"