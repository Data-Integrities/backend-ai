# Hub Manager

A minimal service that controls the Backend AI Hub lifecycle.

## Purpose

The hub manager is a separate service that runs on port 3081 and provides lifecycle control for the main hub service. It handles:
- Starting/stopping the hub
- Updating the hub to new versions
- Checking hub status
- Retrieving hub logs

## Why Separate Manager?

1. **Reliability**: If the hub crashes, the manager can restart it
2. **Updates**: The hub can be updated without manual SSH access
3. **Consistency**: Same pattern as agent managers (all on port 3081)
4. **Security**: Manager only listens on localhost

## Endpoints

### GET /status
```bash
curl http://localhost:3081/status
# Returns: {"running": true} or {"running": false}
```

### POST /start
```bash
curl -X POST http://localhost:3081/start
# Returns: {"success": true}
```

### POST /stop
```bash
curl -X POST http://localhost:3081/stop
# Returns: {"success": true}
```

### POST /restart
```bash
curl -X POST http://localhost:3081/restart
# Returns: {"success": true}
```

### POST /update
```bash
curl -X POST http://localhost:3081/update \
  -H "Content-Type: application/json" \
  -d '{"version": "2.0.11"}'
# Returns: {"success": true, "message": "Hub update to version 2.0.11 started"}
```

### GET /version
```bash
curl http://localhost:3081/version
# Returns: {"version": "2.0.10", "name": "@proxmox-ai-control/hub"}
```

### GET /logs
```bash
curl http://localhost:3081/logs?lines=100
# Returns: {"service": "ai-hub.service", "lines": 100, "logs": "..."}
```

## How It Works

### Update Process
1. Receives version number via POST /update
2. Authenticates with NAS to download package
3. Downloads hub-{version}.tar.gz from NAS
4. Backs up current dist directory
5. Extracts new version
6. Restarts hub service via systemd

### Service Management
- Uses systemctl to control ai-hub.service
- Monitors service status via systemd
- Returns simple JSON responses

## Installation

The hub manager is installed automatically when deploying the hub:

```bash
./deploy-hub-with-manager.sh
```

This creates and enables the systemd service:
```
/etc/systemd/system/ai-hub-manager.service
```

## Security

- Listens only on 127.0.0.1 (localhost)
- Requires SSH access to the hub machine to use
- No authentication (relies on SSH access control)
- Can only control the local hub service

## Logs

View manager logs:
```bash
journalctl -u ai-hub-manager -f
```

View hub service logs through manager:
```bash
curl http://localhost:3081/logs
```

## Files

- `/opt/backend-ai/hub/dist/manager/index.js` - Manager service
- `/etc/systemd/system/ai-hub-manager.service` - Systemd unit file
- Port: 3081 (localhost only)