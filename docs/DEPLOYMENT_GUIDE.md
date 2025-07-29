# AI Agent Deployment Guide

## Known Issues

### deploy-everything.sh False Failure Reporting (Fixed in latest version)
- **Issue**: Script may incorrectly report deployments as failed when they actually succeeded
- **Cause**: Exit code files not being created properly in background processes
- **Impact**: Misleading deployment status reports
- **Fix**: Updated to pre-create exit code files with failure status, then update on success
- **Workaround**: Always verify actual deployment status with:
  ```bash
  curl http://192.168.1.30/api/agents | jq '.agents[] | {name, version, isOnline}'
  ```

## Deployment Methods by OS

### 1. **Standard Linux Systems** (Debian, Ubuntu, RHEL, etc.)
Use: `deploy-agent-v2.sh`
- Native Node.js installation via package manager
- PM2 for process management
- systemd for auto-start

**Includes:**
- ✅ Proxmox hosts (pve1, pve2, pve3)
- ✅ nginx, www, app servers
- ✅ mongo, ldap, other services
- ✅ LXC containers
- ✅ Standard VMs

### 2. **Unraid**
Use: `deploy-agent-unraid-docker.sh`
- Docker container deployment
- Persistent storage in /boot/config
- Full host access via Docker socket
- Auto-start via Unraid's go file

**Why Docker for Unraid:**
- Unraid's root filesystem is non-persistent
- Limited package availability (Slackware-based)
- Docker is Unraid's preferred deployment method
- Easy updates via Docker tab

### 3. **Windows** (Future)
Use: Docker Desktop or WSL2
- Similar to Unraid approach
- Docker provides Linux environment
- Avoids Windows-specific complexities

### 4. **macOS** (Development only)
Use: Native installation via Homebrew
- Not recommended for production agents
- Mainly for testing/development

## Quick Decision Tree

```
Is it Unraid or Windows?
├─ YES → Use Docker deployment
└─ NO → Is it a Proxmox host?
    ├─ YES → Use native deployment (deploy-agent-v2.sh)
    └─ NO → Is it any other Linux?
        ├─ YES → Use native deployment (deploy-agent-v2.sh)
        └─ NO → Special handling required
```

## Important Notes

### Proxmox Hosts
- **NEVER install Docker on Proxmox hosts**
- Proxmox documentation strongly discourages this
- Use native Node.js installation only
- Keep the hypervisor layer clean

### Container Access in Docker
For Unraid Docker deployment, the agent has:
- `/var/run/docker.sock` - Create sibling containers for commands
- `/mnt/user` - Access to all user shares
- `/boot` - Access to Unraid config
- Network access to host services

### Security Considerations
- Docker deployment on Unraid requires careful volume mounting
- Consider read-only mounts where possible
- Use Docker socket for command execution (not SSH keys)
- Agent runs as root inside container (maps to nobody outside)

## Deployment Commands

### For Linux/Proxmox:
```bash
./deploy-agent-v2.sh <hostname> <user>
```

### For Unraid:
```bash
./deploy-agent-unraid-docker.sh unraid
```

### Check Status:
```bash
# Native deployment
ssh user@host 'pm2 status'

# Docker deployment
ssh root@unraid 'docker ps | grep ai-agent'
```