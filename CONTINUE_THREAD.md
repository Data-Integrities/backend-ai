# Backend AI - Continuation Thread

## Current Project Status
The Backend AI project is now a standalone GitHub repository at https://github.com/Data-Integrities/backend-ai. This is an AI-powered infrastructure control system that allows natural language management of servers, containers, VMs, and Proxmox clusters.

## What's Been Built
- **AI Command Hub**: Central brain using Claude AI for natural language processing
- **Linux Agent**: Runs on servers/containers for service management, monitoring, and debugging
- **Proxmox Agent**: Special agent with full Proxmox API integration and self-deployment to other nodes
- **Remote Update System**: Agents can be updated remotely with versioning and rollback
- **Security**: JWT auth, risk assessment, automatic backups, and sandboxed execution

## Current Capability: Node-to-Node Deployment
The Proxmox agent can already deploy itself to other Proxmox nodes:
```
"Install the agent on all Proxmox nodes"
→ SSH copies agent to pve2, pve3
→ Remote installation via systemd
→ Automatic hub registration
```

## Next Goal: Deploy Linux Agents INTO Containers/VMs
We need to extend the Proxmox agent to deploy Linux agents INSIDE containers and VMs, not just on Proxmox nodes themselves.

### Target Commands to Implement:
```
"Install agent in container 118 on pve1"
"Deploy agent to all web server VMs"
"Install monitoring on all production containers"
"Check which containers have agents installed"
```

### Technical Approach:
1. **For LXC Containers**: Use `pct exec` to run commands inside containers
2. **For QEMU VMs**: Use QEMU guest agent or SSH if available
3. **Auto-detect OS**: Adapt installation based on detected OS (Ubuntu, Debian, etc.)
4. **Network Routing**: Handle containers with private IPs (may need relay through Proxmox host)
5. **Hub Discovery**: Containers need to find hub (environment variable or config)

### Key Files to Extend:
- `agent-proxmox/src/ProxmoxAPIWrapper.ts` - Already has Proxmox API methods
- `agent-proxmox/src/SelfDeployment.ts` - Has node deployment, needs container deployment
- `agent-proxmox/src/ProxmoxCommandExecutor.ts` - Needs new deployment commands

### Example Implementation Flow:
```typescript
// When user says: "Install agent in container 118"
1. Proxmox agent receives command
2. Uses pct exec to run commands inside container 118
3. Downloads and installs Linux agent inside container
4. Configures agent with hub URL (possibly relayed through Proxmox host)
5. Agent starts and registers with hub
```

### Challenges to Solve:
- Network connectivity from containers to hub (private IPs)
- Credential management for container access
- Different package managers (apt, yum, etc.)
- Containers without internet access
- Proper error handling and rollback

## Repository Structure
```
backend-ai/
├── hub/                    # AI command hub
├── agent/                  # Linux agent for containers/VMs
├── agent-proxmox/          # Proxmox agent (needs extension)
├── agent-windows/          # (Planned)
├── agent-macos/            # (Planned)
└── shared/                 # TypeScript types
```

The project uses TypeScript throughout and is ready for development. All dependencies are defined in respective package.json files.