#!/bin/bash

# Start the hub proxy server
# This allows Claude Code to make requests to localhost:3001 instead of 192.168.1.30
# bypassing permission issues

echo "Starting Hub Proxy Server..."
echo "This will forward localhost:3001 -> 192.168.1.30:80"
echo ""
echo "Press Ctrl+C to stop"
echo ""

cd "$(dirname "$0")"
node hub-proxy.js