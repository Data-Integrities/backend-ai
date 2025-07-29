# Agent Manager

A minimal service that controls the Backend AI Agent lifecycle on each machine.

## Purpose

The agent manager is a separate service that runs on port 3081 and provides lifecycle control for the agent service. It handles:
- Starting/stopping the agent
- Updating the agent to new versions
- Checking agent status
- Retrieving agent logs

## Why Separate Manager?

1. **Reliability**: If the agent crashes, the manager can restart it
2. **Remote Updates**: The hub can update agents without SSH access
3. **Consistency**: Same API as hub manager (all on port 3081)
4. **Minimal**: No business logic, just lifecycle control

## Endpoints

### GET /status
```bash
curl http://192.168.1.2:3081/status
# Returns: {"running": true} or {"running": false}
```

### POST /start
```bash
curl -X POST http://192.168.1.2:3081/start
# Returns: {"success": true}
```

### POST /stop
```bash
curl -X POST http://192.168.1.2:3081/stop
# Returns: {"success": true}
```

### POST /restart
```bash
curl -X POST http://192.168.1.2:3081/restart
# Returns: {"success": true}
```

### POST /update
```bash
curl -X POST http://192.168.1.2:3081/update \
  -H "Content-Type: application/json" \
  -d '{"version": "2.0.11"}'
# Returns: {"success": true, "message": "Update to version 2.0.11 started"}
```

### GET /version
```bash
curl http://192.168.1.2:3081/version
# Returns: {"version": "2.0.10", "name": "@backend-ai/agent"}
```

### GET /logs
```bash
curl http://192.168.1.2:3081/logs?lines=100
# Returns: {"logs": "...", "lines": 100}
```

## How It Works

### Update Process
1. Hub sends version number to manager's POST /update
2. Manager runs update script
3. Script downloads agent-{version}.tar.gz from NAS
4. Script backs up current installation
5. Script extracts new version
6. Script restarts agent service

### Service Management
- Controls ai-agent.service via systemctl
- Monitors service status
- Handles start/stop/restart commands

## Installation

The agent manager is installed with the agent deployment scripts:

```bash
# Deploy to nginx machine
./deploy-agent.sh

# Deploy to unraid
./deploy-agent-unraid-docker.sh
```

This creates:
- `/opt/ai-agent/manager.js` - Manager service
- `/etc/systemd/system/ai-agent-manager.service` - Systemd unit
- `/opt/ai-agent/update-agent.sh` - Update script

## Security

- Listens on 0.0.0.0:3081 (accessible from network)
- No authentication (relies on network security)
- Can only control the local agent service
- Update script validates downloads

## Update Script

The manager uses `/opt/ai-agent/update-agent.sh`:

```bash
#!/bin/bash
VERSION=$1
NAS_URL="http://192.168.1.10:8888"
AGENT_URL="$NAS_URL/api/raw/$VERSION/agent-$VERSION.tar.gz"

# Download from NAS
curl -sL "$AGENT_URL" -o /tmp/agent-update.tar.gz

# Verify download
if [ ! -s /tmp/agent-update.tar.gz ]; then
    echo "Download failed"
    exit 1
fi

# Backup and update
cd /opt/ai-agent/agent
mv dist dist.backup.$(date +%Y%m%d_%H%M%S)
tar -xzf /tmp/agent-update.tar.gz

# Restart service
systemctl restart ai-agent.service
```

## Troubleshooting

### Check Manager Status
```bash
systemctl status ai-agent-manager
```

### View Manager Logs
```bash
journalctl -u ai-agent-manager -f
```

### Manual Update
If manager fails, you can run update manually:
```bash
/opt/ai-agent/update-agent.sh 2.0.11
```

### Test Endpoints
```bash
# From hub machine
curl http://nginx:3081/status
curl http://pve1:3081/status
curl http://unraid:3081/status
```

## Architecture

```
Hub (192.168.1.30)
├── Hub Service (port 3000)
├── Hub Manager (port 3081, localhost)
└── Communicates with →
    
Agent Machines
├── Agent Service (port 3080)
└── Agent Manager (port 3081, network)
```

The hub can update all agents by calling their managers:
```javascript
// Hub updates all agents
for (const agent of agents) {
  await axios.post(`http://${agent.ip}:3081/update`, {
    version: "2.0.11"
  });
}
```