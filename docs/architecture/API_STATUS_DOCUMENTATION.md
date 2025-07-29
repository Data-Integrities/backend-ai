# API Status Endpoint Documentation

## Overview
The `/api/status` endpoint provides comprehensive information about an agent's current state, system resources, and configuration. This endpoint is essential for monitoring agent health and managing deployments.

## Endpoint Details

**URL**: `GET /api/status`  
**Authentication**: Required (Bearer token)  
**Response**: JSON object with agent information

## Response Structure

```json
{
  "agentId": "nginx-agent",
  "status": "online",
  "version": "2.0.3",
  "workingDirectory": "/opt/ai-agent/agent",
  "platform": "linux",
  "hostname": "nginx.local",
  "timestamp": "2025-07-24T06:45:00.000Z",
  "system": {
    "os": "Ubuntu 22.04.5 LTS",
    "kernel": "6.8.12-11-pve",
    "arch": "x64",
    "uptime": 3600
  },
  "resources": {
    "cpu": {
      "usage": 15.5,
      "cores": 4
    },
    "memory": {
      "total": 8589934592,
      "used": 4294967296,
      "free": 4294967296,
      "percentage": 50.0
    },
    "disk": [
      {
        "device": "/dev/sda1",
        "size": 107374182400,
        "type": "ext4"
      }
    ]
  }
}
```

## Field Descriptions

### Root Level Fields

| Field | Type | Description | Usage |
|-------|------|-------------|-------|
| `agentId` | string | Unique identifier for the agent | Used to identify agents in multi-agent setups |
| `status` | string | Current agent status (always "online" if responding) | Quick health check |
| `version` | string | Agent software version (e.g., "2.0.3") | **Critical for update management** |
| `workingDirectory` | string | Full path where agent is running | Useful for debugging deployment issues |
| `platform` | string | OS platform (linux, darwin, win32) | Determines platform-specific commands |
| `hostname` | string | System hostname | Helps identify physical/virtual machines |
| `timestamp` | string | ISO 8601 timestamp of status response | For monitoring freshness |

### System Information (`system` object)

| Field | Type | Description | Usage |
|-------|------|-------------|-------|
| `os` | string | Operating system name and version | Compatibility checks |
| `kernel` | string | Kernel version | Low-level system compatibility |
| `arch` | string | CPU architecture (x64, arm64, etc.) | Binary compatibility |
| `uptime` | number | Agent process uptime in seconds | Stability monitoring |

### Resource Information (`resources` object)

#### CPU (`resources.cpu`)
| Field | Type | Description | Usage |
|-------|------|-------------|-------|
| `usage` | number | Current CPU usage percentage (0-100) | Performance monitoring |
| `cores` | number | Number of CPU cores available | Capacity planning |

#### Memory (`resources.memory`)
| Field | Type | Description | Usage |
|-------|------|-------------|-------|
| `total` | number | Total memory in bytes | Capacity planning |
| `used` | number | Used memory in bytes | Resource monitoring |
| `free` | number | Free memory in bytes | Resource availability |
| `percentage` | number | Memory usage percentage (0-100) | Quick resource check |

#### Disk (`resources.disk` array)
| Field | Type | Description | Usage |
|-------|------|-------------|-------|
| `device` | string | Disk device identifier | Storage identification |
| `size` | number | Disk size in bytes | Storage capacity |
| `type` | string | Filesystem type | Compatibility info |

## Common Usage Patterns

### 1. Version Management
```javascript
// Check if agent needs update
const status = await fetch('http://agent:3080/api/status', {
  headers: { 'Authorization': 'Bearer token' }
}).then(r => r.json());

if (status.version !== HUB_VERSION) {
  console.log(`Agent ${status.agentId} needs update from ${status.version} to ${HUB_VERSION}`);
}
```

### 2. Resource Monitoring
```javascript
// Alert on high resource usage
if (status.resources.cpu.usage > 80) {
  alert(`High CPU usage on ${status.agentId}: ${status.resources.cpu.usage}%`);
}

if (status.resources.memory.percentage > 85) {
  alert(`High memory usage on ${status.agentId}: ${status.resources.memory.percentage}%`);
}
```

### 3. Deployment Verification
```javascript
// Verify agent is in correct location
const expectedPaths = {
  'unraid-agent': '/mnt/user/home/root/ai-agent',
  'nginx-agent': '/opt/ai-agent/agent',
  'pve1-agent': '/opt/ai-agent/agent'
};

if (status.workingDirectory !== expectedPaths[status.agentId]) {
  console.warn(`Agent ${status.agentId} running from unexpected location: ${status.workingDirectory}`);
}
```

### 4. Platform-Specific Commands
```javascript
// Execute platform-specific commands
const command = status.platform === 'linux' 
  ? 'systemctl restart nginx'
  : 'service nginx restart';
```

### 5. Agent Discovery and Health Check
```javascript
// Discover all online agents
const agents = [];
for (const host of knownHosts) {
  try {
    const status = await fetchStatus(host);
    agents.push({
      ...status,
      host,
      healthy: status.resources.memory.percentage < 90 && status.resources.cpu.usage < 80
    });
  } catch (e) {
    console.log(`Agent at ${host} is offline`);
  }
}
```

## Hub Integration

The hub can use the status endpoint to:

1. **Track agent versions**: Compare each agent's version against the hub's expected version
2. **Monitor resources**: Aggregate resource usage across all agents
3. **Verify deployments**: Ensure agents are running from expected directories
4. **Platform-aware commands**: Send appropriate commands based on agent platform
5. **Health monitoring**: Track uptime and resource usage for alerting

## Example: Update Check Script

```bash
#!/bin/bash
# Check which agents need updates

HUB_VERSION="2.0.3"
HOSTS="192.168.1.5 192.168.1.6 192.168.1.7 192.168.1.2 192.168.1.10"

echo "Checking agent versions against hub version $HUB_VERSION"
echo ""

for host in $HOSTS; do
  STATUS=$(curl -s -H "Authorization: Bearer token" http://$host:3080/api/status)
  if [ $? -eq 0 ]; then
    VERSION=$(echo "$STATUS" | jq -r '.version')
    AGENT_ID=$(echo "$STATUS" | jq -r '.agentId')
    
    if [ "$VERSION" != "$HUB_VERSION" ]; then
      echo "⚠️  $AGENT_ID needs update: $VERSION → $HUB_VERSION"
    else
      echo "✅ $AGENT_ID is up to date: $VERSION"
    fi
  else
    echo "❌ Agent at $host is offline"
  fi
done
```

## Notes

- All byte values are in base units (bytes, not KB/MB)
- CPU usage is instantaneous, not averaged
- The endpoint requires authentication via Bearer token
- Response time can indicate network latency to agents
- Working directory helps identify deployment issues (especially on Unraid)