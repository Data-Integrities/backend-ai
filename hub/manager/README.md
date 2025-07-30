# Hub Manager

A minimal service that controls the Backend AI Hub lifecycle.

## Overview

The hub manager follows the standard Backend AI manager pattern. It runs on port 3081 (localhost only) and provides lifecycle control for the main hub service running on port 80.

**For detailed information about the manager pattern, endpoints, and best practices, see:**  
[Manager Pattern Documentation](/docs/patterns/MANAGER_PATTERN.md)

## Hub-Specific Details

### Configuration
- **Port**: 3081 (localhost only for security)
- **Service**: Controls `ai-hub.service`
- **Location**: `/opt/backend-ai/hub/manager`
- **Package**: Downloads from NAS as `hub-{version}.tar.gz`

### Installation

The hub manager is installed automatically when deploying the hub:
```bash
./deploy-hub-with-manager.sh
```

This creates and enables the systemd service:
```
/etc/systemd/system/ai-hub-manager.service
```

### Files
- `/opt/backend-ai/hub/dist/manager/index.js` - Manager service
- `/etc/systemd/system/ai-hub-manager.service` - Systemd unit file
- `/opt/backend-ai/backend-ai-config.json` - Configuration source

### Security Notes
- Listens only on 127.0.0.1 (localhost)
- Requires SSH access to the hub machine to use
- No authentication (relies on SSH access control)
- Can only control the local hub service

### Quick Commands
```bash
# Check status
curl http://localhost:3081/status

# Update hub
curl -X POST http://localhost:3081/update \
  -H "Content-Type: application/json" \
  -d '{"version": "2.1.44"}'

# View logs
journalctl -u ai-hub-manager -f
```