# Manager Service Pattern

The Backend AI system uses a consistent manager pattern for controlling service lifecycles. This document describes the shared pattern used by both hub and agent managers.

## Overview

Each major service (hub, agent) has a companion manager service that provides:
- Lifecycle control (start/stop/restart)
- Remote update capability
- Status monitoring
- Log access
- Crash recovery

## Architecture

```
Manager Service (Port 3081)
    │
    ├── Controls main service
    ├── Handles updates
    └── Reports status

Main Service (Port 80/3080)
    │
    └── Business logic only
```

## Why Separate Manager?

1. **Reliability**: If the main service crashes, the manager can restart it
2. **Remote Updates**: Services can be updated without SSH access
3. **Consistency**: All managers use the same API on port 3081
4. **Minimal**: Managers have no business logic, just lifecycle control
5. **Always Available**: Manager stays running during service updates

## Standard API Endpoints

All managers implement these endpoints on port 3081:

### GET /status
Check if the managed service is running
```bash
curl http://localhost:3081/status
```
Response:
```json
{
  "running": true,
  "managerVersion": "2.1.44",
  "workingDirectory": "/opt/ai-agent/manager"
}
```

### POST /start
Start the managed service
```bash
curl -X POST http://localhost:3081/start
```
Response:
```json
{"success": true}
```

### POST /stop
Stop the managed service
```bash
curl -X POST http://localhost:3081/stop
```
Response:
```json
{"success": true}
```

### POST /restart
Restart the managed service
```bash
curl -X POST http://localhost:3081/restart
```
Response:
```json
{"success": true}
```

### POST /update
Update the managed service to a new version
```bash
curl -X POST http://localhost:3081/update \
  -H "Content-Type: application/json" \
  -d '{"version": "2.1.44"}'
```
Response:
```json
{
  "success": true,
  "message": "Update to version 2.1.44 started"
}
```

### GET /version
Get version information
```bash
curl http://localhost:3081/version
```
Response:
```json
{
  "version": "2.1.44",
  "name": "@backend-ai/agent"
}
```

### GET /logs
Retrieve recent logs from the managed service
```bash
curl http://localhost:3081/logs?lines=100
```
Response:
```json
{
  "service": "ai-agent",
  "lines": 100,
  "logs": "..."
}
```

## Update Process Flow

1. Manager receives version via POST /update
2. Downloads package from configured source (NAS/registry)
3. Validates download integrity
4. Backs up current installation
5. Stops managed service
6. Extracts new version
7. Starts managed service
8. Verifies service is running

If any step fails, the manager can roll back to the backup.

## Implementation Variants

### Hub Manager
- **Port**: 3081 (localhost only for security)
- **Service**: Controls ai-hub.service
- **Location**: /opt/backend-ai/hub/manager

### Agent Manager
- **Port**: 3081 (network accessible)
- **Service**: Controls ai-agent.service
- **Location**: /opt/ai-agent/manager
- **Variants**:
  - Linux: Uses systemd (systemctl commands)
  - Unraid: Uses rc.d scripts (/etc/rc.d/rc.ai-agent)

## Security Considerations

1. **Network Access**:
   - Hub manager: localhost only (requires SSH to access)
   - Agent manager: Network accessible (for remote control)

2. **Authentication**:
   - No built-in auth (relies on network security)
   - Hub manager protected by SSH access
   - Agent managers protected by network isolation

3. **Validation**:
   - Downloads are verified before installation
   - Version numbers are validated
   - Backups ensure rollback capability

## Service Manager Integration

Managers integrate with the host's service management system:

### systemd (Linux/Proxmox)
```bash
systemctl start ai-agent
systemctl stop ai-agent
systemctl restart ai-agent
systemctl status ai-agent
```

### rc.d (Unraid)
```bash
/etc/rc.d/rc.ai-agent start
/etc/rc.d/rc.ai-agent stop
/etc/rc.d/rc.ai-agent restart
/etc/rc.d/rc.ai-agent status
```

## Best Practices

1. **Always use the manager** for service control (not direct systemctl/rc.d)
2. **Monitor manager health** separately from main service
3. **Test updates** on non-critical systems first
4. **Keep managers minimal** - no business logic
5. **Log all operations** for troubleshooting

## Troubleshooting

### Manager Not Responding
```bash
# Check manager service
systemctl status ai-agent-manager
journalctl -u ai-agent-manager -f
```

### Update Failures
- Check network connectivity to update source
- Verify disk space for downloads/backups
- Review manager logs for specific errors
- Manual rollback: restore from backup directory

### Service Won't Start
- Check main service logs via manager endpoint
- Verify configuration files are valid
- Ensure ports are not in use
- Check system resources (memory, disk)