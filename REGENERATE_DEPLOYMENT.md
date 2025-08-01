# Backend AI Deployment Regeneration Rules

This document defines the deployment automation, service management, and platform-specific configurations for the Backend AI system.

## Overview

The deployment system handles:
- Building and packaging components
- Distributing to multiple platforms (Linux/Unraid)
- Service management (systemd/rc.d)
- Version control and auto-incrementing
- Platform-specific adaptations

## Deployment Script (deploy-everything.sh)

### Version Management

**Auto-increment HTML version**:
```bash
# Extract current version
CURRENT_VERSION=$(grep -o 'Backend AI Hub (v[0-9.]*' hub/gui/index.html | grep -o 'v[0-9.]*' | sed 's/v//')

# Increment patch version
IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR=${VERSION_PARTS[0]}
MINOR=${VERSION_PARTS[1]}
PATCH=${VERSION_PARTS[2]}
NEW_PATCH=$((PATCH + 1))
NEW_VERSION="${MAJOR}.${MINOR}.${NEW_PATCH}"

# Update HTML file
sed -i.bak "s/Backend AI Hub (v${CURRENT_VERSION}/Backend AI Hub (v${NEW_VERSION}/" hub/gui/index.html
```

### Build Process

**Parallel builds after shared module**:
1. Build shared components first (required by all)
2. Then in parallel:
   - **Hub thread**: Build hub → Package → Deploy to 192.168.1.30
   - **Worker thread**: Build agent → Build manager → Package → Deploy to all workers

```bash
# Phase 1: Shared module (sequential - required by all)
npm run build:shared

# Phase 2: Parallel execution
Thread 1:                    Thread 2:
├─ npm run build:hub        ├─ npm run build:agent
├─ Create hub package       ├─ npm run build:manager
└─ Deploy to hub            ├─ Create worker package
                           └─ Deploy to 5 workers (parallel)
```

### Packaging Structure

**Hub package** (`hub-package.tar.gz`):
```
hub/
├── dist/          # Compiled TypeScript
├── gui/           # Web interface
├── node_modules/  # Dependencies
└── package.json   # Manifest
```

**Agent package** (`agent-package.tar.gz`):
```
dist/             # Compiled agent code
manager/          # Manager with dist/
templates/        # Service files and scripts
node_modules/     # Dependencies
package.json      # Manifest
backend-ai-config.json  # Configuration
```

### Deployment Targets

**Hub**: Always deployed to 192.168.1.30

**Workers** (deployed in parallel):
```bash
WORKERS=(
    "192.168.1.2:nginx:systemd"
    "192.168.1.5:pve1:systemd"
    "192.168.1.6:pve2:systemd"
    "192.168.1.7:pve3:systemd"
    "192.168.1.10:unraid:rc.d"
)
```

### Parallel Architecture

**Thread-based deployment** (NEW):
```bash
# After shared module builds, launch two threads
(
    build_and_deploy_hub
) &
HUB_PID=$!

(
    build_and_deploy_workers  # This internally deploys to all 5 workers in parallel
) &
WORKER_PID=$!

wait $HUB_PID $WORKER_PID
```

**Benefits**:
- Hub doesn't wait for agent/manager builds
- Workers don't wait for hub deployment
- Total time: max(hub_path, worker_path) instead of sum
- Typical time savings: 30-40%

### Service Management During Deploy

1. **Stop services** before extracting files
2. **Extract with proper ownership**: `-o root -g root`
3. **Set executable permissions** on scripts
4. **Start services** after extraction

### Platform-Specific Handling

**systemd platforms**:
```bash
systemctl stop ai-agent ai-agent-manager
# ... deploy files ...
systemctl start ai-agent-manager ai-agent
```

**rc.d platforms (Unraid)**:
```bash
/etc/rc.d/rc.ai-agent stop
/etc/rc.d/rc.ai-agent-manager stop
# ... deploy files ...
/etc/rc.d/rc.ai-agent-manager start
/etc/rc.d/rc.ai-agent start
```

### Error Handling

**Thread-Level Error Tracking**:
```bash
# Each thread writes its exit code
echo $EXIT_CODE > "$DEPLOY_LOGS_DIR/hub-thread.exitcode"
echo $EXIT_CODE > "$DEPLOY_LOGS_DIR/worker-thread.exitcode"
```

**Comprehensive Error Reporting**:
1. **Build failures** - Show last 20 lines of build log
2. **Thread status** - Track which thread failed
3. **Individual worker failures** - Still tracked within worker thread
4. **Summary table** - Shows both thread-level and machine-level status

**Error Report Example**:
```
═══════════════════════════════════════════════
           DEPLOYMENT STATUS TABLE              
═══════════╤═══════════╤═══════════════════════
Component │ Status    │ Notes                 
═══════════╪═══════════╪═══════════════════════
Hub Thread │ ✅ SUCCESS │ Build + Deploy completed
Workers    │ ❌ FAILED  │ Manager build failed   
═══════════╧═══════════╧═══════════════════════

📋 Error Details:
Worker Thread Errors:
[WORKER-THREAD] ERROR: Manager build failed!
src/index.ts:45:10 - error TS2339: Property 'foo' does not exist
```

## Service Files

### systemd Service (ai-agent.service)

```ini
[Unit]
Description=Backend AI Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ai-agent
ExecStart=/usr/bin/node /opt/ai-agent/dist/index.js
Restart=always
RestartSec=10
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
```

### systemd Manager Service (ai-agent-manager.service)

```ini
[Unit]
Description=Backend AI Agent Manager
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ai-agent/manager
ExecStart=/usr/bin/node /opt/ai-agent/manager/dist/index.js
Restart=always
RestartSec=10
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
```

### rc.d Scripts (Unraid)

**Structure**:
```bash
#!/bin/bash
#
# Backend AI Agent/Manager control script
#

case "$1" in
  start)
    # Check for Node.js first
    if ! command -v node &> /dev/null; then
        echo "Node.js is not installed"
        exit 1
    fi
    # Start service
    ;;
  stop)
    # Stop service
    ;;
  restart)
    $0 stop
    sleep 2
    $0 start
    ;;
  status)
    # Check if running
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
```

## Platform-Specific Adaptations

### Node.js Locations

**Machine-specific paths** (from backend-ai-config.json):
- Hub: `/usr/bin/node`
- nginx: `/usr/bin/node`
- pve1/2/3: `/usr/bin/node`
- unraid: `/usr/bin/node`

The deployment script reads each machine's nodePath from the configuration and verifies Node.js exists at that location during deployment.

### Node.js on Unraid

**Boot-time installation** (`/boot/config/go`):
```bash
# Install Node.js if not present
if [ ! -f /usr/bin/node ]; then
    echo "Installing Node.js..."
    cd /tmp
    wget https://nodejs.org/dist/v18.17.0/node-v18.17.0-linux-x64.tar.xz
    tar -xf node-v18.17.0-linux-x64.tar.xz
    cp -r node-v18.17.0-linux-x64/* /usr/
    chmod +x /usr/bin/node /usr/bin/npm
fi
```

**Important**: Use glibc version, not musl (Alpine) version

### File Permissions

**Extraction flags**:
```bash
tar -xzf package.tar.gz -C /opt/ai-agent --overwrite -o root -g root
```

**Script permissions**:
```bash
chmod +x /opt/ai-agent/templates/systemd/*.sh
chmod +x /opt/ai-agent/templates/rc.d/*.sh
chmod +x /opt/ai-agent/kill-service.sh
chmod +x /etc/rc.d/rc.ai-agent*
```

### Log Locations

**systemd platforms**: Use journald
```bash
journalctl -u ai-agent -f
journalctl -u ai-agent-manager -f
```

**rc.d platforms**: Use file logging
```bash
/opt/ai-agent/logs/agent.log
/opt/ai-agent/logs/manager.log
```

## Deployment Verification

### Post-Deployment Checks

1. **Service Status**:
   ```bash
   systemctl is-active ai-agent
   curl -s http://localhost:3080/status
   ```

2. **Version Verification**:
   ```bash
   curl -s http://192.168.1.30/api/agents | jq '.agents[].version'
   ```

3. **Connectivity Test**:
   ```bash
   curl -s http://192.168.1.30/api/agents | jq '.agents[].online'
   ```

### Rollback Strategy

Keep previous version packages:
```bash
mv agent-package.tar.gz agent-package-$(date +%Y%m%d-%H%M%S).tar.gz
```

Quick rollback if needed:
```bash
# Stop services
# Extract previous package
# Start services
```

## Configuration Management

### backend-ai-config.json

Deployed to all workers, contains:
```json
{
  "hub": {
    "url": "http://192.168.1.30",
    "port": 80
  },
  "defaults": {
    "agent": {
      "port": 3080,
      "processPattern": "dist/index.js"
    },
    "manager": {
      "port": 3081,
      "processPattern": "manager/dist/index"
    }
  }
}
```

### Environment Variables

Set in service files:
- `NODE_ENV=production`
- `HUB_URL=http://192.168.1.30`

## Script Templates

### Manager Start Wrapper (systemd)

```bash
#!/bin/bash
CORRELATION_ID="$1"
systemctl start ai-agent-manager

# Send callback when ready
# ... monitoring logic ...
```

### Manager Stop Wrapper (systemd)

```bash
#!/bin/bash
CORRELATION_ID="$1"
AGENT_NAME="${AGENT_NAME:-unknown}"

# Write to temp file for background process
echo "$AGENT_NAME" > /tmp/ai-agent-manager-stop-${CORRELATION_ID}.agentName

systemctl stop ai-agent-manager

# Background monitor
(
    AGENT_NAME=$(cat /tmp/ai-agent-manager-stop-${CORRELATION_ID}.agentName)
    # ... monitoring logic ...
    # Send callback when stopped
) > /var/log/ai-agent-manager-stop-${CORRELATION_ID}.log 2>&1 &
```

## Deployment Command

### Full Deployment

```bash
./deploy-everything.sh
```

### Deploy to Specific Worker

Currently not supported - always deploys to all workers

### Future Enhancement

Add selective deployment:
```bash
./deploy-everything.sh --only nginx,pve1
./deploy-everything.sh --exclude unraid
```

## Troubleshooting

### Common Issues

1. **Permission Denied**:
   - Ensure tar uses `-o root -g root`
   - Check script has execute permissions

2. **Service Won't Start**:
   - Check Node.js is installed
   - Verify working directory exists
   - Check port not already in use

3. **Unraid Node.js Missing**:
   - Run `/boot/config/go` manually
   - Check `/usr/bin/node` exists
   - Verify it's glibc version, not musl

### Debug Mode

Add to deploy script:
```bash
set -x  # Enable debug output
```

## Security Considerations

1. **SSH Keys**: Assumes passwordless SSH setup
2. **Root Access**: Deployment requires root
3. **Network Security**: Internal network only
4. **No Secrets in Code**: Use environment variables

## Future Improvements

1. **Parallel Hub/Worker Deploy**: Deploy hub and workers simultaneously
2. **Selective Deployment**: Deploy to specific workers only
3. **Automatic Rollback**: On deployment failure
4. **Health Check Integration**: Verify services after deploy
5. **Zero-Downtime Deploy**: Rolling updates