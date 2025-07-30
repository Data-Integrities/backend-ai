# Backend AI Project Guidelines for Claude

## AUTOMATIC PROJECT DOCUMENTATION READING

When starting work in this project, IMMEDIATELY read all project documentation by:
1. Finding all .md files in this project (excluding node_modules)
2. Reading each one to understand the project structure, rules, and decisions
3. Stop at any subdirectory containing a .git folder (that's a separate project)

To do this, run:
```bash
find /Users/jeffk/Developement/provider-search/backend-ai -name "*.md" -not -path "*/node_modules/*" -type f | head -20
```
Then read each relevant documentation file found.

This ensures you have full context of:
- Architecture decisions (like NO WEBSOCKETS)
- Deployment rules (use deploy-everything.sh)
- Component relationships
- Historical decisions and their reasons

## GOLDEN RULE: Debug with SSH, Fix locally, Deploy with deploy-everything.sh

### Workflow for Backend AI Project:
1. **SSH to debug** - Use SSH to investigate issues, check logs, examine files
2. **Fix code locally** - Make ALL changes in the local repository
3. **Deploy with script** - Use `./deploy-everything.sh` to ensure proper deployment

### Critical Rules:
- **NEVER manually edit files on remote systems** - They will be overwritten on next deployment
- **NEVER deploy individual files manually** - This causes ownership/permission issues
- **ALWAYS use deploy-everything.sh** for any code changes

### Why This Matters:
- **File ownership**: Manual copies can create wrong ownership (e.g., jeffk:games instead of root:root)
- **Service managers**: Different systems use different managers (systemd vs rc.d)
- **Version consistency**: The script ensures all systems have matching versions
- **Configuration sync**: backend-ai-config.json is properly distributed

### Proper Workflow Examples:

**✅ CORRECT - Debugging an issue:**
```bash
# 1. SSH to investigate
ssh root@192.168.1.10
ps aux | grep ai-agent
cat /opt/ai-agent/manager/logs/manager.log

# 2. Fix the issue locally
cd /Users/jeffk/Developement/provider-search/backend-ai
vim agent/manager/index-unraid.ts

# 3. Deploy the fix
./deploy-everything.sh
```

**❌ WRONG - Manual file editing:**
```bash
# DON'T DO THIS!
ssh root@192.168.1.10
vim /opt/ai-agent/manager/dist/index-unraid.js  # Changes will be lost!
```

### SSH Access for Debugging:
Use SSH for read-only operations:
- Checking service status: `systemctl status ai-agent` or `/etc/rc.d/rc.ai-agent status`
- Viewing logs: `journalctl -u ai-agent` or `tail -f /opt/ai-agent/logs/agent.log`
- Testing commands: `curl http://localhost:3080/api/status`
- Process inspection: `ps aux | grep ai-agent`

### Common Systems:
- **Hub**: `ssh root@192.168.1.30` (Proxmox container, systemd)
- **nginx**: `ssh root@192.168.1.2` (Ubuntu, systemd)
- **pve1/2/3**: `ssh root@192.168.1.5/6/7` (Proxmox hosts, systemd)
- **unraid**: `ssh root@192.168.1.10` (Unraid, rc.d scripts)

### Deploy Everything Script:
The `deploy-everything.sh` script handles:
- Building all components (shared, hub, agent, manager)
- Creating deployment packages with correct structure
- Stopping services before deployment
- Extracting files with proper ownership
- Starting services in correct order
- Verifying deployment success
- Parallel deployment to all workers

Remember: The deploy-everything script is the ONLY way to deploy code changes to the backend-ai infrastructure.

## Manager Start/Stop Workflow

### State Change Rules for Managers:
- To start and stop agents, go to the managers
- If the manager isn't running, an error is currently generated
- Manager startup process:
  * Hub -> hub webAPI 
  * SSH into worker 
  * Use rc.d or systemd to start the manager
  * Manager sends a callback when ready to listen
- Manager stop process:
  * Use SSH command from hub webAPI to stop the manager
  * Because the manager is stopping, it cannot report its own status
  * Use rc.d/systemd to stop the manager
  * Start a background script to hit the /status endpoint
  * Send callback only when /status no longer responds
- Current implementation may need verification of exact steps