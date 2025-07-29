#!/bin/bash
# Stop manager script - handles both systemd and cleanup

SERVICE_NAME="${1:-ai-agent-manager}"

# Stop systemd service (ignore errors)
systemctl stop "$SERVICE_NAME" 2>/dev/null || true

# Kill any remaining manager processes
pkill -f 'node.*manager/dist/index.js' 2>/dev/null || true

# Always exit successfully
exit 0