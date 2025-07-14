#!/bin/bash
set -e

# Proxmox AI Agent Installation Script
echo "🤖 Proxmox AI Control Agent Installer"
echo "====================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Configuration
AGENT_DIR="/opt/proxmox-ai-agent"
CONFIG_DIR="/etc/proxmox-ai-agent"
LOG_DIR="/var/log/proxmox-ai-agent"
SERVICE_NAME="proxmox-ai-agent"

# Get configuration from user
echo "Proxmox AI Agent Configuration:"
read -p "Agent ID [proxmox-main]: " AGENT_ID
read -p "Hub URL [ws://localhost:3001]: " HUB_URL
read -p "Proxmox Host: " PROXMOX_HOST
read -p "Proxmox User [root@pam]: " PROXMOX_USER
read -s -p "Proxmox Password: " PROXMOX_PASSWORD
echo

# Set defaults
AGENT_ID=${AGENT_ID:-"proxmox-main"}
HUB_URL=${HUB_URL:-"ws://localhost:3001"}
PROXMOX_USER=${PROXMOX_USER:-"root@pam"}

if [ -z "$PROXMOX_HOST" ] || [ -z "$PROXMOX_PASSWORD" ]; then
    echo "Error: Proxmox host and password are required"
    exit 1
fi

echo ""
echo "Configuration:"
echo "  Agent ID: $AGENT_ID"
echo "  Hub URL: $HUB_URL"
echo "  Proxmox Host: $PROXMOX_HOST"
echo "  Proxmox User: $PROXMOX_USER"
echo ""

# Create directories
echo "Creating directories..."
mkdir -p "$AGENT_DIR"
mkdir -p "$CONFIG_DIR"
mkdir -p "$LOG_DIR"

# Install/copy agent files
echo "Installing agent files..."
if [ -f "./dist/index.js" ]; then
    # Local installation
    cp -r ./dist/* "$AGENT_DIR/"
    cp -r ./node_modules "$AGENT_DIR/"
    cp ./package.json "$AGENT_DIR/"
else
    echo "Error: Agent files not found. Please build the agent first with 'npm run build'"
    exit 1
fi

# Create configuration
echo "Creating configuration..."
cat > "$CONFIG_DIR/agent.env" << EOF
# Proxmox AI Agent Configuration
AGENT_ID=$AGENT_ID
HUB_URL=$HUB_URL
PROXMOX_HOST=$PROXMOX_HOST
PROXMOX_USER=$PROXMOX_USER
PROXMOX_PASSWORD=$PROXMOX_PASSWORD
LOG_DIR=$LOG_DIR
LOG_LEVEL=info
NODE_ENV=production
EOF

# Secure the config file
chmod 600 "$CONFIG_DIR/agent.env"

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
sleep 3
if systemctl is-active --quiet $SERVICE_NAME; then
    echo ""
    echo "✅ Proxmox AI Agent installed and running successfully!"
    echo ""
    echo "Commands:"
    echo "  View status:  systemctl status $SERVICE_NAME"
    echo "  View logs:    journalctl -u $SERVICE_NAME -f"
    echo "  Restart:      systemctl restart $SERVICE_NAME"
    echo "  Stop:         systemctl stop $SERVICE_NAME"
    echo ""
    echo "Agent ID: $AGENT_ID"
    echo "The agent is now connected to your AI Control Hub."
    echo ""
    echo "You can now use natural language commands like:"
    echo "  'Restart VM web-server'"
    echo "  'Show status of all VMs'"
    echo "  'Migrate database-vm to pve2'"
    echo "  'Create a new container named test-container'"
else
    echo ""
    echo "❌ Agent failed to start. Check logs:"
    echo "  journalctl -u $SERVICE_NAME -n 50"
    exit 1
fi