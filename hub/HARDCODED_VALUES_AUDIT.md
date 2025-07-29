# Backend AI - Hardcoded Values Audit

This document lists all hardcoded values found in the backend-ai project that should potentially be moved to configuration files.

## 1. IP Addresses

### Hub API (`hub/api/index.ts`)
- `192.168.1.10:8888` - NAS URL for updates and authentication (lines 399, 522)

### Hub Agents Config (`hub/agents-config.json`)
- `192.168.1.2` - nginx agent IP
- `192.168.1.5` - pve1 agent IP
- `192.168.1.6` - pve2 agent IP
- `192.168.1.7` - pve3 agent IP
- `192.168.1.10` - unraid agent IP

## 2. Port Numbers

### Hub
- `80` - Default hub port (`hub/api/index.ts:21`)
- `3081` - Hub manager port (`hub/manager/index.ts:13`)
- `3081` - Manager control port (multiple references in `hub/api/index.ts`)

### Agent
- `3080` - Default agent port (`agent/api/http-agent.ts:13`, `agent/api/index.ts:46`)
- `3081` - Agent manager port (`agent/manager/index.ts:12`)

### Other
- `8888` - NAS port (hardcoded in URLs)

## 3. File Paths

### Hub Paths
- `/opt/backend-ai/hub` - Hub directory (`hub/manager/index.ts:18`)
- `/opt/backend-ai/releases` - Releases directory (`hub/manager/index.ts:20`)
- `/tmp/hub-update.tar.gz` - Temporary update file
- `/tmp/hub-update.sh` - Temporary update script

### Agent Paths
- `/opt/ai-agent/agent` - Agent directory (multiple references)
- `/opt/ai-agent/update-agent.sh` - Update script path
- `/var/log/backend-ai-agent.log` - Agent log file
- `/var/log/ai-agent.log` - Alternative agent log file
- `/var/log/ai-agent-manager.log` - Manager log file
- `/var/run/ai-agent.pid` - PID file for unraid

## 4. Service Names

### Systemd Services
- `ai-hub.service` - Hub service name
- `ai-hub-manager` - Hub manager service
- `ai-agent` - Agent service name
- `ai-agent-manager` - Agent manager service
- `backend-ai-agent` - Alternative agent service name

### RC.D Scripts (Unraid)
- `/etc/rc.d/rc.ai-agent-manager` - Unraid manager script

## 5. Node Paths
- `/usr/bin/node` - Hardcoded in unraid scripts (though it does check for alternatives)

## 6. API Endpoints

### NAS Endpoints
- `/api/login` - NAS authentication
- `/api/raw/{version}/hub-{version}.tar.gz` - Hub update download
- `/api/raw/{version}/agent-{version}.tar.gz` - Agent update download

### Manager Endpoints
- `http://localhost:3081/status` - Manager status check
- `http://localhost:3081/releases/{version}/{file}` - Local release server

## 7. Other Hardcoded Values

### Identifiers
- `backend-ai-hub` - Hub ID (`hub/api/index.ts:306`)
- `CORRELATION_ID` - Environment variable name for correlation tracking

### Log Configuration
- Various console.log statements throughout the code
- Hardcoded log line limits (50, 100, etc.)

### SSH Configuration
- SSH commands assume root user in multiple places
- SSH key paths are somewhat configurable but have defaults

## Recommendations

1. **Create a central configuration file** (e.g., `config.json` or use environment variables) containing:
   - All IP addresses and ports
   - Service names
   - File paths
   - API endpoints

2. **Use environment variables** for deployment-specific values:
   - `HUB_PORT` (already partially implemented)
   - `AGENT_PORT` (already partially implemented)
   - `MANAGER_PORT`
   - `NAS_URL`
   - `HUB_DIR` (already partially implemented)
   - `AGENT_DIR`
   - `LOG_DIR`

3. **Create service-specific config files**:
   - Hub: `/opt/backend-ai/hub/config.json`
   - Agent: `/opt/ai-agent/agent/config.json`
   - Manager: Shared config or separate configs

4. **Standardize logging**:
   - Use a proper logging library instead of console.log
   - Configure log levels and destinations
   - Standardize log file locations

5. **Make SSH configuration more flexible**:
   - Allow configuring SSH user per agent
   - Support different authentication methods

6. **Consider using a configuration management system** for complex deployments