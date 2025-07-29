# CRITICAL: Testing Web Servers and APIs

## This Applies To BOTH Agents (port 3080) AND Managers (port 3081)!

## The Problem
When testing Node.js web servers or APIs, the server process runs **forever** - it doesn't exit on its own. This causes:

1. **Port conflicts**: "Port already in use" errors
2. **Startup failures**: Services can't start because ports are blocked
3. **Mysterious delays**: systemd repeatedly tries to start services that fail due to port conflicts
4. **Confusion**: Hard to debug because the test process is still running in the background

## What Happens
```bash
# BAD: This starts a server that runs forever!
ssh root@server "node /path/to/api/index.js" &

# Even this is bad:
ssh root@server "cd /opt/app && node dist/index.js"
```

The Node.js process starts an Express/HTTP server that listens on a port and waits for connections indefinitely.

## The Solution

### Option 1: Always kill test processes
```bash
# Start the test
ssh root@server "node /path/to/api/index.js" &
TEST_PID=$!

# Do your testing...

# ALWAYS kill it afterward
kill $TEST_PID
```

### Option 2: Use timeout
```bash
# Automatically kill after 10 seconds
ssh root@server "timeout 10 node /path/to/api/index.js"
```

### Option 3: Create test scripts with cleanup
```bash
#!/bin/bash
# Start test server
ssh root@server "node /path/to/api/index.js" > test.log 2>&1 &
TEST_PID=$!

# Ensure cleanup on exit
trap "kill $TEST_PID 2>/dev/null" EXIT

# Do testing...
sleep 5
curl http://server:port/api/status

# Script exit will trigger cleanup
```

## Finding and Killing Rogue Processes

```bash
# Find processes using a specific port
ssh root@server "lsof -i :3080"
ssh root@server "netstat -tlnp | grep :3080"

# Find all node processes
ssh root@server "ps aux | grep node | grep -v grep"

# Kill processes by port
ssh root@server "fuser -k 3080/tcp"

# Kill by process pattern
ssh root@server "pkill -f 'node.*api/index.js'"

# Kill manager processes
ssh root@server "pkill -f 'node.*manager.*index.js'"

# Check both ports
ssh root@server "netstat -tlnp | grep -E ':(3080|3081)'"
```

## Best Practices

1. **Always use cleanup**: Either explicit kills or trap handlers
2. **Use unique ports for tests**: Avoid conflicts with production services
3. **Check for existing processes**: Before starting tests, check if port is free
4. **Use systemctl for services**: Don't manually start service processes for testing
5. **Document port usage**: Keep track of which services use which ports

## Common Scenarios to Watch For

- Testing API endpoints (both agent and manager)
- Checking if a service starts correctly
- Debugging startup issues
- Running services with different configurations
- Testing WebSocket connections
- Running multiple versions for comparison
- Testing agent lifecycle commands
- Testing manager control endpoints

## Port Usage Reference

- **3080**: Backend AI Agent (the actual worker)
- **3081**: Agent Manager (lifecycle controller)
- Both are Express servers that run forever!

Remember: **Every `node server.js` command starts a persistent process that must be explicitly stopped!**