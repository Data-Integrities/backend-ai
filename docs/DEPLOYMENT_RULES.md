# Critical Deployment Rules for Backend AI

## Use deploy-everything.sh for Full System Deployments

**Rule #1**: Always use `deploy-everything.sh` for full system deployments to ensure a repeatable, rock-solid build and deployment process.

**Rule #2**: Use `deploy-version.sh` for quick updates when you only need to update via the hub's auto-update mechanism.

**Rule #3**: Use SSH for troubleshooting and management tasks. The Claude Code approval system requires individual approval for every API command, making it impractical for investigation and debugging.

## Deployment Workflow

### For FULL SYSTEM deployments (recommended):
1. Make changes locally
2. Run `./deploy-everything.sh X.X.X`
3. This ensures:
   - Complete rebuild of all components
   - Direct deployment to hub and all agents
   - Consistent state across entire system
   - No reliance on auto-update mechanisms
   - Verified deployment with status checks

### For QUICK updates (hub auto-update):
1. Make changes locally
2. Run `./deploy-version.sh X.X.X` (increments version)
3. This automatically:
   - Updates version in package.json files
   - Builds hub and agent
   - Uploads to NAS
   - Tells hub manager to update
   - Hub updates all agents

### What this ensures:
- Hub and agent versions ALWAYS match
- All deployments go through the API
- We're constantly validating the API capabilities
- Consistent deployment process

## SSH Permission Required

If SSH is needed, STOP and ask for permission. This indicates:
- Missing API functionality that needs to be added
- A gap in the system that needs addressing
- An opportunity to improve the hub/agent capabilities

## Examples of what NOT to do:
```bash
# ❌ WRONG - Direct SSH
ssh root@192.168.1.30 "systemctl restart ai-hub"

# ❌ WRONG - Direct file copy
scp hub/gui root@192.168.1.30:/opt/backend-ai/hub/

# ❌ WRONG - Manual agent updates
ssh root@192.168.1.2 "cd /opt/ai-agent && npm install"
```

## What to do instead:
```bash
# ✅ CORRECT - Use deployment script
./deploy-version.sh 2.0.11

# ✅ CORRECT - Use hub API for commands
curl -X POST http://192.168.1.30/api/command \
  -H "Content-Type: application/json" \
  -d '{"command": "restart hub"}'

# ✅ CORRECT - Use agent manager for lifecycle
curl -X POST http://192.168.1.2:3081/restart
```

## The Goal
Every operation should be possible through the APIs. If it's not, we need to add that capability rather than work around it with SSH.

Remember: **The APIs are the product**. Using SSH bypasses the product we're building.