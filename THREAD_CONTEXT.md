# Backend AI - Thread Context

## Current State
I've built a complete AI-powered remote control system for Proxmox infrastructure with self-deploying agents. The system is now in `/Users/jeffk/Developement/provider-search/backend-ai/` and ready to be made into its own repository.

## Architecture Overview
```
backend-ai/
├── hub/                    # Central AI command hub (Express + HTTP API)
├── agent/                  # Linux agent for containers/VMs
├── agent-proxmox/          # Proxmox management agent with API integration
├── agent-windows/          # (Planned) Windows build machine agent
├── agent-macos/            # (Planned) macOS build machine agent
└── shared/                 # Shared TypeScript types
```

## Key Capabilities Implemented

### 1. Natural Language Command Processing
- Hub uses Claude AI to interpret commands like "restart the web server"
- Commands are routed to appropriate agents via HTTP polling
- Risk assessment and confirmation for dangerous operations

### 2. Linux Agent (Runs in Containers/VMs)
- Service management (start/stop/restart)
- Configuration viewing/editing with backups
- Log analysis and debugging
- System monitoring and alerts
- Remote update capability

### 3. Proxmox Agent (Special Capabilities)
- Full Proxmox API integration
- VM/Container lifecycle management
- Migration between nodes
- Resource monitoring
- **Self-deployment to other Proxmox nodes**

### 4. Current Self-Deployment
The Proxmox agent can deploy itself to other Proxmox nodes:
```
"Install the agent on all nodes"
→ SSH copies agent to pve2, pve3
→ Remote installation via systemd
→ Automatic hub registration
```

## Next Goal: Deploy Agents INTO VMs/Containers

We want to extend the Proxmox agent to deploy Linux agents INSIDE VMs and containers:

```
"Install agent on container 118 on pve1"
"Deploy agent to all web server VMs"
"Install monitoring on containers tagged 'production'"
```

### Technical Approach Needed:
1. **For LXC Containers**: Use `pct exec` to run commands inside
2. **For VMs**: Use QEMU guest agent or SSH
3. **Auto-detect OS** and adapt installation
4. **Secure communication** back to hub
5. **Network routing** considerations (containers may use private IPs)

### Example Commands to Implement:
```
"Install agent in web-server container"
"Deploy agent to all Ubuntu containers"
"Check which VMs have agents installed"
"Update all agents in containers to latest version"
```

### Key Challenges to Solve:
- Network connectivity from containers/VMs to hub
- Automatic OS detection and package management
- Credential management for container access
- Hub discovery from inside containers
- Handling different network configurations

## Current Authentication Model
- Hub ↔ Agent: JWT tokens + HTTP polling
- Proxmox API: username/password auth
- SSH between nodes: key-based (assumes Proxmox cluster SSH keys)

## File Locations
- Main project: `/Users/jeffk/Developement/provider-search/backend-ai/`
- Ready to be its own Git repository
- Already added to parent project's .gitignore

## To Continue Development:
The Proxmox agent already has self-deployment code in:
- `agent-proxmox/src/SelfDeployment.ts` - Deploys to other Proxmox nodes
- `agent-proxmox/src/ProxmoxAPIWrapper.ts` - Has Proxmox API methods

Next step is to extend this to deploy the Linux agent INTO containers/VMs using Proxmox's execution capabilities.