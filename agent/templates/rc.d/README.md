# rc.d Service Scripts for Unraid/FreeBSD Systems

This directory contains service management scripts for rc.d-based systems (primarily Unraid). These scripts provide the same functionality as the systemd scripts but adapted for the rc.d init system.

## Files

### 1. `rc.ai-agent`
The main service script for the AI Agent. This script:
- Manages the agent lifecycle (start/stop/restart/status)
- Runs the agent using Node.js with the compiled JavaScript
- Reads configuration from `/opt/ai-agent/backend-ai-config.json`
- Sets the `AGENT_NAME` environment variable from the config
- Handles PID file management for tracking the running process
- Provides standard rc.d service commands

**Usage:**
```bash
/etc/rc.d/rc.ai-agent start|stop|restart|status
```

### 2. `rc.ai-agent-manager`
The service script for the Agent Manager. This script:
- Manages the manager service that controls the agent lifecycle
- Listens on port 3081 for lifecycle commands from the hub
- Handles agent start/stop/restart operations with correlation tracking
- Runs independently of the agent (can start/stop the agent)
- Provides a REST API for remote agent management

**Usage:**
```bash
/etc/rc.d/rc.ai-agent-manager start|stop|restart|status
```

### 3. `ai-agent-start.sh`
A wrapper script that enables correlation tracking on rc.d systems. This script:
- Accepts an optional `correlationId` parameter
- Writes the correlationId to a file (`.correlationId`) for the agent to read
- Calls the actual rc.d service script to start the agent
- Enables the hub to track agent startup operations across the network

**Usage:**
```bash
# Start normally (no correlation tracking)
/opt/ai-agent/rc.d/ai-agent-start.sh

# Start with correlation tracking
/opt/ai-agent/rc.d/ai-agent-start.sh "corr_12345"
```

## How They Work Together

1. **Normal Operation**: The agent runs via `rc.ai-agent` and the manager runs via `rc.ai-agent-manager`

2. **Hub-Initiated Start**: 
   - Hub sends start command with correlationId to manager (port 3081)
   - Manager calls `ai-agent-start.sh` with the correlationId
   - `ai-agent-start.sh` writes correlationId to file and starts agent
   - Agent reads correlationId and reports back to hub

3. **Auto-Start on Boot**: Both rc.d scripts can be enabled in Unraid's go file:
   ```bash
   # In /boot/config/go
   /etc/rc.d/rc.ai-agent-manager start
   /etc/rc.d/rc.ai-agent start
   ```

## Platform Compatibility

These scripts provide equivalent functionality to the systemd scripts but work with Unraid's Slackware-based rc.d init system. The correlation tracking wrapper (`ai-agent-start.sh`) bridges the gap between systemd's environment variable passing and rc.d's simpler design.

## File Locations After Deployment

- `/etc/rc.d/rc.ai-agent` - Agent service script
- `/etc/rc.d/rc.ai-agent-manager` - Manager service script  
- `/opt/ai-agent/rc.d/ai-agent-start.sh` - Correlation wrapper script