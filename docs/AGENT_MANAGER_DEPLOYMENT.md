# Agent and Manager Deployment Guide

## Overview

This guide explains how to deploy Backend AI agents and managers to worker machines. The deployment process uses a **compile locally, install on worker** approach to minimize transfer sizes while ensuring all dependencies are properly installed.

## Key Concepts

- **Worker**: The target machine where an agent/manager will run
- **Agent**: The Backend AI agent process that runs on port 3080
- **Manager**: The agent manager that controls the agent lifecycle (start/stop/restart)
- **Hub**: The central control system at 192.168.1.30

## Deployment Architecture

```
Local Development Machine          Worker Machine
┌─────────────────────┐           ┌─────────────────────┐
│ TypeScript Source   │           │ Deployed Files      │
│ ├── src/           │           │ ├── dist/          │
│ └── package.json   │  Deploy   │ ├── package.json   │
│                    │ ────────> │ └── node_modules/  │
│ npm run build      │           │                    │
│ (creates dist/)    │           │ npm install        │
└─────────────────────┘           └─────────────────────┘
```

## What Gets Deployed

### Files Sent to Worker (~29KB total)
- `dist/` - Compiled JavaScript files
- `package.json` - Dependency manifest

### What Does NOT Get Sent
- `node_modules/` - Dependencies (installed on worker)
- `src/` - Source TypeScript files
- Development files (tsconfig.json, etc.)

## Deployment Process

### 1. Build Locally
```bash
cd agent
npm run build        # Compiles TypeScript to JavaScript in dist/
```

### 2. Package Files
```bash
tar -czf agent-update.tar.gz -C agent dist package.json
```

### 3. Deploy to Worker
```bash
scp agent-update.tar.gz root@worker-ip:/tmp/
ssh root@worker-ip << 'EOF'
  cd /opt/ai-agent/agent
  tar -xzf /tmp/agent-update.tar.gz
  npm install --production  # CRITICAL: Install dependencies
  systemctl restart ai-agent
EOF
```

## Critical Step: npm install

**⚠️ IMPORTANT**: After deploying files, you MUST run `npm install` on the worker machine. This installs the required Node.js dependencies based on package.json.

Without this step, the agent/manager will fail with errors like:
```
Error: Cannot find module 'express'
Error: Cannot find module 'dotenv'
```

## Deployment Scripts

The provided deployment scripts handle this automatically:

### update-versions.sh
```bash
./update-versions.sh 2.0.20
# Builds, packages, and deploys to all workers
# Automatically runs npm install on each worker
```

### deploy-agent-v2.sh
```bash
./deploy-agent-v2.sh nginx root
# Deploys agent to specific worker
# Handles npm install automatically
```

## Manual Deployment Steps

If deploying manually, ensure you:

1. **Stop services first**
   ```bash
   systemctl stop ai-agent ai-agent-manager
   ```

2. **Extract files**
   ```bash
   cd /opt/ai-agent
   tar -xzf /tmp/update.tar.gz
   ```

3. **Install dependencies** ⚠️ DON'T SKIP THIS
   ```bash
   cd /opt/ai-agent/agent && npm install --production
   cd /opt/ai-agent/manager && npm install --production
   ```

4. **Start services**
   ```bash
   systemctl start ai-agent-manager
   systemctl start ai-agent
   ```

## Troubleshooting

### Agent Won't Start
Check logs: `journalctl -u ai-agent -n 50`

Common issues:
- Missing `npm install` step
- Wrong Node.js version (requires v18+)
- Port 3080 already in use

### Module Not Found Errors
This means dependencies weren't installed:
```bash
cd /opt/ai-agent/agent
npm install --production
```

### Verification
After deployment, verify the agent is running:
```bash
curl -s http://localhost:3080/api/status
```

## File Structure on Worker

After successful deployment:
```
/opt/ai-agent/
├── agent/
│   ├── dist/           # Compiled JavaScript
│   ├── package.json    # Dependencies list
│   └── node_modules/   # Installed dependencies
└── manager/
    ├── dist/           # Compiled JavaScript
    ├── package.json    # Dependencies list
    └── node_modules/   # Installed dependencies
```

## Best Practices

1. **Always use deployment scripts** - They handle npm install automatically
2. **Test locally first** - Run `npm run build` to catch compilation errors
3. **Check logs after deployment** - Verify services started correctly
4. **Keep versions consistent** - Use VERSION_CONFIG.json to track versions

## Summary

Remember: **Deployment = Copy files + npm install**

The deployment process is designed to be efficient (small transfer size) while ensuring reliability (proper dependency installation). The key is that dependencies are installed on the worker, not transferred from your development machine.