#!/bin/bash
set -e

# AI Agent Installation Script
# This script installs the AI agent on a Linux container/VM

echo "🤖 Proxmox AI Control Agent Installer"
echo "===================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Configuration
AGENT_DIR="/opt/ai-agent"
CONFIG_DIR="/etc/ai-agent"
LOG_DIR="/var/log/ai-agent"
SERVICE_NAME="ai-agent"
HUB_URL="${HUB_URL:-ws://localhost:3001}"

# Detect system information
HOSTNAME=$(hostname)
AGENT_ID="${AGENT_ID:-agent-$HOSTNAME-$(date +%s)}"

echo "Configuration:"
echo "  Agent ID: $AGENT_ID"
echo "  Hub URL: $HUB_URL"
echo "  Install Dir: $AGENT_DIR"
echo ""

# Create directories
echo "Creating directories..."
mkdir -p "$AGENT_DIR"
mkdir -p "$CONFIG_DIR"
mkdir -p "$LOG_DIR"

# Download or copy agent files
echo "Installing agent files..."
if [ -f "./dist/index.js" ]; then
    # Local installation
    cp -r ./dist/* "$AGENT_DIR/"
    cp -r ./node_modules "$AGENT_DIR/"
    cp ./package.json "$AGENT_DIR/"
else
    # Remote installation (download from hub)
    echo "Downloading agent from hub..."
    curl -sSL "$HUB_URL/download/agent.tar.gz" | tar -xz -C "$AGENT_DIR"
fi

# Create configuration
echo "Creating configuration..."
cat > "$CONFIG_DIR/agent.env" << EOF
# AI Agent Configuration
AGENT_ID=$AGENT_ID
HUB_URL=$HUB_URL
LOG_DIR=$LOG_DIR
LOG_LEVEL=info
NODE_ENV=production
EOF

# Create systemd service
echo "Creating systemd service..."
cat > "/etc/systemd/system/$SERVICE_NAME.service" << EOF
[Unit]
Description=Proxmox AI Control Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$AGENT_DIR
EnvironmentFile=$CONFIG_DIR/agent.env
ExecStart=/usr/bin/node $AGENT_DIR/index.js
Restart=always
RestartSec=10
StandardOutput=append:$LOG_DIR/agent.log
StandardError=append:$LOG_DIR/agent.error.log

[Install]
WantedBy=multi-user.target
EOF

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Enable and start service
echo "Enabling and starting service..."
systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl start $SERVICE_NAME

# Check status
sleep 2
if systemctl is-active --quiet $SERVICE_NAME; then
    echo ""
    echo "✅ Agent installed and running successfully!"
    echo ""
    echo "Commands:"
    echo "  View status:  systemctl status $SERVICE_NAME"
    echo "  View logs:    journalctl -u $SERVICE_NAME -f"
    echo "  Restart:      systemctl restart $SERVICE_NAME"
    echo "  Stop:         systemctl stop $SERVICE_NAME"
    echo ""
    echo "Agent ID: $AGENT_ID"
    echo "Save this ID for hub configuration."
else
    echo ""
    echo "❌ Agent failed to start. Check logs:"
    echo "  journalctl -u $SERVICE_NAME -n 50"
    exit 1
fi