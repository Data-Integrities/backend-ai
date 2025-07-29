#!/bin/bash

# Automatic Agent Deployment Script
# Detects OS and chooses appropriate deployment method

if [ $# -eq 0 ]; then
    echo "Usage: ./deploy-agent-auto.sh <hostname> [user]"
    echo "Example: ./deploy-agent-auto.sh nginx root"
    echo "Example: ./deploy-agent-auto.sh unraid root"
    exit 1
fi

HOSTNAME=$1
USER=${2:-root}

echo "Auto-detecting deployment method for $HOSTNAME..."

# Get IP from hostname using aliases
IP=$(grep "alias $HOSTNAME=" ~/.zsh/aliases.zsh | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)

if [ -z "$IP" ]; then
    echo "Error: Could not find IP for hostname $HOSTNAME"
    exit 1
fi

echo "Found IP: $IP for $HOSTNAME"

# Create OS detection script
cat > /tmp/detect-os.sh << 'DETECT_SCRIPT'
#!/bin/bash

# Function to detect OS
detect_os() {
    # Check for Unraid first (most specific)
    if [ -f /etc/unraid-version ]; then
        echo "OS_TYPE=unraid"
        echo "OS_VERSION=$(cat /etc/unraid-version | cut -d'"' -f2)"
        echo "DEPLOYMENT_METHOD=docker"
        return
    fi
    
    # Check for Proxmox
    if [ -f /etc/pve/version ]; then
        echo "OS_TYPE=proxmox"
        echo "OS_VERSION=$(cat /etc/pve/version)"
        echo "DEPLOYMENT_METHOD=native"
        return
    fi
    
    # Check for Windows (WSL)
    if grep -qi microsoft /proc/version 2>/dev/null; then
        echo "OS_TYPE=windows-wsl"
        echo "OS_VERSION=wsl"
        echo "DEPLOYMENT_METHOD=docker"
        return
    fi
    
    # Check for standard Linux distributions
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        echo "OS_TYPE=$ID"
        echo "OS_VERSION=$VERSION_ID"
        echo "OS_LIKE=$ID_LIKE"
        
        # Determine deployment method
        case "$ID" in
            debian|ubuntu|rhel|centos|fedora|rocky|almalinux|arch|alpine)
                echo "DEPLOYMENT_METHOD=native"
                ;;
            *)
                # Check ID_LIKE for derivatives
                if [[ "$ID_LIKE" == *"debian"* ]] || [[ "$ID_LIKE" == *"rhel"* ]] || [[ "$ID_LIKE" == *"fedora"* ]]; then
                    echo "DEPLOYMENT_METHOD=native"
                else
                    echo "DEPLOYMENT_METHOD=unknown"
                fi
                ;;
        esac
        return
    fi
    
    # Check for macOS
    if [ "$(uname)" = "Darwin" ]; then
        echo "OS_TYPE=macos"
        echo "OS_VERSION=$(sw_vers -productVersion)"
        echo "DEPLOYMENT_METHOD=native"
        return
    fi
    
    # Check for FreeBSD
    if [ "$(uname)" = "FreeBSD" ]; then
        echo "OS_TYPE=freebsd"
        echo "OS_VERSION=$(freebsd-version)"
        echo "DEPLOYMENT_METHOD=native"
        return
    fi
    
    # Unknown OS
    echo "OS_TYPE=unknown"
    echo "OS_VERSION=unknown"
    echo "DEPLOYMENT_METHOD=unknown"
}

# Additional checks for special environments
check_environment() {
    # Check if Docker is available (might influence deployment choice)
    if command -v docker &> /dev/null; then
        echo "DOCKER_AVAILABLE=yes"
        echo "DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | tr -d ',')"
    else
        echo "DOCKER_AVAILABLE=no"
    fi
    
    # Check if Node.js is available
    if command -v node &> /dev/null; then
        echo "NODE_AVAILABLE=yes"
        echo "NODE_VERSION=$(node --version)"
    else
        echo "NODE_AVAILABLE=no"
    fi
    
    # Check filesystem type (important for Unraid detection)
    ROOT_FS=$(df / | tail -1 | awk '{print $1}')
    if [[ "$ROOT_FS" == "rootfs" ]] || [[ "$ROOT_FS" == "tmpfs" ]]; then
        echo "ROOT_FS_TYPE=tmpfs"
        echo "ROOT_FS_PERSISTENT=no"
    else
        echo "ROOT_FS_TYPE=persistent"
        echo "ROOT_FS_PERSISTENT=yes"
    fi
    
    # Check for specific Unraid paths
    if [ -d /boot/config ] && [ -d /mnt/user ]; then
        echo "UNRAID_PATHS_FOUND=yes"
    else
        echo "UNRAID_PATHS_FOUND=no"
    fi
}

# Run detection
echo "=== OS Detection ==="
detect_os
echo ""
echo "=== Environment Check ==="
check_environment
DETECT_SCRIPT

# Copy detection script to target
scp /tmp/detect-os.sh $USER@$IP:/tmp/
rm /tmp/detect-os.sh

# Run detection on target and capture results
echo "Detecting OS on $HOSTNAME..."
OS_INFO=$(ssh $USER@$IP 'bash /tmp/detect-os.sh')

# Parse the results
eval "$OS_INFO"

echo ""
echo "Detection Results:"
echo "- OS Type: $OS_TYPE"
echo "- OS Version: $OS_VERSION"
echo "- Deployment Method: $DEPLOYMENT_METHOD"
echo "- Docker Available: $DOCKER_AVAILABLE"
echo "- Node Available: $NODE_AVAILABLE"

# Additional Unraid detection based on multiple factors
if [ "$OS_TYPE" = "unknown" ] && [ "$UNRAID_PATHS_FOUND" = "yes" ] && [ "$ROOT_FS_PERSISTENT" = "no" ]; then
    echo ""
    echo "Additional detection: This appears to be Unraid based on filesystem characteristics"
    DEPLOYMENT_METHOD="docker"
    OS_TYPE="unraid"
fi

# Choose deployment script based on detection
echo ""
case "$DEPLOYMENT_METHOD" in
    "native")
        echo "Using NATIVE deployment for $OS_TYPE"
        echo "Running: ./deploy-agent-v2.sh $HOSTNAME $USER"
        ./deploy-agent-v2.sh $HOSTNAME $USER
        ;;
        
    "docker")
        echo "Using DOCKER deployment for $OS_TYPE"
        if [ "$OS_TYPE" = "unraid" ]; then
            echo "Running: ./deploy-agent-unraid-docker.sh $HOSTNAME"
            ./deploy-agent-unraid-docker.sh $HOSTNAME
        else
            echo "Docker deployment for $OS_TYPE not yet implemented"
            echo "Please create a specific Docker deployment script for this OS"
            exit 1
        fi
        ;;
        
    "unknown"|*)
        echo "ERROR: Cannot determine deployment method for this system"
        echo "OS detection failed or OS is not supported"
        echo ""
        echo "You can manually choose:"
        echo "- For standard Linux: ./deploy-agent-v2.sh $HOSTNAME $USER"
        echo "- For Unraid: ./deploy-agent-unraid-docker.sh $HOSTNAME"
        exit 1
        ;;
esac

echo ""
echo "Deployment initiated!"

# Add reminder for Unraid
if [ "$OS_TYPE" = "unraid" ]; then
    echo ""
    echo "⚠️  UNRAID USERS: After deployment completes,"
    echo "   please enable autostart in the Docker tab"
fi