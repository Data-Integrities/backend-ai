#!/bin/bash

# Backend AI Complete System Deployment Script
# Deploys hub, all workers, and manages version synchronization
# Uses parallel deployment for maximum speed

# Parse command line arguments
DEBUG=false
VERBOSE=false
VERSION=""
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--debug)
            DEBUG=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS] [VERSION]"
            echo "Options:"
            echo "  -d, --debug     Enable debug output"
            echo "  -v, --verbose   Enable verbose output"
            echo "  -h, --help      Show this help message"
            exit 0
            ;;
        *)
            VERSION="$1"
            shift
            ;;
    esac
done

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Debug function
debug() {
    if [ "$DEBUG" = true ]; then
        echo -e "${YELLOW}[DEBUG]${NC} $@" >&2
    fi
}

# Verbose function
verbose() {
    if [ "$VERBOSE" = true ] || [ "$DEBUG" = true ]; then
        echo -e "${BLUE}[INFO]${NC} $@" >&2
    fi
}

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}→${NC} $1"
}

print_section() {
    echo -e "${BLUE}════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}════════════════════════════════════════${NC}"
}

# Get current version and increment it
get_next_version() {
    local current_version=$(grep '"version"' shared/package.json | cut -d'"' -f4)
    local major=$(echo $current_version | cut -d'.' -f1)
    local minor=$(echo $current_version | cut -d'.' -f2)
    local patch=$(echo $current_version | cut -d'.' -f3)
    
    # Increment patch version
    patch=$((patch + 1))
    echo "$major.$minor.$patch"
}

# If VERSION wasn't provided as argument, auto-increment
if [ -z "$VERSION" ]; then
    VERSION=$(get_next_version)
fi

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║   Backend AI Complete System Deployment       ║"
echo "║              Version: $VERSION                  ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""
echo "This will deploy:"
echo "  • Hub (192.168.1.30)"
echo "  • All configured workers (nginx, pve1, pve2, pve3, unraid)"
echo "  • Shared configuration"
echo ""
echo "Starting deployment..."

# Start deployment timer
DEPLOY_START=$(date +%s)

# Create deployment logs directory (absolute path)
DEPLOY_LOGS_DIR="$PWD/logs/deployment"

# Clean and recreate deployment logs directory
if [ -d "$DEPLOY_LOGS_DIR" ]; then
    print_info "Cleaning previous deployment logs..."
    rm -rf "$DEPLOY_LOGS_DIR"/*
fi

# Always ensure the directory structure exists
mkdir -p "$DEPLOY_LOGS_DIR/build"

print_section "Pre-deployment Checks"

# Check if backend-ai-config.json exists
if [ ! -f "./backend-ai-config.json" ]; then
    print_error "backend-ai-config.json not found!"
    exit 1
fi

print_status "Configuration file found"

# Update version using update-versions.sh
print_info "Updating version to $VERSION..."
./update-versions.sh $VERSION >/dev/null 2>&1

print_section "Phase 1: Building Shared Module"

print_info "Cleaning old builds..."
rm -rf agent/dist agent/manager/dist shared/dist hub/dist

# Create build logs directory (after cleaning, this needs to be recreated)
BUILD_LOGS_DIR="$DEPLOY_LOGS_DIR/build"
mkdir -p "$BUILD_LOGS_DIR"

print_info "Building shared module (required by all components)..."
cd shared
if ! npm run build > "$BUILD_LOGS_DIR/shared.log" 2>&1; then
    print_error "Shared module build failed! See $BUILD_LOGS_DIR/shared.log"
    tail -20 "$BUILD_LOGS_DIR/shared.log"
    exit 1
fi
cd ..
print_status "Shared module built successfully"

print_section "Phase 2: Parallel Build & Deploy"

print_info "Starting parallel build and deployment..."
print_info "→ Hub thread: Build → Deploy to 192.168.1.30"
print_info "→ Worker thread: Build agent/manager → Deploy to 5 workers"
echo ""

# Track thread status
HUB_THREAD_STATUS="pending"
WORKER_THREAD_STATUS="pending"

# Function to build and deploy hub
build_and_deploy_hub() {
    {
        echo "[HUB-THREAD] Starting at $(date)"
        echo "[HUB-THREAD] Building hub..."
        
        cd hub
        npm install > "$BUILD_LOGS_DIR/hub-npm-install.log" 2>&1
        if ! npm run build > "$BUILD_LOGS_DIR/hub-build.log" 2>&1; then
            echo "[HUB-THREAD] ERROR: Hub build failed!"
            echo "[HUB-THREAD] Last 20 lines of build log:"
            tail -20 "$BUILD_LOGS_DIR/hub-build.log"
            return 1
        fi
        cd ..
        echo "[HUB-THREAD] Hub built successfully"
        
        # Original hub deployment code starts here
        echo "[HUB-THREAD] Creating hub deployment package..."

print_info "Creating hub deployment package..."

# Build hub deployment package
rm -f hub-deployment-package.tar.gz

# Create a temporary directory structure matching the hub layout  
HUB_TEMP_DIR=$(mktemp -d)
mkdir -p $HUB_TEMP_DIR/backend-ai/hub
mkdir -p $HUB_TEMP_DIR/backend-ai/shared

# Copy shared module
cp -r shared/dist $HUB_TEMP_DIR/backend-ai/shared/
cp shared/package.json $HUB_TEMP_DIR/backend-ai/shared/

# Copy hub files
cp -r hub/dist $HUB_TEMP_DIR/backend-ai/hub/
cp hub/package.json $HUB_TEMP_DIR/backend-ai/hub/
cp -r hub/node_modules $HUB_TEMP_DIR/backend-ai/hub/
cp -r hub/gui $HUB_TEMP_DIR/backend-ai/hub/
cp -r hub/assets $HUB_TEMP_DIR/backend-ai/hub/

# Fix shared module symlink by copying the actual module
rm -f $HUB_TEMP_DIR/backend-ai/hub/node_modules/@proxmox-ai-control/shared
cp -r shared $HUB_TEMP_DIR/backend-ai/hub/node_modules/@proxmox-ai-control/shared

# Copy backend-ai-config.json
cp backend-ai-config.json $HUB_TEMP_DIR/

# Copy utilities if they exist
if [ -d "utilities" ]; then
    mkdir -p $HUB_TEMP_DIR/backend-ai/utilities
    cp -r utilities/* $HUB_TEMP_DIR/backend-ai/utilities/
    chmod +x $HUB_TEMP_DIR/backend-ai/utilities/*.js 2>/dev/null || true
    chmod +x $HUB_TEMP_DIR/backend-ai/utilities/*.sh 2>/dev/null || true
fi

# Create the tarball from the temp directory
tar -czf hub-deployment-package.tar.gz \
    --exclude='*.log' \
    --exclude='*.md' \
    --exclude='.git' \
    --exclude='test' \
    --exclude='tests' \
    --exclude='docs' \
    --exclude='example' \
    --exclude='examples' \
    -C $HUB_TEMP_DIR \
    .

# Cleanup temp directory
rm -rf $HUB_TEMP_DIR

# Get file size
HUB_PACKAGE_SIZE=$(du -h hub-deployment-package.tar.gz | cut -f1)
print_status "Hub deployment package created ($HUB_PACKAGE_SIZE)"

print_info "Deploying to hub (192.168.1.30)..."

# Check if hub is reachable
if ! ssh -o ConnectTimeout=5 root@192.168.1.30 "echo 'Connected'" &>/dev/null; then
    print_error "Cannot connect to hub (192.168.1.30)"
    echo "Cannot connect to hub (192.168.1.30)" > "$DEPLOY_LOGS_DIR/hub.log"
    exit 1
fi

print_status "Connected to hub"

# Stop services
print_info "Stopping hub services..."
ssh root@192.168.1.30 "systemctl stop ai-hub 2>/dev/null || true"

# Backup current installation
print_info "Creating backup..."
ssh root@192.168.1.30 "
    if [ -d /opt/backend-ai ]; then
        cp -r /opt/backend-ai /opt/backend-ai.backup.\$(date +%Y%m%d_%H%M%S)
    fi
"

# Deploy files
print_info "Deploying hub (this may take a moment)..."
scp -q hub-deployment-package.tar.gz root@192.168.1.30:/tmp/

# Extract and setup
ssh root@192.168.1.30 << 'HUB_SCRIPT'
set -e
cd /opt

# Extract new files
echo "Extracting deployment package..."
tar -xzf /tmp/hub-deployment-package.tar.gz

# Copy config to standard location
if [ -f backend-ai-config.json ] && [ ! -f /opt/backend-ai-config.json ]; then
    cp backend-ai-config.json /opt/backend-ai-config.json
    echo "Installed backend-ai-config.json"
elif [ -f /opt/backend-ai-config.json ]; then
    echo "backend-ai-config.json already in place"
fi

rm /tmp/hub-deployment-package.tar.gz
echo "Hub deployment files extracted"

# Fix ownership to ensure everything is owned by root:root  
echo "Fixing file ownership..."
chown -R root:root /opt/backend-ai

HUB_SCRIPT

# Update service file with CONFIG_PATH if needed
print_info "Updating service configuration..."
ssh root@192.168.1.30 "
    if ! grep -q 'CONFIG_PATH=/opt/backend-ai-config.json' /etc/systemd/system/ai-hub.service; then
        sed -i '/Environment=\"NODE_ENV=production\"/a Environment=\"CONFIG_PATH=/opt/backend-ai-config.json\"' /etc/systemd/system/ai-hub.service
        systemctl daemon-reload
    fi
"

# Start services
print_info "Starting hub services..."
ssh root@192.168.1.30 "systemctl start ai-hub"

# Verify deployment
print_info "Verifying hub deployment..."
sleep 3

# Check if hub API is responding
for i in {1..10}; do
    if curl -s http://192.168.1.30/ >/dev/null 2>&1; then
        print_status "Hub API is responding"
        break
    fi
    if [ $i -eq 10 ]; then
        print_error "Hub API is not responding after 30 seconds"
        echo "Hub API is not responding after 30 seconds" > "$DEPLOY_LOGS_DIR/hub.log"
        ssh root@192.168.1.30 "journalctl -u ai-hub -n 20 --no-pager" >> "$DEPLOY_LOGS_DIR/hub.log" 2>&1
        exit 1
    fi
    sleep 3
done

print_status "Hub deployment completed successfully!"

# Mark hub deployment as successful
touch "$DEPLOY_LOGS_DIR/hub.success"

# Cleanup
rm -f hub-deployment-package.tar.gz
        
        echo "[HUB-THREAD] Hub deployment completed successfully!"
        echo "[HUB-THREAD] Finished at $(date)"
        return 0
    } 2>&1 | tee "$DEPLOY_LOGS_DIR/hub-thread.log"
}

# Function to build and deploy workers
build_and_deploy_workers() {
    {
        echo "[WORKER-THREAD] Starting at $(date)"
        echo "[WORKER-THREAD] Building agent..."
        
        cd agent
        npm install > "$BUILD_LOGS_DIR/agent-npm-install.log" 2>&1
        if ! npm run build > "$BUILD_LOGS_DIR/agent-build.log" 2>&1; then
            echo "[WORKER-THREAD] ERROR: Agent build failed!"
            echo "[WORKER-THREAD] Last 20 lines of build log:"
            tail -20 "$BUILD_LOGS_DIR/agent-build.log"
            return 1
        fi
        cd ..
        echo "[WORKER-THREAD] Agent built successfully"
        
        echo "[WORKER-THREAD] Building manager..."
        cd agent/manager
        npm install > "$BUILD_LOGS_DIR/manager-npm-install.log" 2>&1
        if ! npm run build > "$BUILD_LOGS_DIR/manager-build.log" 2>&1; then
            echo "[WORKER-THREAD] ERROR: Manager build failed!"
            echo "[WORKER-THREAD] Last 20 lines of build log:"
            tail -20 "$BUILD_LOGS_DIR/manager-build.log"
            return 2
        fi
        cd ../..
        echo "[WORKER-THREAD] Manager built successfully"
        
        # Original worker deployment code starts here
        echo "[WORKER-THREAD] Creating worker deployment package..."

# Configuration
WORKERS=("192.168.1.2" "192.168.1.5" "192.168.1.6" "192.168.1.7" "192.168.1.10")
WORKER_NAMES=("nginx" "pve1" "pve2" "pve3" "unraid")

# Read node paths from configuration for each worker
WORKER_NODE_PATHS=()
for name in "${WORKER_NAMES[@]}"; do
    NODE_PATH=$(jq -r ".agents[] | select(.name == \"$name\") | .nodePath" backend-ai-config.json)
    WORKER_NODE_PATHS+=("$NODE_PATH")
done

# Function to deploy to a single worker
deploy_to_worker() {
    local WORKER_IP=$1
    local WORKER_NAME=$2
    local NODE_PATH=$3
    
    echo ""
    echo "════════════════════════════════════════"
    echo "Deploying to $WORKER_NAME ($WORKER_IP)"
    echo "════════════════════════════════════════"
    debug "Starting deploy_to_worker function for $WORKER_NAME"
    
    # Check if worker is reachable
    debug "Checking if $WORKER_NAME is reachable..."
    if ! ssh -o ConnectTimeout=5 root@$WORKER_IP "echo 'Connected'" &>/dev/null; then
        print_error "Cannot connect to $WORKER_NAME ($WORKER_IP)"
        debug "Failed to connect to $WORKER_NAME - returning 1"
        return 1
    fi
    
    print_status "Connected to $WORKER_NAME"
    debug "Successfully connected to $WORKER_NAME"
    
    # Stop services
    print_info "Stopping services..."
    debug "Stopping services on $WORKER_NAME"
    ssh root@$WORKER_IP "
        if [ -d /etc/systemd/system ]; then
            systemctl stop ai-agent ai-agent-manager 2>/dev/null || true
        elif [ -d /etc/rc.d ]; then
            /etc/rc.d/rc.ai-agent stop 2>/dev/null || true
            /etc/rc.d/rc.ai-agent-manager stop 2>/dev/null || true
        fi
    "
    
    debug "Services stopped on $WORKER_NAME"
    
    # Backup current installation
    print_info "Creating backup..."
    debug "Creating backup on $WORKER_NAME"
    ssh root@$WORKER_IP "
        if [ -d /opt/ai-agent ]; then
            cp -r /opt/ai-agent /opt/ai-agent.backup.\$(date +%Y%m%d_%H%M%S)
        fi
    "
    
    debug "Backup created on $WORKER_NAME"
    
    # Deploy files
    print_info "Deploying agent and manager (this may take a moment)..."
    debug "Starting file deployment to $WORKER_NAME"
    scp -q deployment-package.tar.gz root@$WORKER_IP:/tmp/
    debug "deployment-package.tar.gz copied to $WORKER_NAME"
    
    # Extract and setup
    debug "Running remote setup script on $WORKER_NAME"
    ssh root@$WORKER_IP << REMOTE_SCRIPT
set -e
cd /opt
WORKER_NAME="$WORKER_NAME"
NODE_PATH="$NODE_PATH"

# Remove old installation
rm -rf /opt/ai-agent/web-agent* /opt/ai-agent/manager.js 2>/dev/null || true

# Extract new files
echo "Extracting deployment package..."
tar -xzf /tmp/deployment-package.tar.gz

# Self-heal: Fix ownership to ensure everything is owned by root:root
echo "Fixing file ownership..."
chown -R root:root /opt/ai-agent

# Check if Node.js is available for rc.d systems
if [ -f /etc/rc.d/rc.ai-agent ]; then
    if [ ! -x "$NODE_PATH" ]; then
        echo "WARNING: Node.js not found at $NODE_PATH"
        echo "The AI Agent services will not be able to start"
        echo "For Unraid systems, ensure /boot/config/go installs Node.js on boot"
    else
        echo "Node.js found at $NODE_PATH"
    fi
fi

# Copy config to standard location
if [ -f backend-ai-config.json ] && [ ! -f /opt/backend-ai-config.json ]; then
    cp backend-ai-config.json /opt/backend-ai-config.json
    echo "Installed backend-ai-config.json"
elif [ -f /opt/backend-ai-config.json ]; then
    echo "backend-ai-config.json already in place"
fi

# Detect init system and update service files
if [ -d /etc/systemd/system ]; then
    # SystemD system (Linux)
    if [ -f systemd/ai-agent.service ]; then
        # Force overwrite service files
        cp -f systemd/ai-agent.service /etc/systemd/system/
        cp -f systemd/ai-agent-manager.service /etc/systemd/system/
        # Copy wrapper scripts
        cp -f systemd/ai-agent-start.sh /opt/ai-agent/
        cp -f systemd/ai-agent-manager-stop.sh /opt/ai-agent/
        cp -f systemd/ai-agent-manager-start.sh /opt/ai-agent/
        cp -f systemd/ai-agent-manager-restart.sh /opt/ai-agent/
        chmod +x /opt/ai-agent/ai-agent-start.sh
        chmod +x /opt/ai-agent/ai-agent-manager-stop.sh
        chmod +x /opt/ai-agent/ai-agent-manager-start.sh
        chmod +x /opt/ai-agent/ai-agent-manager-restart.sh
        # Set AGENT_NAME in service files
        sed -i "s/AGENT_NAME_PLACEHOLDER/\$WORKER_NAME/g" /etc/systemd/system/ai-agent.service
        sed -i "s/AGENT_NAME_PLACEHOLDER/\$WORKER_NAME/g" /etc/systemd/system/ai-agent-manager.service
        systemctl daemon-reload
        echo "Updated systemd service files with AGENT_NAME=\$WORKER_NAME"
    fi
elif [ -d /etc/rc.d ]; then
    # RC system (FreeBSD/unraid)
    if [ -d rc.d ]; then
        # Use rc.* scripts for unraid
        cp rc.d/rc.ai-agent /etc/rc.d/
        cp rc.d/rc.ai-agent-manager /etc/rc.d/
        # Copy wrapper scripts
        mkdir -p /opt/ai-agent/rc.d
        cp -f rc.d/ai-agent-start.sh /opt/ai-agent/rc.d/
        cp -f rc.d/ai-agent-manager-stop.sh /opt/ai-agent/rc.d/
        cp -f rc.d/ai-agent-manager-start.sh /opt/ai-agent/rc.d/
        cp -f rc.d/ai-agent-manager-restart.sh /opt/ai-agent/rc.d/
        chmod +x /opt/ai-agent/rc.d/ai-agent-start.sh
        chmod +x /opt/ai-agent/rc.d/ai-agent-manager-stop.sh
        chmod +x /opt/ai-agent/rc.d/ai-agent-manager-start.sh
        chmod +x /opt/ai-agent/rc.d/ai-agent-manager-restart.sh
        # Set AGENT_NAME in service files
        sed -i "s/AGENT_NAME_PLACEHOLDER/\$WORKER_NAME/g" /etc/rc.d/rc.ai-agent
        sed -i "s/AGENT_NAME_PLACEHOLDER/\$WORKER_NAME/g" /etc/rc.d/rc.ai-agent-manager
        chmod +x /etc/rc.d/rc.ai-agent /etc/rc.d/rc.ai-agent-manager
        echo "Updated rc.d service files with AGENT_NAME=\$WORKER_NAME"
    fi
fi

rm /tmp/deployment-package.tar.gz
echo "Deployment files extracted"
REMOTE_SCRIPT
    
    debug "Remote setup script completed on $WORKER_NAME"
    
    # Start services
    print_info "Starting services..."
    debug "Starting services on $WORKER_NAME"
    ssh root@$WORKER_IP "
        if [ -d /etc/systemd/system ]; then
            systemctl start ai-agent-manager
            sleep 2
            systemctl start ai-agent
        elif [ -d /etc/rc.d ]; then
            /etc/rc.d/rc.ai-agent-manager start
            sleep 2
            /etc/rc.d/rc.ai-agent start
        fi
    "
    
    debug "Service start commands sent to $WORKER_NAME"
    
    # Verify deployment
    print_info "Verifying deployment..."
    debug "Starting deployment verification for $WORKER_NAME"
    
    # Check manager
    local manager_check_cmd="if [ -d /etc/systemd/system ]; then systemctl is-active ai-agent-manager; else curl -s http://localhost:3081/status >/dev/null 2>&1 && echo active; fi"
    debug "Checking manager with command: $manager_check_cmd"
    if ssh root@$WORKER_IP "$manager_check_cmd" 2>/dev/null | grep -q active; then
        print_status "Manager is running"
        debug "Manager check passed for $WORKER_NAME"
    else
        print_error "Manager failed to start"
        debug "Manager check FAILED for $WORKER_NAME - returning 1"
        return 1
    fi
    
    # Check agent
    local agent_check_cmd="if [ -d /etc/systemd/system ]; then systemctl is-active ai-agent; else curl -s http://localhost:3080/api/status >/dev/null 2>&1 && echo active; fi"
    debug "Checking agent with command: $agent_check_cmd"
    if ssh root@$WORKER_IP "$agent_check_cmd" 2>/dev/null | grep -q active; then
        print_status "Agent is running"
        debug "Agent check passed for $WORKER_NAME"
    else
        print_error "Agent failed to start"
        debug "Agent check FAILED for $WORKER_NAME - returning 1"
        return 1
    fi
    
    # Check API endpoint with retries
    local api_ready=false
    debug "Starting API endpoint check for $WORKER_NAME"
    for i in {1..10}; do
        debug "API check attempt $i/10 for $WORKER_NAME"
        if ssh root@$WORKER_IP "curl -s http://localhost:3080/api/status" &>/dev/null; then
            api_ready=true
            debug "API endpoint responded on attempt $i for $WORKER_NAME"
            break
        fi
        sleep 2
    done
    
    if [ "$api_ready" = true ]; then
        print_status "Agent API is responding"
        debug "API check passed for $WORKER_NAME"
    else
        print_error "Agent API is not responding after 20 seconds"
        debug "API check FAILED for $WORKER_NAME - returning 1"
        return 1
    fi
    
    print_status "Deployment to $WORKER_NAME completed successfully!"
    debug "All checks passed for $WORKER_NAME - returning 0"
    return 0
}

print_info "Creating worker deployment package..."
rm -f deployment-package.tar.gz

# Create a temporary directory structure matching the worker layout
TEMP_DIR=$(mktemp -d)
mkdir -p $TEMP_DIR/ai-agent/agent
mkdir -p $TEMP_DIR/ai-agent/manager
mkdir -p $TEMP_DIR/ai-agent/shared
mkdir -p $TEMP_DIR/systemd

# Copy shared module
cp -r shared/dist $TEMP_DIR/ai-agent/shared/
cp shared/package.json $TEMP_DIR/ai-agent/shared/

# Copy all files
cp -r agent/dist $TEMP_DIR/ai-agent/agent/
cp agent/package.json $TEMP_DIR/ai-agent/agent/
cp -r agent/node_modules $TEMP_DIR/ai-agent/agent/

cp -r agent/manager/dist $TEMP_DIR/ai-agent/manager/
cp agent/manager/package.json $TEMP_DIR/ai-agent/manager/
cp -r agent/manager/node_modules $TEMP_DIR/ai-agent/manager/

# Fix shared module symlinks by copying the actual module
rm -f $TEMP_DIR/ai-agent/agent/node_modules/@proxmox-ai-control/shared
rm -f $TEMP_DIR/ai-agent/manager/node_modules/@proxmox-ai-control/shared
cp -r shared $TEMP_DIR/ai-agent/agent/node_modules/@proxmox-ai-control/shared
cp -r shared $TEMP_DIR/ai-agent/manager/node_modules/@proxmox-ai-control/shared

# Copy systemd service files and wrapper scripts
cp agent/templates/systemd/*.service $TEMP_DIR/systemd/
cp agent/templates/systemd/*.sh $TEMP_DIR/systemd/ 2>/dev/null || true

# Copy rc.d files and wrapper scripts for FreeBSD/unraid
if [ -d "agent/templates/rc.d" ]; then
    mkdir -p $TEMP_DIR/rc.d
    cp agent/templates/rc.d/* $TEMP_DIR/rc.d/
fi

# Copy scripts directory
if [ -d "agent/scripts" ]; then
    mkdir -p $TEMP_DIR/ai-agent/scripts
    cp -r agent/scripts/* $TEMP_DIR/ai-agent/scripts/
    chmod +x $TEMP_DIR/ai-agent/scripts/*.sh 2>/dev/null || true
fi

# Copy utilities if they exist
if [ -d "utilities" ]; then
    mkdir -p $TEMP_DIR/ai-agent/utilities
    cp -r utilities/* $TEMP_DIR/ai-agent/utilities/
    chmod +x $TEMP_DIR/ai-agent/utilities/*.js 2>/dev/null || true
    chmod +x $TEMP_DIR/ai-agent/utilities/*.sh 2>/dev/null || true
fi

# Copy backend-ai-config.json
cp backend-ai-config.json $TEMP_DIR/

# Create the tarball from the temp directory
tar -czf deployment-package.tar.gz \
    --exclude='*.log' \
    --exclude='*.md' \
    --exclude='.git' \
    --exclude='test' \
    --exclude='tests' \
    --exclude='docs' \
    --exclude='example' \
    --exclude='examples' \
    -C $TEMP_DIR \
    .

# Cleanup temp directory
rm -rf $TEMP_DIR

# Get file size
PACKAGE_SIZE=$(du -h deployment-package.tar.gz | cut -f1)
print_status "Worker deployment package created ($PACKAGE_SIZE)"

# Deploy to workers in parallel
FAILED_WORKERS=()
SUCCESSFUL_WORKERS=()

print_info "Starting parallel deployment to ${#WORKERS[@]} workers..."
echo ""

# Start all deployments in parallel, capturing output to separate files
for i in ${!WORKERS[@]}; do
    # Capture values in local variables to avoid subshell issues
    WORKER_IP="${WORKERS[$i]}"
    WORKER_NAME="${WORKER_NAMES[$i]}"
    WORKER_NODE_PATH="${WORKER_NODE_PATHS[$i]}"
    
    {
        # Disable set -e for background process
        set +e
        
        # Initialize exit code file with failure status
        echo "1" > "$DEPLOY_LOGS_DIR/${WORKER_NAME}.exitcode"
        debug "Starting background deployment for ${WORKER_NAME}"
        
        echo "[BACKGROUND-START] $(date) Starting deployment for ${WORKER_NAME}" >> "$DEPLOY_LOGS_DIR/${WORKER_NAME}.log"
        
        # Run deployment and capture exit code
        deploy_to_worker "${WORKER_IP}" "${WORKER_NAME}" "${WORKER_NODE_PATH}" >> "$DEPLOY_LOGS_DIR/${WORKER_NAME}.log" 2>&1
        EXIT_CODE=$?
        
        echo "[BACKGROUND-END] $(date) Deployment finished for ${WORKER_NAME} with exit code: $EXIT_CODE" >> "$DEPLOY_LOGS_DIR/${WORKER_NAME}.log"
        
        # Write exit code and ensure it's flushed to disk
        echo "$EXIT_CODE" > "$DEPLOY_LOGS_DIR/${WORKER_NAME}.exitcode"
        sync
        
        if [ $EXIT_CODE -eq 0 ]; then
            echo "[BACKGROUND] Deployment completed successfully for ${WORKER_NAME} (exit code: $EXIT_CODE)" >> "$DEPLOY_LOGS_DIR/${WORKER_NAME}.log"
        else
            echo "[BACKGROUND] Deployment FAILED for ${WORKER_NAME} (exit code: $EXIT_CODE)" >> "$DEPLOY_LOGS_DIR/${WORKER_NAME}.log"
        fi
        sync
    } &
done

# Wait for all background jobs to complete
wait

# Now process results and show output
for i in ${!WORKER_NAMES[@]}; do
    WORKER_NAME="${WORKER_NAMES[$i]}"
    
    # Show the deployment log
    if [ -f "$DEPLOY_LOGS_DIR/$WORKER_NAME.log" ]; then
        cat "$DEPLOY_LOGS_DIR/$WORKER_NAME.log"
    fi
    
    # Check exit code
    if [ -f "$DEPLOY_LOGS_DIR/$WORKER_NAME.exitcode" ]; then
        EXIT_CODE=$(cat "$DEPLOY_LOGS_DIR/$WORKER_NAME.exitcode")
        if [ "$EXIT_CODE" = "0" ]; then
            SUCCESSFUL_WORKERS+=("$WORKER_NAME")
        else
            FAILED_WORKERS+=("$WORKER_NAME")
        fi
    else
        # No exit code file means something went very wrong
        FAILED_WORKERS+=("$WORKER_NAME")
    fi
done

# Deployment logs are saved in logs/deployment/
echo -e "\n${BLUE}Deployment logs saved in: $DEPLOY_LOGS_DIR${NC}"
echo -e "${BLUE}(Logs will be cleared on next deployment)${NC}"

# Write worker results to file for parent shell
echo "${#SUCCESSFUL_WORKERS[@]}" > "$DEPLOY_LOGS_DIR/successful-workers.count"
echo "${#FAILED_WORKERS[@]}" > "$DEPLOY_LOGS_DIR/failed-workers.count"
for worker in "${SUCCESSFUL_WORKERS[@]}"; do
    echo "$worker" >> "$DEPLOY_LOGS_DIR/successful-workers.list"
done
for worker in "${FAILED_WORKERS[@]}"; do
    echo "$worker" >> "$DEPLOY_LOGS_DIR/failed-workers.list"
done

# Cleanup
rm -f deployment-package.tar.gz
        
        echo "[WORKER-THREAD] All workers processed"
        echo "[WORKER-THREAD] Finished at $(date)"
        return 0
    } 2>&1 | tee "$DEPLOY_LOGS_DIR/worker-thread.log"
}

# Start both threads in parallel
echo "🚀 Launching parallel build and deployment threads..."
echo ""

# Start hub thread
(
    build_and_deploy_hub
    HUB_EXIT_CODE=$?
    echo $HUB_EXIT_CODE > "$DEPLOY_LOGS_DIR/hub-thread.exitcode"
) &
HUB_PID=$!

# Start worker thread
(
    build_and_deploy_workers
    WORKER_EXIT_CODE=$?
    echo $WORKER_EXIT_CODE > "$DEPLOY_LOGS_DIR/worker-thread.exitcode"
) &
WORKER_PID=$!

# Show progress while waiting
echo "⏳ Waiting for both threads to complete..."
echo "   Hub thread PID: $HUB_PID"
echo "   Worker thread PID: $WORKER_PID"
echo ""

# Wait for both threads
wait $HUB_PID
HUB_EXIT=$?
wait $WORKER_PID
WORKER_EXIT=$?

# Read actual exit codes from files
if [ -f "$DEPLOY_LOGS_DIR/hub-thread.exitcode" ]; then
    HUB_EXIT=$(cat "$DEPLOY_LOGS_DIR/hub-thread.exitcode")
fi
if [ -f "$DEPLOY_LOGS_DIR/worker-thread.exitcode" ]; then
    WORKER_EXIT=$(cat "$DEPLOY_LOGS_DIR/worker-thread.exitcode")
fi

print_section "Phase 3: Deployment Summary"

# Calculate deployment time
DEPLOY_END=$(date +%s)
DEPLOY_DURATION=$((DEPLOY_END - DEPLOY_START))
DEPLOY_MINUTES=$((DEPLOY_DURATION / 60))
DEPLOY_SECONDS=$((DEPLOY_DURATION % 60))

# Determine thread status
if [ $HUB_EXIT -eq 0 ]; then
    HUB_THREAD_STATUS="success"
else
    HUB_THREAD_STATUS="failed"
    case $HUB_EXIT in
        1) HUB_THREAD_ERROR="Hub build failed" ;;
        2) HUB_THREAD_ERROR="Hub deployment failed" ;;
        *) HUB_THREAD_ERROR="Unknown error (exit code: $HUB_EXIT)" ;;
    esac
fi

if [ $WORKER_EXIT -eq 0 ]; then
    WORKER_THREAD_STATUS="success"
else
    WORKER_THREAD_STATUS="failed"
    case $WORKER_EXIT in
        1) WORKER_THREAD_ERROR="Agent build failed" ;;
        2) WORKER_THREAD_ERROR="Manager build failed" ;;
        3) WORKER_THREAD_ERROR="Worker deployment failed" ;;
        *) WORKER_THREAD_ERROR="Unknown error (exit code: $WORKER_EXIT)" ;;
    esac
fi

# Create deployment status table
echo ""
echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║                    DEPLOYMENT STATUS TABLE                        ║"
echo "╠═══════════╤═══════════╤═══════════════════════════════════════════╣"
echo "║ Component │ Status    │ Notes                                     ║"
echo "╠═══════════╪═══════════╪═══════════════════════════════════════════╣"

# Thread summary
if [ "$HUB_THREAD_STATUS" = "success" ]; then
    printf "║ %-9s │ %-9s │ %-41s ║\n" "Hub Thread" "✅ SUCCESS" "Build + Deploy completed"
else
    printf "║ %-9s │ %-9s │ %-41s ║\n" "Hub Thread" "❌ FAILED" "$HUB_THREAD_ERROR"
fi

if [ "$WORKER_THREAD_STATUS" = "success" ]; then
    printf "║ %-9s │ %-9s │ %-41s ║\n" "Workers" "✅ SUCCESS" "Build + Deploy completed"
else
    printf "║ %-9s │ %-9s │ %-41s ║\n" "Workers" "❌ FAILED" "$WORKER_THREAD_ERROR"
fi

echo "╠═══════════╪═══════════╪═══════════════════════════════════════════╣"
echo "║ Machine   │ Status    │ Notes                                     ║"
echo "╠═══════════╪═══════════╪═══════════════════════════════════════════╣"

# Hub status (always deployed first)
if [ -f "$DEPLOY_LOGS_DIR/hub.success" ]; then
    printf "║ %-9s │ %-9s │ %-41s ║\n" "hub" "✅ SUCCESS" "Deployed successfully"
else
    HUB_ERROR=$(tail -n 3 "$DEPLOY_LOGS_DIR/hub.log" 2>/dev/null | grep -E "(error|failed)" -i | head -1 | cut -c1-40 || echo "Check logs for details")
    printf "║ %-9s │ %-9s │ %-41s ║\n" "hub" "❌ FAILED" "$HUB_ERROR"
fi

# Read worker results from files
SUCCESSFUL_WORKERS=()
FAILED_WORKERS=()
if [ -f "$DEPLOY_LOGS_DIR/successful-workers.list" ]; then
    while IFS= read -r worker; do
        SUCCESSFUL_WORKERS+=("$worker")
    done < "$DEPLOY_LOGS_DIR/successful-workers.list"
fi
if [ -f "$DEPLOY_LOGS_DIR/failed-workers.list" ]; then
    while IFS= read -r worker; do
        FAILED_WORKERS+=("$worker")
    done < "$DEPLOY_LOGS_DIR/failed-workers.list"
fi

# Worker statuses
for worker in "${WORKER_NAMES[@]}"; do
    if [[ " ${SUCCESSFUL_WORKERS[@]} " =~ " ${worker} " ]]; then
        # Check for warnings even in successful deployments
        WARNING=$(grep -E "(warning|no space|timeout)" -i "$DEPLOY_LOGS_DIR/$worker.log" 2>/dev/null | head -1 | cut -c1-40 || echo "")
        if [ -n "$WARNING" ]; then
            printf "║ %-9s │ %-9s │ %-41s ║\n" "$worker" "⚠️  SUCCESS" "$WARNING..."
        else
            printf "║ %-9s │ %-9s │ %-41s ║\n" "$worker" "✅ SUCCESS" "Deployed successfully"
        fi
    else
        # Extract error message
        ERROR_MSG=$(tail -n 5 "$DEPLOY_LOGS_DIR/$worker.log" 2>/dev/null | grep -E "(error|failed|refused|timeout)" -i | head -1 | cut -c1-40 || echo "Check logs for details")
        printf "║ %-9s │ %-9s │ %-41s ║\n" "$worker" "❌ FAILED" "$ERROR_MSG..."
    fi
done

echo "╚═══════════╧═══════════╧═══════════════════════════════════════════╝"
echo ""

# Show summary counts
TOTAL_SUCCESS=0
TOTAL_FAILED=0

# Count successes
if [ -f "$DEPLOY_LOGS_DIR/hub.success" ]; then
    ((TOTAL_SUCCESS++))
else
    ((TOTAL_FAILED++))
fi
TOTAL_SUCCESS=$((TOTAL_SUCCESS + ${#SUCCESSFUL_WORKERS[@]}))
TOTAL_FAILED=$((TOTAL_FAILED + ${#FAILED_WORKERS[@]}))

echo ""
if [ $TOTAL_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All deployments successful: 1 hub + ${#SUCCESSFUL_WORKERS[@]} workers${NC}"
else
    echo -e "${GREEN}✅ Successful: $TOTAL_SUCCESS${NC}"
    echo -e "${RED}❌ Failed: $TOTAL_FAILED${NC}"
fi

# Show thread timing
echo ""
echo "⏱️  Thread Timing:"
if [ -f "$DEPLOY_LOGS_DIR/hub-thread.log" ]; then
    HUB_START=$(grep "Starting at" "$DEPLOY_LOGS_DIR/hub-thread.log" | head -1 | cut -d' ' -f4-)
    HUB_END=$(grep "Finished at" "$DEPLOY_LOGS_DIR/hub-thread.log" | tail -1 | cut -d' ' -f4-)
    if [ -n "$HUB_START" ] && [ -n "$HUB_END" ]; then
        echo "   Hub thread: $HUB_START → $HUB_END"
    fi
fi
if [ -f "$DEPLOY_LOGS_DIR/worker-thread.log" ]; then
    WORKER_START=$(grep "Starting at" "$DEPLOY_LOGS_DIR/worker-thread.log" | head -1 | cut -d' ' -f4-)
    WORKER_END=$(grep "Finished at" "$DEPLOY_LOGS_DIR/worker-thread.log" | tail -1 | cut -d' ' -f4-)
    if [ -n "$WORKER_START" ] && [ -n "$WORKER_END" ]; then
        echo "   Worker thread: $WORKER_START → $WORKER_END"
    fi
fi

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║             Deployment Complete!              ║"
echo "║                                               ║"
echo "║  Version: $VERSION                             ║"
echo "║  Duration: ${DEPLOY_MINUTES}m ${DEPLOY_SECONDS}s                            ║"
echo "║  Hub: http://192.168.1.30/                    ║"
echo "╚═══════════════════════════════════════════════╝"

# Exit with error if any deployments failed
if [ $TOTAL_FAILED -gt 0 ] || [ "$HUB_THREAD_STATUS" = "failed" ] || [ "$WORKER_THREAD_STATUS" = "failed" ]; then
    echo ""
    echo "📋 Error Details:"
    
    # Show hub thread errors
    if [ "$HUB_THREAD_STATUS" = "failed" ]; then
        echo ""
        echo "Hub Thread Errors:"
        grep -E "ERROR:|error:|failed" "$DEPLOY_LOGS_DIR/hub-thread.log" | tail -10
    fi
    
    # Show worker thread errors
    if [ "$WORKER_THREAD_STATUS" = "failed" ]; then
        echo ""
        echo "Worker Thread Errors:"
        grep -E "ERROR:|error:|failed" "$DEPLOY_LOGS_DIR/worker-thread.log" | tail -10
    fi
    
    exit 1
fi

print_status "All systems deployed successfully!"

# Add Claude-specific tasks
echo ""
echo "[CLAUDE-TODO] Post-deployment tasks detected:"

# Always verify versions
echo "[CLAUDE-TODO] 1. Verify all agent versions match $VERSION"
echo "[CLAUDE-TODO] 2. Check unraid manager version is no longer hardcoded as 2.0.19"

# If there were failures, add investigation tasks
if [ ${#FAILED_WORKERS[@]} -gt 0 ]; then
    echo ""
    echo "[CLAUDE-TODO] ⚠️  FAILURES DETECTED - INVESTIGATE IMMEDIATELY:"
    TASK_NUM=3
    for worker in "${FAILED_WORKERS[@]}"; do
        echo "[CLAUDE-TODO] $TASK_NUM. Investigate $worker failure:"
        echo "   - Check deployment log: cat $DEPLOY_LOGS_DIR/$worker.log"
        echo "   - SSH to $worker and check service status"
        echo "   - Look for disk space issues, network problems, or service conflicts"
        ((TASK_NUM++))
    done
    echo "[CLAUDE-TODO] $TASK_NUM. After fixing issues, re-run deployment for failed workers"
else
    echo "[CLAUDE-TODO] 3. Test chat logging functionality"
    echo "[CLAUDE-TODO] 4. Announce completion with 'backend-ai ready'"
fi

# If there were warnings (even in successful deployments), note them
if grep -q -E "(warning|no space|timeout)" -i $DEPLOY_LOGS_DIR/*.log 2>/dev/null; then
    echo ""
    echo "[CLAUDE-TODO] ⚠️  WARNINGS DETECTED:"
    echo "[CLAUDE-TODO] - Review logs for warnings about disk space, timeouts, or other issues"
    echo "[CLAUDE-TODO] - Pay special attention to unraid's 'No space left on device' errors"
fi