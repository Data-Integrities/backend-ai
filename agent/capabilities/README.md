# Agent Capabilities Backup

This directory contains a backup of all agent capabilities pulled from the live agents.
These files are for version control and backup purposes only.

**Important**: 
- These files are NOT deployed with the agent code
- Each agent maintains its own capabilities in `/opt/ai-agent/agent/capabilities/`
- The hub has NO knowledge of these capabilities
- Capabilities are agent-specific and only the agent itself knows about them
- The hub's only role is to route conversations to the appropriate agent

## Structure

Each subdirectory represents an agent:
- `nginx/` - Capabilities for the nginx agent
- `pve1/`, `pve2/`, `pve3/` - Capabilities for Proxmox VE nodes
- `unraid/` - Capabilities for the Unraid NAS

## Updating Capabilities

To pull the latest capabilities from all agents:
```bash
./pull-capabilities.sh
```

To push capability changes back to a specific agent:
```bash
# Example: Update nginx capabilities
scp capabilities/nginx/*.md root@192.168.1.2:/opt/ai-agent/agent/capabilities/
```

## Version Control

These files should be committed to git whenever:
1. Capabilities are added or modified on any agent
2. Before making a release
3. As part of regular backups

Last pulled: $(date)
