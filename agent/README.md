# Backend AI Agent

The Backend AI Agent is a lightweight service that runs on each managed machine, executing commands and reporting system status back to the hub.

## Architecture

```
AI Hub (192.168.1.30:80)
    │
    │ HTTP Polling (every 30s)
    ▼
AI Agent (:3080)
    │
    ├── Capabilities System
    ├── Command Executor  
    └── Status Reporter
```

## Key Features

- **Port**: Always runs on port 3080
- **Stateless**: No persistent connections, responds to HTTP requests only
- **Capability-Based**: Dynamically loads capabilities from README files
- **Safe Execution**: Validates commands before execution
- **Multi-Platform**: Supports Linux (systemd) and Unraid (rc.d)

## API Endpoints

### Core Endpoints

- `GET /api/status` - Agent health and system information
- `GET /api/capabilities` - Available capabilities and commands
- `POST /api/execute` - Execute shell commands (with validation)
- `POST /api/chat` - Natural language command processing
- `GET /api/version` - Agent version information

### Service Management

- `GET /api/services` - List system services
- `POST /api/services/:service/:action` - Control services (start/stop/restart)
- `GET /api/logs` - Retrieve system or service logs

## Capabilities System

The agent dynamically loads capabilities from the `/capabilities` directory. Each capability:
- Has its own README.md describing what it can do
- Registers command patterns it can handle
- Provides safe, validated execution

Example capabilities:
- System management (built-in)
- Service control (built-in)
- Cloudflare DNS management (`/capabilities/cloudflare-dns`)
- Docker management (when docker is detected)

## Configuration

The agent reads configuration from:
1. `/opt/ai-agent/backend-ai-config.json` - Main configuration
2. Environment variables - For sensitive data
3. Capability-specific configs - In capability directories

## Deployment

Agents are deployed differently based on the target system:

### Linux/Proxmox (Native)
```bash
./deploy-agent-v2.sh hostname username
```
- Installs to `/opt/ai-agent/`
- Creates systemd service `ai-agent.service`
- Managed by `ai-agent-manager.service`

### Unraid (Docker/Native)
```bash
./deploy-agent-unraid-docker.sh hostname
```
- Can run in Docker or native
- Uses rc.d scripts for service management
- Managed by rc.ai-agent-manager

## Working with the Manager

Each agent has a companion manager service on port 3081 that handles:
- Starting/stopping the agent
- Remote updates
- Health monitoring
- Log access

See [Manager Pattern Documentation](/docs/patterns/MANAGER_PATTERN.md) for details.

## Security

- Only responds to requests from authorized IPs (hub)
- No authentication required (relies on network security)
- Commands are validated before execution
- Sensitive operations require explicit capability

## Adding New Capabilities

1. Create directory: `/agent/capabilities/your-capability/`
2. Add `README.md` describing the capability
3. Add `capability-your-name.md` with command patterns
4. Agent will auto-discover on next restart

## Troubleshooting

### Agent Not Responding
```bash
# Check if running
systemctl status ai-agent  # Linux
/etc/rc.d/rc.ai-agent status  # Unraid

# Test directly
curl http://localhost:3080/api/status
```

### View Logs
```bash
# Linux
journalctl -u ai-agent -f

# Unraid
tail -f /opt/ai-agent/logs/agent.log
```

### Manual Control
```bash
# Through manager (preferred)
curl -X POST http://localhost:3081/restart

# Direct service control
systemctl restart ai-agent  # Linux
/etc/rc.d/rc.ai-agent restart  # Unraid
```