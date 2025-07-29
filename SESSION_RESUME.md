# Session Resume - Backend AI Project Status

## Current Network Issue
- Lost ability to SSH/SCP to remote machines (192.168.1.x network)
- Getting generic "Error" responses without details
- User had VPN on earlier which blocked local network access
- VPN was turned off but connections still failing
- Need to restart VSCode and Claude session to restore network access

## What We Completed Before Network Issues

### 1. Icon Design System
- Created letter-based favicon system (replaced emoji icons)
- **Hub Icon**: Blue square with white "H" - located at `hub/assets/favicon.svg`
- **Agent Icon**: Green square with white "A" - located at `agent/assets/favicon.svg`
- Both HTML files updated to reference new icons:
  - `hub/gui/index.html` - references `../assets/favicon.svg`
  - `agent/gui/index.html` - references `../assets/favicon.svg`

### 2. Version Management System
- Agents now report version from package.json (currently 2.0.3)
- Created `build-with-version.sh` that auto-increments version
- Hub tracks expected agent versions via `VERSION_CONFIG.json`
- New endpoints:
  - `/api/status` on agents includes `version` and `workingDirectory`
  - `/api/version-check` on hub shows which agents need updates
  - Hub `/api/agents` enhanced with version comparison

### 3. Documentation Created
- `API_STATUS_DOCUMENTATION.md` - Complete guide for /api/status endpoint
- `VERSION_MANAGEMENT_GUIDE.md` - How to use version system
- `UNRAID_DEPLOYMENT_GUIDE.md` - Unraid native deployment
- `UNRAID_AGENT_UPDATE_GUIDE.md` - Detailed Unraid update process

## Next Steps When Network Restored

### 1. Deploy New Icons
```bash
cd /Users/jeffk/Developement/provider-search/backend-ai
./deploy-new-icons.sh
```

### 2. Test Connectivity
```bash
# Test all agents are reachable
./test-version-system.sh
```

### 3. Verify Icon Updates
- Hub: http://192.168.1.30/ should show blue "H" in tab
- Agent: http://192.168.1.2:3080/ should show green "A" in tab

## System Architecture Reminder
- **Hub**: 192.168.1.30 (port 80)
- **Agents**:
  - nginx: 192.168.1.2:3080
  - pve1: 192.168.1.5:3080
  - pve2: 192.168.1.6:3080
  - pve3: 192.168.1.7:3080
  - unraid: 192.168.1.10:3080
- **Auth Token**: "your-secure-token" (used in Bearer auth)

## Key File Locations
- Agent config: `/backend-ai/hub/agents-config.json`
- Version config: `/backend-ai/VERSION_CONFIG.json`
- Deployment scripts in `/backend-ai/`:
  - `deploy-new-icons.sh` - Deploy letter icons
  - `deploy-agents-with-version.sh` - Deploy with version tracking
  - `test-version-system.sh` - Test all endpoints

## Current Agent Locations
- Proxmox agents: `/opt/ai-agent/agent/`
- Unraid agent: `/mnt/user/home/root/ai-agent/`

## Important Notes
- All agents running version 2.0.3
- GUI authentication fixed - allows same-origin requests without auth
- Self-update mechanism implemented but needs testing
- Page titles update dynamically based on machine name

Good luck with the restart! The project is in a good state - just need network connectivity restored.