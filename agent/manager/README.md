# Agent Manager

A minimal service that controls the Backend AI Agent lifecycle on each machine.

## Overview

The agent manager follows the standard Backend AI manager pattern. It runs on port 3081 (network accessible) and provides lifecycle control for the agent service running on port 3080.

**For detailed information about the manager pattern, endpoints, and best practices, see:**  
[Manager Pattern Documentation](/docs/patterns/MANAGER_PATTERN.md)

## Agent-Specific Details

### Configuration
- **Port**: 3081 (network accessible)
- **Service**: Controls `ai-agent.service`
- **Location**: `/opt/ai-agent/manager`
- **Package**: Downloads from NAS as `agent-{version}.tar.gz`

### Platform Variants

#### Linux/Proxmox
- Uses systemd for service control
- Service: `ai-agent.service`
- Manager service: `ai-agent-manager.service`

#### Unraid
- Uses rc.d scripts for service control
- Service: `/etc/rc.d/rc.ai-agent`
- Manager service: `/etc/rc.d/rc.ai-agent-manager`

### Installation

The agent manager is installed with the agent deployment scripts:

```bash
# Deploy to Linux/Proxmox
./deploy-agent-v2.sh hostname username

# Deploy to Unraid
./deploy-agent-unraid-docker.sh hostname
```

### Files
- `/opt/ai-agent/manager/index.js` - Manager service (Linux)
- `/opt/ai-agent/manager/index-unraid.js` - Manager service (Unraid)
- `/opt/ai-agent/backend-ai-config.json` - Configuration source
- `/opt/ai-agent/update-agent.sh` - Update script

### Security Notes
- Listens on 0.0.0.0:3081 (accessible from network)
- No authentication (relies on network security)
- Can only control the local agent service
- Update script validates downloads

### Quick Commands
```bash
# Check status from hub
curl http://nginx:3081/status
curl http://pve1:3081/status
curl http://unraid:3081/status

# Update agent
curl -X POST http://nginx:3081/update \
  -H "Content-Type: application/json" \
  -d '{"version": "2.1.44"}'

# View logs
journalctl -u ai-agent-manager -f  # Linux
tail -f /opt/ai-agent/logs/manager.log  # Unraid
```

### Hub Integration

The hub can update all agents through their managers:
```javascript
// Hub updates all agents
for (const agent of agents) {
  await axios.post(`http://${agent.ip}:3081/update`, {
    version: "2.1.44"
  });
}
```