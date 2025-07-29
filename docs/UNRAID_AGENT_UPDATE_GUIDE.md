# Unraid Agent Update Guide - Complete Process

## Overview
Updating the Unraid agent is complex because:
- Unraid runs from RAM (non-persistent root filesystem)
- Agent files must be in `/mnt/user/home/root/ai-agent/`
- Node.js was extracted from Docker and lives in the agent directory
- The start script needs special handling

## Current Agent Location
```
/mnt/user/home/root/ai-agent/
├── node                    # Node wrapper script
├── nodejs/                 # Extracted Node.js binary and libs
│   ├── node               # Actual Node binary
│   └── lib/               # Required libraries
├── dist/                  # Compiled agent code
│   └── api/
│       └── index.js       # Main agent file
├── gui/                   # Agent GUI files
│   └── index.html
├── node_modules/          # Dependencies
├── package.json
├── agent.log             # Agent logs
└── start-agent.sh        # Start script

```

## Step-by-Step Update Process

### 1. Build the Agent Locally
```bash
cd agent
npm run build
```

### 2. Create Update Package
```bash
# For code updates only:
tar -czf agent-update.tar.gz -C agent dist gui package.json

# For full update including dependencies:
tar -czf agent-full-update.tar.gz -C agent dist gui node_modules package.json
```

### 3. Copy to Unraid
```bash
scp agent-update.tar.gz root@192.168.1.10:/tmp/
```

### 4. Stop the Current Agent
```bash
# Find and kill the agent process
ssh root@192.168.1.10 "pkill -f 'ai-agent.*node.*index.js'"

# Verify it's stopped
ssh root@192.168.1.10 "ps aux | grep -E 'ai-agent.*node' | grep -v grep"
```

### 5. Extract Update Files
```bash
ssh root@192.168.1.10 "cd /mnt/user/home/root/ai-agent && tar -xzf /tmp/agent-update.tar.gz"
```

### 6. Fix the Start Script
The current start script runs in foreground. Here's the corrected version:

```bash
ssh root@192.168.1.10 << 'EOF'
cat > /mnt/user/home/root/ai-agent/start-agent.sh << 'SCRIPT'
#!/bin/bash
cd /mnt/user/home/root/ai-agent
export PORT=3080
export AGENT_ID=unraid-agent
export HUB_URL=http://192.168.1.30
export NODE_ENV=production

# Kill any existing agent
pkill -f "ai-agent.*node.*index.js" 2>/dev/null

echo "Starting AI Agent (native)..."
nohup ./node dist/api/index.js >> agent.log 2>&1 &
echo $! > agent.pid
echo "Agent started with PID $(cat agent.pid)"
SCRIPT
chmod +x /mnt/user/home/root/ai-agent/start-agent.sh
EOF
```

### 7. Start the Agent (Properly)
```bash
# Start in background
ssh root@192.168.1.10 "cd /mnt/user/home/root/ai-agent && ./start-agent.sh"

# Or directly without the script:
ssh root@192.168.1.10 "cd /mnt/user/home/root/ai-agent && nohup ./node dist/api/index.js >> agent.log 2>&1 & echo 'Started with PID' \$!"
```

### 8. Verify Agent is Running
```bash
# Check process
ssh root@192.168.1.10 "ps aux | grep -E 'node.*index.js' | grep -v grep"

# Check if port is listening
ssh root@192.168.1.10 "netstat -tlnp | grep 3080"

# Test API
curl -s http://192.168.1.10:3080/api/status | jq '.version'

# Test GUI
curl -I http://192.168.1.10:3080/
```

## Common Issues and Solutions

### Agent Won't Start
```bash
# Check the log
ssh root@192.168.1.10 "tail -50 /mnt/user/home/root/ai-agent/agent.log"

# Common issues:
# - Port already in use: kill all node processes
# - Missing dependencies: copy node_modules from working agent
```

### Agent Starts but Immediately Stops
```bash
# Usually permission or path issues
ssh root@192.168.1.10 "cd /mnt/user/home/root/ai-agent && ./node --version"
# Should output: v18.20.8
```

### GUI Not Loading
```bash
# Ensure gui directory exists and has index.html
ssh root@192.168.1.10 "ls -la /mnt/user/home/root/ai-agent/gui/"
```

## Quick Update Script
Save this as `update-unraid-agent.sh`:

```bash
#!/bin/bash
echo "Building agent..."
cd agent && npm run build && cd ..

echo "Creating update package..."
tar -czf agent-update.tar.gz -C agent dist gui package.json

echo "Copying to Unraid..."
scp agent-update.tar.gz root@192.168.1.10:/tmp/

echo "Updating agent on Unraid..."
ssh root@192.168.1.10 << 'REMOTE'
# Stop agent
pkill -f "ai-agent.*node.*index.js"
sleep 2

# Extract update
cd /mnt/user/home/root/ai-agent
tar -xzf /tmp/agent-update.tar.gz

# Start agent
nohup ./node dist/api/index.js >> agent.log 2>&1 &
echo "Agent started with PID $!"

# Test
sleep 3
curl -s http://localhost:3080/api/status | jq -r '.version'
REMOTE

echo "Update complete!"
```

## Testing After Update
Always verify:
1. API responds: `curl http://192.168.1.10:3080/api/status`
2. GUI loads: Open http://192.168.1.10:3080 in browser
3. Commands work: `curl -X POST http://192.168.1.10:3080/api/execute -H "Content-Type: application/json" -d '{"command":"uptime"}'`
4. Hub sees it: `curl http://192.168.1.30/api/agents | jq '.agents[] | select(.name=="unraid")'`