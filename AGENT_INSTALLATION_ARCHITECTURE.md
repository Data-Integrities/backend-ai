# AI Agent Installation Architecture

## Overview

This document explains the Backend AI agent installation strategy, which uses **different deployment methods based on the target operating system**. This is necessary because different systems have different constraints, package managers, and best practices.

## Why Different Installation Methods?

### The Core Problem
We need to deploy the same Node.js-based AI agent across diverse systems:
- **Hypervisors** (Proxmox) - Must stay minimal, no containers
- **Linux Servers** (Debian/Ubuntu/RHEL) - Standard package managers work well
- **Unraid NAS** - Slackware-based, non-persistent root filesystem
- **Future: Windows** - Would need WSL or Docker

### The Solution
We use **two distinct deployment strategies**:

1. **Native Installation** - For standard Linux systems and hypervisors
2. **Docker Installation** - For Unraid (and future Windows support)

## Deployment Method by System Type

```
┌─────────────────────┐
│   Target System?    │
└──────────┬──────────┘
           │
    ┌──────┴──────┐
    │  Unraid?    │
    └──┬───────┬──┘
       │ Yes   │ No
       ▼       ▼
┌──────────┐ ┌─────────────┐
│  Docker  │ │   Native    │
│  Deploy  │ │   Deploy    │
└──────────┘ └─────────────┘
```

## Method 1: Native Installation

### When to Use
- ✅ All standard Linux distributions
- ✅ Proxmox hosts (CRITICAL: Never install Docker on Proxmox!)
- ✅ LXC containers
- ✅ VMs running Linux
- ✅ Physical Linux servers

### How It Works
```bash
./deploy-agent-v2.sh <hostname> <user>
```

1. **Detects OS** and package manager:
   - Debian/Ubuntu → `apt`
   - RHEL/CentOS → `dnf/yum`
   - Alpine → `apk`
   - Arch → `pacman`

2. **Installs Node.js** via native package manager

3. **Deploys agent** to `/opt/ai-agent/`

4. **Process Management** via PM2:
   - Auto-restart on crash
   - Log rotation
   - System startup integration

5. **Service Management** via systemd:
   - `systemctl start/stop/status ai-agent`
   - Survives reboots

### File Locations (Native)
```
/opt/ai-agent/
├── web-agent/
│   ├── dist/          # Compiled JavaScript
│   ├── node_modules/  # Dependencies
│   ├── logs/          # Agent logs
│   └── .env           # Configuration
└── ecosystem.config.js # PM2 configuration
```

## Method 2: Docker Installation (Unraid)

### When to Use
- ✅ Unraid servers
- ✅ Future: Windows with Docker Desktop
- ❌ NEVER on Proxmox hosts

### Why Docker for Unraid?
1. **Unraid's root filesystem is RAM-based** (non-persistent)
2. **Slackware package management** is limited
3. **Docker is Unraid's preferred** deployment method
4. **Easy updates** via Unraid's Docker UI

### How It Works
```bash
./deploy-agent-unraid-docker.sh unraid
```

1. **Builds Docker image** with agent + tools

2. **Deploys container** with strategic volume mounts:
   ```yaml
   volumes:
     - /var/run/docker.sock:/var/run/docker.sock  # For host commands
     - /mnt/user:/mnt/user                        # User shares
     - /boot:/boot                                # Persistent config
     - /mnt/disk*:/mnt/disk*                      # Direct disk access
   ```

3. **Executes host commands** via Docker-in-Docker:
   ```bash
   # Inside container, to run host command:
   docker run --rm -v /:/host alpine sh -c "chroot /host <command>"
   ```

4. **Persists across reboots** via `/boot/config/go` integration

### File Locations (Docker)
```
Host:
/boot/config/plugins/ai-agent/
├── config/           # Persistent configuration
├── auto-start.sh     # Startup script
└── [logs symlink]    # Points to Docker logs

Container:
/app/                 # Agent application
/mnt/user/           # Mounted user shares
/var/run/docker.sock # Docker socket for host access
```

## Security Considerations

### Native Installation
- Runs as configured user (root or jeffk)
- Direct host access
- Protected by system permissions

### Docker Installation
- Container runs as root internally
- Maps to 'nobody' user externally (Unraid default)
- Host access via Docker socket (controlled)
- Volume mounts can be read-only where appropriate

## Command Execution Patterns

### Native Agent
```javascript
// Direct command execution
const result = await exec('ls /mnt/user');
```

### Docker Agent
```javascript
// Via Docker sibling container
const result = await exec(
  'docker run --rm -v /:/host alpine sh -c "ls /host/mnt/user"'
);
```

## Network Architecture

Both deployment methods result in the same network behavior:
- Agent listens on port **3080**
- Hub polls agents every 30 seconds
- Agents never initiate connections

```
Hub (192.168.1.30:80)
    │
    ├─[HTTP Poll]→ nginx-agent (192.168.1.2:3080)
    ├─[HTTP Poll]→ pve1-agent (192.168.1.5:3080)
    ├─[HTTP Poll]→ pve2-agent (192.168.1.6:3080)
    ├─[HTTP Poll]→ pve3-agent (192.168.1.7:3080)
    └─[HTTP Poll]→ unraid-agent (192.168.1.10:3080) [Docker]
```

## Deployment Scripts Reference

### deploy-agent-v2.sh
- **Purpose**: Native installation for Linux systems
- **Key Features**:
  - OS detection
  - Package manager selection
  - PM2 setup
  - systemd integration

### deploy-agent-unraid-docker.sh
- **Purpose**: Docker installation for Unraid
- **Key Features**:
  - Docker image building
  - Volume mount configuration
  - Unraid go file integration
  - WebUI configuration

### deploy-agent-universal.sh (Future)
- **Purpose**: Unified script with OS detection
- **Status**: Concept only - may be too complex

## Troubleshooting

### Native Installation Issues
```bash
# Check if agent is running
pm2 status

# View logs
pm2 logs ai-agent

# Restart agent
pm2 restart ai-agent

# Check systemd status
systemctl status pm2-<user>
```

### Docker Installation Issues
```bash
# Check container status
docker ps -a | grep ai-agent

# View logs
docker logs ai-agent

# Restart container
docker restart ai-agent

# Enter container for debugging
docker exec -it ai-agent sh
```

## Adding New Systems

### For Standard Linux
1. Ensure system in aliases.zsh
2. Run: `./deploy-agent-v2.sh <hostname> <user>`
3. Verify with: `curl http://<ip>:3080/api/status`

### For Special Systems (like Unraid)
1. Evaluate if Docker is appropriate
2. Create custom deployment script if needed
3. Document any special considerations

## Summary

- **Standard Linux/Proxmox** → Native installation via package manager
- **Unraid** → Docker installation with host access
- **Same agent code** → Different deployment methods
- **Hub doesn't care** → Sees all agents the same way via HTTP on port 3080

This architecture provides flexibility while maintaining consistency in how agents operate once deployed.