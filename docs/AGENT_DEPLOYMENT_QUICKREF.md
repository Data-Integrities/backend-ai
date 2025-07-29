# Agent Deployment Quick Reference

## 🚀 Quick Start - Which Script to Use?

| System Type | Deployment Script | Why? |
|------------|------------------|------|
| **Proxmox Hosts** (pve1/2/3) | `./deploy-agent-v2.sh <host> root` | NEVER Docker on hypervisors |
| **Linux Servers** (nginx, www, mongo) | `./deploy-agent-v2.sh <host> <user>` | Native is simpler |
| **Unraid NAS** | `./deploy-agent-unraid-docker.sh unraid` | Non-persistent filesystem |
| **Windows** (future) | Docker-based (TBD) | No native Node.js |

## 📋 Pre-Deployment Checklist

1. **Is the host in `~/.zsh/aliases.zsh`?**
   ```bash
   grep "alias nginx=" ~/.zsh/aliases.zsh
   ```

2. **Is the hub running?**
   ```bash
   curl -s http://192.168.1.30/health | jq '.'
   ```

3. **For Proxmox hosts - is network routing correct?**
   ```bash
   ssh root@192.168.1.5 'ip route show default'
   # Should show: default via 192.168.1.1 dev vmbr1
   ```

## 🔧 Deployment Commands

### Standard Linux/Proxmox
```bash
# Deploy to nginx (root access)
./deploy-agent-v2.sh nginx root

# Deploy to mongo (user access)
./deploy-agent-v2.sh mongo jeffk

# Deploy to all Proxmox hosts
for host in pve1 pve2 pve3; do
    ./deploy-agent-v2.sh $host root
done
```

### Unraid
```bash
# Deploy via Docker
./deploy-agent-unraid-docker.sh unraid
```

## ✅ Post-Deployment Verification

### 1. Check Agent is Running
```bash
# Native deployment
ssh <user>@<host> 'pm2 status'

# Docker deployment
ssh root@unraid 'docker ps | grep ai-agent'
```

### 2. Test Agent API
```bash
curl -s http://<host-ip>:3080/api/status | jq '.'
```

### 3. Check Hub Sees Agent
```bash
curl -s http://192.168.1.30/api/agents | jq '.agents[] | select(.name == "<agent-name>")'
```

## 🔍 Troubleshooting

### Agent Not Responding
```bash
# Native: Check PM2
ssh <user>@<host> 'pm2 logs ai-agent --lines 50'

# Docker: Check container logs
ssh root@unraid 'docker logs ai-agent --tail 50'
```

### Hub Not Detecting Agent
1. Wait 60 seconds (polling interval)
2. Check agent is on port 3080
3. Verify no firewall blocking
4. Check hub's agents-config.json has correct IP

### Proxmox Network Issues
```bash
# Fix routing (on each Proxmox host)
ip route del default
ip route add default via 192.168.1.1 dev vmbr1
```

## 📁 Important File Locations

### Native Deployment
- Agent: `/opt/ai-agent/web-agent/`
- Logs: `/opt/ai-agent/web-agent/logs/`
- PM2: `~/.pm2/logs/`

### Docker Deployment (Unraid)
- Config: `/boot/config/plugins/ai-agent/`
- Logs: `docker logs ai-agent`
- Container: `docker inspect ai-agent`

## ⚠️ Critical Rules

1. **NEVER install Docker on Proxmox hosts**
2. **ALWAYS use port 3080 for agents**
3. **Hub runs on port 80, agents on 3080**
4. **Unraid deployments MUST use /boot for persistence**

## 🔄 Update Process

### Native Agent
```bash
ssh <user>@<host>
cd /opt/ai-agent/web-agent
git pull  # (if using git)
npm install
npm run build
pm2 restart ai-agent
```

### Docker Agent
```bash
# Build new image
./deploy-agent-unraid-docker.sh unraid
# (Script handles stop/start automatically)
```

## 📊 Current Deployment Status

| Host | Type | Method | Status |
|------|------|--------|--------|
| nginx (192.168.1.2) | Linux | Native | ✅ Deployed |
| pve1 (192.168.1.5) | Proxmox | Native | ✅ Deployed |
| pve2 (192.168.1.6) | Proxmox | Native | ✅ Deployed |
| pve3 (192.168.1.7) | Proxmox | Native | ✅ Deployed |
| unraid (192.168.1.10) | Unraid | Docker | ⏳ Pending |