# Unraid Agent Deployment Guide

## Overview
Unraid has unique requirements compared to other Linux systems:
- Non-persistent root filesystem (RAM-based)
- Docker is the preferred way to run persistent services
- Configuration changes need to be on persistent storage (/boot or /mnt/user)

## Current Status Check

### 1. Check what's currently running

```bash
# Check if agent is responding
curl -s http://192.168.1.10:3080/api/status

# Check Docker containers
ssh root@192.168.1.10 "docker ps | grep ai-agent"

# Check container logs
ssh root@192.168.1.10 "docker logs ai-agent --tail 20"
```

**Finding**: The current container is running old WebSocket-based agent code, trying to connect to port 3002.

## The Challenge

The Unraid agent needs to be deployed as a Docker container because:
1. Unraid's root filesystem is non-persistent (RAM-based)
2. Any files outside of /boot or /mnt/user are lost on reboot
3. Docker containers persist across reboots

## Deployment Process

### Step 1: Build the Agent Locally
```bash
cd agent && npm run build && cd ..
```

### Step 2: Create Deployment Package
```bash
tar -czf agent-v2-docker.tar.gz -C agent dist package.json
scp agent-v2-docker.tar.gz root@192.168.1.10:/tmp/
```

### Step 3: Build Docker Image on Unraid
The Docker image must be built on Unraid itself because:
- Docker commands aren't available on macOS
- The image needs to be in Unraid's Docker registry

### Step 4: Key Learnings

1. **Minimal Dependencies**: We only copy the `dist` folder and a minimal `package.json` to keep the image small
2. **Production Only**: Use `npm install --production` to avoid dev dependencies
3. **Alpine Linux**: Use `node:18-alpine` for a smaller base image
4. **Environment Variables**: Pass configuration via Docker environment variables
5. **Auto-restart**: Use `--restart unless-stopped` to ensure the container restarts after Unraid array starts

### Step 5: Verification
```bash
# Check from Unraid
curl -s http://localhost:3080/api/status | jq -r '.version'

# Check from hub
curl -s http://192.168.1.30/api/agents | jq -r '.agents[] | select(.name=="unraid")'
```

## Final Docker Configuration

The agent runs with:
- Port: 3080 (mapped from container to host)
- Agent ID: unraid-agent
- Hub URL: http://192.168.1.30
- Auto-restart: unless-stopped

## Success Indicators

✅ Container shows in `docker ps`
✅ Logs show "Enhanced HTTP Agent unraid-agent listening on port 3080"
✅ Version endpoint returns "2.0.0"
✅ Hub shows unraid as online with v2.0.0

## Native Unraid Deployment (Recommended)

After learning the limitations of Docker deployment, we found a better approach using native installation on the Unraid array.

### Why Native is Better

1. **Full Host Access**: Can manage Docker containers, array, shares, and all system resources
2. **No Container Overhead**: Direct execution on the host
3. **Easier Updates**: Just replace files, no container rebuilds
4. **Persistent Storage**: Uses `/mnt/user/home/root` for agent files

### Native Installation Steps

1. **Extract Node.js from Docker** (since Unraid doesn't include it):
```bash
docker run --rm -v /root/nodejs-extract:/out node:18-alpine sh -c '
  cp /usr/local/bin/node /out/
  mkdir -p /out/lib
  cp /lib/ld-musl-x86_64.so.1 /out/lib/
  cp /usr/lib/libstdc++.so.6 /out/lib/
  cp /usr/lib/libgcc_s.so.1 /out/lib/
'
```

2. **Install to Persistent Location**:
```bash
mkdir -p /mnt/user/home/root/ai-agent
mv /root/nodejs-extract /mnt/user/home/root/ai-agent/nodejs
```

3. **Deploy Agent Files**:
- Copy dist/, node_modules/, and package.json to `/mnt/user/home/root/ai-agent/`
- Create start script with proper environment variables

4. **Add to Boot Script** (`/boot/config/go`):
```bash
# Start AI Agent (native)
if [ -x /mnt/user/home/root/ai-agent/start-agent.sh ]; then
    /mnt/user/home/root/ai-agent/start-agent.sh &
fi
```

### Native Agent Capabilities

The native agent can:
- ✅ Execute any command on the Unraid host
- ✅ Manage Docker containers (`docker ps`, `docker exec`, etc.)
- ✅ Create/manage shares (`mkdir /mnt/user/sharename`)
- ✅ Monitor array status (`cat /proc/mdstat`)
- ✅ Access all host processes and resources
- ✅ Persist across reboots (via `/boot/config/go`)

### File Locations

- **Agent Files**: `/mnt/user/home/root/ai-agent/`
- **Logs**: `/mnt/user/home/root/ai-agent/agent.log`
- **Node.js**: `/mnt/user/home/root/ai-agent/nodejs/`
- **Boot Script**: `/boot/config/go`