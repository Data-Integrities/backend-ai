# Version Management Guide

## Overview
The Backend AI system now includes comprehensive version tracking and management capabilities. This guide explains how to use these features effectively.

## Key Components

### 1. VERSION_CONFIG.json
Central configuration file that defines expected versions:
```json
{
  "agentVersion": "2.0.3",
  "hubVersion": "1.0.0",
  "minimumAgentVersion": "2.0.0",
  "description": "Version configuration for Backend AI system",
  "lastUpdated": "2025-07-24T06:45:00.000Z"
}
```

### 2. Agent Version Tracking
Each agent reports its version via `/api/status`:
- Version is read from `package.json` 
- Automatically incremented with `build-with-version.sh`
- Includes working directory for deployment verification

### 3. Hub Version Comparison
The hub tracks and compares agent versions:
- `/api/agents` - Shows version status for each agent
- `/api/status` - Hub's own status including expected agent version
- `/api/version-check` - Detailed version report with update recommendations

## Building and Deploying

### Auto-increment Agent Version
```bash
cd agent
./build-with-version.sh  # Increments patch version automatically
```

### Deploy with Version Tracking
```bash
./deploy-agents-with-version.sh  # Shows before/after versions
```

### Check Version Status
```bash
# Quick check
./test-version-system.sh

# Detailed version report
curl http://192.168.1.30/api/version-check | jq '.'
```

## API Usage Examples

### 1. Check Single Agent Version
```bash
curl -H "Authorization: Bearer your-secure-token" \
  http://192.168.1.2:3080/api/status | jq '.version'
```

### 2. Get All Agent Versions
```bash
curl http://192.168.1.30/api/agents | jq '.agents[] | {name, version, versionStatus}'
```

### 3. Find Agents Needing Updates
```bash
curl http://192.168.1.30/api/version-check | jq '.agents.needsUpdate'
```

### 4. Check Hub's Expected Version
```bash
curl http://192.168.1.30/api/status | jq '.expectedAgentVersion'
```

## Automated Version Checking

Create a monitoring script:
```bash
#!/bin/bash
# check-versions.sh

REPORT=$(curl -s http://192.168.1.30/api/version-check)
NEED_UPDATE=$(echo "$REPORT" | jq -r '.summary.needsUpdate')

if [ "$NEED_UPDATE" -gt 0 ]; then
    echo "⚠️  $NEED_UPDATE agents need updates:"
    echo "$REPORT" | jq -r '.agents.needsUpdate[] | "  - \(.name): \(.currentVersion) → \(.updateTo)"'
fi
```

## Version Update Workflow

1. **Update VERSION_CONFIG.json** with new target version
2. **Build agent** with auto-increment: `./build-with-version.sh`
3. **Deploy updates**: `./deploy-agents-with-version.sh`
4. **Verify deployment**: `./test-version-system.sh`

## Integration with CI/CD

The version system supports automation:
- Version numbers in package.json files
- VERSION_CONFIG.json for expected versions
- API endpoints for programmatic checking
- Build scripts that auto-increment versions

## Troubleshooting

### Agent Shows Wrong Version
1. Check if agent restarted after update
2. Verify package.json was included in deployment
3. Check working directory matches expected location

### Hub Not Tracking Versions
1. Ensure agents have AUTH_TOKEN set
2. Check hub can reach agents on port 3080
3. Verify VERSION_CONFIG.json exists in hub directory

### Version Comparison Not Working
1. Update hub to latest version
2. Check agents are reporting version in status
3. Verify SimpleHttpAgents is polling successfully

## Best Practices

1. **Always increment versions** when making changes
2. **Update VERSION_CONFIG.json** before mass deployments
3. **Use version-check endpoint** before updates
4. **Monitor working directories** to catch deployment issues
5. **Keep minimum version updated** to enforce compatibility

## Future Enhancements

Potential improvements to consider:
- Automatic update notifications
- Rollback to previous versions
- Version compatibility matrix
- Update scheduling system
- Webhook notifications for version mismatches