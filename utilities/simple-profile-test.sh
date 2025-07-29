#!/bin/bash

echo "=== SIMPLE STARTUP PROFILE TEST ==="
echo ""

# Just test nginx with verbosity
echo "1. Stopping nginx..."
curl -s -X POST "http://192.168.1.30/api/agents/nginx/stop" -H "Content-Type: application/json"
sleep 3

echo "2. Checking nginx logs during startup..."
echo "   Starting agent..."
curl -s -X POST "http://192.168.1.30/api/agents/nginx/start" -H "Content-Type: application/json"

echo "3. Getting startup logs (waiting 5 seconds)..."
sleep 5

echo ""
echo "=== NGINX STARTUP LOGS ==="
ssh root@192.168.1.2 "journalctl -u ai-agent -n 50 --no-pager | grep -E 'STARTUP|Starting|Started|systemd'" | tail -30

echo ""
echo "=== Checking if agent is actually running ==="
curl -s "http://192.168.1.2:3080/api/status" | jq -r '"Status: " + .status + ", Version: " + .version'