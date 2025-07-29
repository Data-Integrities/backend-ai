# Hub Manager Control Demo

The hub can now control agent managers remotely using system-specific commands!

## How It Works

1. **Configuration-Driven**: The hub reads `agents-config.json` to know:
   - Which system type each agent uses (systemd vs rc.d)
   - SSH access credentials
   - Service names and paths

2. **System-Aware Commands**:
   - **Systemd agents** (nginx, pve1-3): Uses `systemctl` commands
   - **Unraid agent**: Uses `/etc/rc.d/rc.ai-agent-manager` script

## New API Endpoints

### Control Individual Manager
```bash
# Start a manager
curl -X POST http://192.168.1.30/api/managers/nginx/start

# Stop a manager
curl -X POST http://192.168.1.30/api/managers/unraid/stop

# Restart a manager
curl -X POST http://192.168.1.30/api/managers/pve1/restart

# Check manager status
curl -X POST http://192.168.1.30/api/managers/nginx/status
```

### Bulk Operations
```bash
# Get all managers status
curl http://192.168.1.30/api/managers/status

# Emergency recovery - start all managers
curl -X POST http://192.168.1.30/api/managers/start-all
```

## Example Response
```json
{
  "agent": "unraid",
  "action": "start",
  "success": true,
  "output": "Starting AI Agent Manager...\nAI Agent Manager started successfully (PID: 12345)",
  "command": "/etc/rc.d/rc.ai-agent-manager start"
}
```

## SSH Requirements

The hub needs SSH access to each agent host. This is already configured since the hub can execute commands via SSH.

## Architecture Benefits

1. **No Chicken-and-Egg Problem**: Hub can start managers even if they're not running
2. **System-Specific**: Respects each system's service management approach
3. **Emergency Recovery**: Can recover from situations where all managers are down
4. **Centralized Control**: All manager operations through the hub API

## Future Enhancements

1. **GUI Integration**: Add manager control buttons to the web UI
2. **Health Monitoring**: Automatic manager restart if they crash
3. **Boot Configuration**: Ensure managers start on system boot
4. **Manager Updates**: Deploy new manager versions remotely