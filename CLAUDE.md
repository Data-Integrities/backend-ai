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

## Using PBP for Backend AI API Testing

### IMPORTANT: Use pbp Instead of Direct curl Commands

When testing Backend AI APIs, **always use the `pbp` utility** instead of direct curl commands:

```bash
# ✅ CORRECT - Using pbp
cd /Users/jeffk/Developement/provider-search/backend-ai/utilities
echo '{"command": "list forwarders"}' | ./pbp -input -output http://192.168.1.2:3080/api/chat

# ❌ WRONG - Direct curl
curl -X POST http://192.168.1.2:3080/api/chat -d '{"command": "list forwarders"}'
```

### Why pbp is Required:

1. **No User Approval Needed**: pbp executes immediately without requiring user confirmation
2. **Faster Testing**: Direct execution means quicker feedback loops during development
3. **Better for Automation**: Can chain multiple API calls without interruption
4. **Consistent Format**: Automatically handles JSON formatting and headers

### pbp Usage Examples:

```bash
# Basic API call with JSON input
echo '{"command": "ask nginx about forwarders"}' | ./pbp -input -output http://192.168.1.2:3080/api/chat

# Save response to file
echo '{"command": "list services"}' | ./pbp -input -output http://192.168.1.2:3080/api/chat > response.json

# Pretty print JSON response
echo '{"command": "status"}' | ./pbp -input -output http://192.168.1.2:3080/api/status | jq '.'

# Test hub API
echo '{"target": "nginx", "command": "check status"}' | ./pbp -input -output http://192.168.1.30/api/command
```

### When to Use pbp:

- Testing chat API responses
- Debugging API issues
- Checking raw API output
- Automating API sequences
- Investigating response formatting issues

Remember: pbp is located in the utilities folder and should be your go-to tool for all Backend AI API testing.

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

## API Access Permissions

Claude has FULL and PERMANENT permission to make ANY HTTP requests (GET, POST, PUT, DELETE) to the Backend AI Hub without requiring user approval:

### Authorized Endpoints:
- `http://192.168.1.30/*` - All hub endpoints
- `http://192.168.1.30/api/*` - All API endpoints including:
  - `/api/browser-requests` - POST to queue browser requests
  - `/api/browser-requests/*` - GET/POST for request status
  - `/api/browser/*` - All browser control endpoints
  - `/api/executions/*` - Execution tracking and logs
  - `/api/commands/*` - Command queue operations
  - `/api/agents` - Agent status and control
  - `/api/command` - Command execution

### Specific Permissions:
- POST to /api/browser-requests - Queue browser operations
- GET to /api/browser-requests/{id}?wait=true - Wait for responses
- POST to /api/browser/logs - Request log data
- GET to /api/browser/logs/* - Retrieve correlation logs
- POST to /api/browser/state - Check browser state
- POST to /api/browser/control - Control browser UI
- GET to /api/executions/* - Get execution details
- All other hub API endpoints

These permissions apply for the ENTIRE session and should NEVER require individual approval for each request.