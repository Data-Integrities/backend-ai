#!/bin/bash

# Universal AI Agent Deployment Script
# Supports: macOS, Debian/Ubuntu, RHEL/CentOS, Alpine, Unraid, FreeBSD

# Check if target host is provided
if [ $# -eq 0 ]; then
    echo "Usage: ./deploy-agent-universal.sh <hostname> [user]"
    echo "Example: ./deploy-agent-universal.sh nginx root"
    echo "Example: ./deploy-agent-universal.sh unraid root"
    exit 1
fi

HOSTNAME=$1
USER=${2:-root}
AGENT_DIR="/opt/ai-agent"

echo "Deploying AI Agent to $HOSTNAME as $USER..."

# Create tarball of web-agent
cd /Users/jeffk/Developement/provider-search/backend-ai
tar -czf agent-deploy.tar.gz web-agent/

# Get IP from hostname using aliases
IP=$(grep "alias $HOSTNAME=" ~/.zsh/aliases.zsh | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)

if [ -z "$IP" ]; then
    echo "Error: Could not find IP for hostname $HOSTNAME"
    exit 1
fi

echo "Found IP: $IP for $HOSTNAME"

# Copy to target server
scp agent-deploy.tar.gz $USER@$IP:/tmp/

# Deploy on target server with OS detection
ssh $USER@$IP << 'EOF'
# Detect OS and set package manager
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        OS_LIKE=$ID_LIKE
        VERSION_ID=$VERSION_ID
    elif [ -f /etc/unraid-version ]; then
        OS="unraid"
        UNRAID_VERSION=$(cat /etc/unraid-version | cut -d'"' -f2)
    elif [ "$(uname)" = "Darwin" ]; then
        OS="macos"
    elif [ "$(uname)" = "FreeBSD" ]; then
        OS="freebsd"
    else
        OS="unknown"
    fi
    
    echo "Detected OS: $OS"
    if [ ! -z "$OS_LIKE" ]; then
        echo "OS Like: $OS_LIKE"
    fi
}

# Install Node.js based on OS
install_nodejs() {
    case "$OS" in
        "debian"|"ubuntu")
            echo "Installing Node.js on Debian/Ubuntu..."
            apt-get update
            apt-get install -y nodejs npm
            ;;
            
        "rhel"|"centos"|"fedora"|"rocky"|"almalinux")
            echo "Installing Node.js on RHEL-based system..."
            dnf module install -y nodejs:18
            ;;
            
        "alpine")
            echo "Installing Node.js on Alpine..."
            apk add --no-cache nodejs npm
            ;;
            
        "arch")
            echo "Installing Node.js on Arch..."
            pacman -S --noconfirm nodejs npm
            ;;
            
        "macos")
            echo "Installing Node.js on macOS..."
            if ! command -v brew &> /dev/null; then
                echo "Homebrew not found. Please install Homebrew first."
                exit 1
            fi
            brew install node
            ;;
            
        "freebsd")
            echo "Installing Node.js on FreeBSD..."
            pkg install -y node npm
            ;;
            
        "unraid")
            echo "Installing Node.js on Unraid..."
            echo "WARNING: Unraid requires special handling!"
            echo ""
            echo "Options for Node.js on Unraid:"
            echo "1. Use Docker container (recommended)"
            echo "2. Install via Community Applications plugin"
            echo "3. Manual installation to /boot/extra/ for persistence"
            echo ""
            echo "For now, checking if Node.js is already available..."
            
            # Check if node exists (might be installed via plugin)
            if command -v node &> /dev/null; then
                echo "Node.js found at: $(which node)"
                return 0
            fi
            
            # Check common Unraid locations
            if [ -f /boot/config/plugins/nodejs/node ]; then
                echo "Found Node.js in plugin directory"
                export PATH="/boot/config/plugins/nodejs:$PATH"
                return 0
            fi
            
            echo "ERROR: Node.js not found on Unraid!"
            echo "Please install Node.js via:"
            echo "1. Community Applications -> Search 'nodejs'"
            echo "2. Or use Docker deployment instead"
            return 1
            ;;
            
        *)
            # Try to detect based on ID_LIKE
            if [[ "$OS_LIKE" == *"debian"* ]]; then
                echo "Detected Debian-like system, using apt..."
                apt-get update
                apt-get install -y nodejs npm
            elif [[ "$OS_LIKE" == *"rhel"* ]] || [[ "$OS_LIKE" == *"fedora"* ]]; then
                echo "Detected RHEL-like system, using dnf..."
                dnf install -y nodejs npm
            else
                echo "ERROR: Unknown OS '$OS'. Cannot install Node.js automatically."
                echo "Please install Node.js manually and run this script again."
                return 1
            fi
            ;;
    esac
}

# Install jq based on OS
install_jq() {
    case "$OS" in
        "debian"|"ubuntu")
            apt-get install -y jq
            ;;
        "rhel"|"centos"|"fedora"|"rocky"|"almalinux")
            dnf install -y jq
            ;;
        "alpine")
            apk add --no-cache jq
            ;;
        "arch")
            pacman -S --noconfirm jq
            ;;
        "macos")
            brew install jq
            ;;
        "freebsd")
            pkg install -y jq
            ;;
        "unraid")
            # jq might be available via nerdtools or other plugins
            if ! command -v jq &> /dev/null; then
                echo "WARNING: jq not found on Unraid. Agent status check may fail."
            fi
            ;;
        *)
            if [[ "$OS_LIKE" == *"debian"* ]]; then
                apt-get install -y jq
            elif [[ "$OS_LIKE" == *"rhel"* ]] || [[ "$OS_LIKE" == *"fedora"* ]]; then
                dnf install -y jq
            else
                echo "WARNING: Cannot install jq on unknown OS"
            fi
            ;;
    esac
}

# Main deployment starts here
detect_os

# Check if node is already installed
if command -v node &> /dev/null; then
    echo "Node.js is already installed: $(node --version)"
else
    echo "Node.js not found. Installing..."
    if ! install_nodejs; then
        echo "Failed to install Node.js. Exiting."
        exit 1
    fi
fi

# Install jq if not present
if ! command -v jq &> /dev/null; then
    echo "Installing jq..."
    install_jq
fi

# Special handling for Unraid - use /boot/config for persistence
if [ "$OS" = "unraid" ]; then
    AGENT_DIR="/boot/config/plugins/ai-agent"
    echo "Using Unraid persistent directory: $AGENT_DIR"
fi

# Create agent directory
if [ "$USER" != "root" ]; then
    echo "horse123" | sudo -S mkdir -p $AGENT_DIR
    echo "horse123" | sudo -S chown $USER:$USER $AGENT_DIR
else
    mkdir -p $AGENT_DIR
fi

cd $AGENT_DIR

# Backup current agent if exists
if [ -d web-agent ]; then
  mv web-agent web-agent.backup.$(date +%Y%m%d_%H%M%S)
fi

# Extract new agent
tar -xzf /tmp/agent-deploy.tar.gz
cd web-agent

# Create .env file
cat > .env << ENVEOF
PORT=3080
AGENT_ID=$HOSTNAME-agent
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-your-api-key}
ENVEOF

# Install dependencies
echo "Installing dependencies..."
npm install

# Build TypeScript
echo "Building TypeScript..."
npm run build

# For Unraid, create a special startup script
if [ "$OS" = "unraid" ]; then
    cat > /boot/config/go.d/ai-agent.sh << 'GOSCRIPT'
#!/bin/bash
# AI Agent startup for Unraid
cd /boot/config/plugins/ai-agent/web-agent
nohup node dist/index.js > /var/log/ai-agent.log 2>&1 &
GOSCRIPT
    chmod +x /boot/config/go.d/ai-agent.sh
    echo "Created Unraid startup script"
    
    # Start the agent now
    cd /boot/config/plugins/ai-agent/web-agent
    nohup node dist/index.js > /var/log/ai-agent.log 2>&1 &
    echo "Started AI agent on Unraid"
else
    # For other systems, use PM2 or systemd
    # ... (existing PM2/systemd code)
fi

echo "Agent deployment complete on $HOSTNAME!"
EOF

# Cleanup local
rm agent-deploy.tar.gz

echo "Deployment finished for $HOSTNAME!"