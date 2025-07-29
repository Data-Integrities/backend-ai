# systemd Service Files for Linux Systems

This directory contains service management files for systemd-based Linux systems (Debian, Ubuntu, RHEL, etc.). These files provide service management, auto-start capabilities, and correlation tracking for the Backend AI agent system.

## Files

### 1. `ai-agent.service`
The main systemd service definition for the AI Agent. This service:
- Runs the compiled agent code from `/opt/ai-agent/agent/dist/api/index.js`
- Sets up environment variables including `AGENT_NAME` (placeholder replaced during deployment)
- Configured to restart automatically if it crashes (with 10-second delay)
- Depends on the manager service (starts after `ai-agent-manager.service`)
- Logs to systemd journal with identifier `ai-agent`

**Key settings:**
- Type: simple (long-running process)
- User: root (for system access)
- Working Directory: `/opt/ai-agent/agent`
- Auto-restart: always

### 2. `ai-agent-manager.service`
The systemd service definition for the Agent Manager. This service:
- Runs on port 3081 to handle lifecycle commands from the hub
- Manages agent start/stop/restart operations with correlation tracking
- Includes a complex `ExecStartPost` hook that:
  - Waits up to 120 seconds for the manager API to be ready
  - Reports success/failure back to the hub if correlationId is provided
- Starts before the agent service to ensure manager is available
- Auto-restarts on failure with 5-second delay

**Key settings:**
- Must start before `ai-agent.service`
- Monitors its own startup and reports to hub
- Logs to systemd journal with identifier `ai-agent-manager`

### 3. `ai-agent-start.sh`
A wrapper script that enables correlation tracking when starting the agent. This script:
- Accepts an optional `correlationId` parameter
- Writes the correlationId to `/opt/ai-agent/agent/.correlationId`
- Calls `systemctl start ai-agent` to start the service
- Allows the hub to track agent startup operations across the network

**Usage:**
```bash
# Start normally (no correlation tracking)
/opt/ai-agent/ai-agent-start.sh

# Start with correlation tracking
/opt/ai-agent/ai-agent-start.sh "corr_12345"
```

### 4. `ai-agent-manager-stop.sh`
Handles stopping the manager with correlation tracking. This script:
- Stops the manager service using systemctl
- If a correlationId was provided, sends completion callback to hub
- Reads hub URL from backend-ai-config.json
- Ensures the hub knows when the manager has been stopped

**Usage:**
```bash
# Stop with correlation tracking
/opt/ai-agent/ai-agent-manager-stop.sh "corr_12345"
```

## How They Work Together

1. **Normal Boot Sequence**:
   - systemd starts `ai-agent-manager.service`
   - Manager's ExecStartPost waits for API readiness
   - systemd then starts `ai-agent.service`
   - Both services run independently but manager can control agent

2. **Hub-Initiated Operations**:
   - Hub sends command with correlationId to manager (port 3081)
   - Manager uses wrapper scripts for correlation tracking:
     - `ai-agent-start.sh` for starting agent with tracking
     - Direct systemctl for stop (agent reports its own shutdown)
   - Agent reads correlationId file and reports status to hub

3. **Service Dependencies**:
   ```
   network.target
       ↓
   ai-agent-manager.service
       ↓
   ai-agent.service
   ```

## Deployment

During deployment, these files are:
1. Copied to `/etc/systemd/system/`
2. Modified to replace `AGENT_NAME_PLACEHOLDER` with actual agent name
3. Enabled with `systemctl enable` for auto-start
4. Started in the correct order

## Monitoring

Check service status:
```bash
systemctl status ai-agent-manager
systemctl status ai-agent

# View logs
journalctl -u ai-agent-manager -f
journalctl -u ai-agent -f
```

## Environment Variables

Both services use:
- `NODE_ENV=production`
- `AGENT_NAME=<specific-agent-name>`
- `CONFIG_PATH=/opt/backend-ai-config.json`

The AGENT_NAME is crucial for the agent to identify itself to the hub and load the correct configuration.