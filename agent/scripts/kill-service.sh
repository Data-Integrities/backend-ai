#!/bin/bash

# Backend AI Service Kill Script
# Usage: kill-service.sh <agent|manager>

SERVICE_TYPE=$1
CONFIG_FILE="${CONFIG_PATH:-/opt/backend-ai-config.json}"

if [ -z "$SERVICE_TYPE" ] || ([ "$SERVICE_TYPE" != "agent" ] && [ "$SERVICE_TYPE" != "manager" ]); then
    echo "Usage: $0 <agent|manager>"
    exit 1
fi

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: Config file not found at $CONFIG_FILE"
    exit 1
fi

# Extract port and process pattern from config
if [ "$SERVICE_TYPE" = "agent" ]; then
    PORT=$(jq -r '.defaults.agent.port' "$CONFIG_FILE")
    PROCESS_PATTERN=$(jq -r '.defaults.agent.processPattern' "$CONFIG_FILE")
else
    PORT=$(jq -r '.defaults.manager.port' "$CONFIG_FILE")
    PROCESS_PATTERN=$(jq -r '.defaults.manager.processPattern' "$CONFIG_FILE")
fi

echo "Attempting to kill $SERVICE_TYPE service..."
echo "Port: $PORT"
echo "Process pattern: $PROCESS_PATTERN"

# Method 1: Kill by port
echo "Killing processes on port $PORT..."
PIDS=$(lsof -ti:$PORT 2>/dev/null)
if [ ! -z "$PIDS" ]; then
    echo "Found PIDs on port $PORT: $PIDS"
    kill -9 $PIDS 2>/dev/null
    sleep 1
fi

# Method 2: Kill by process pattern
echo "Killing processes matching pattern..."
pkill -9 -f "$PROCESS_PATTERN" 2>/dev/null
sleep 1

# Verify process is dead
echo "Verifying service is stopped..."
if lsof -ti:$PORT >/dev/null 2>&1; then
    echo "Error: Service still running on port $PORT"
    exit 1
fi

echo "Success: $SERVICE_TYPE service has been terminated"
exit 0