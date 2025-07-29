# Backend AI Hub

## Architecture Overview

The Backend AI Hub is a central control interface that manages multiple AI agents across your infrastructure. It uses a **HTTP polling-based architecture** where the hub periodically polls agents for status and sends commands.

### Network Architecture

```
User Browser
     |
     | (Port 80)
     v
  AI Hub (192.168.1.30)
     |
     | (HTTP Polling to port 3080)
     v
  AI Agents (Various IPs)
```

### Key Design Principles

1. **Hub-Initiated Communication**: The hub polls agents via HTTP on port 3080 every 30 seconds. Agents never initiate connections to the hub.

2. **Agent Discovery**: The hub uses `agents-config.json` to maintain a list of agent IPs and ports to poll.

3. **HTTP Only**: All communication is via standard HTTP requests. No persistent connections.

4. **Port Configuration**:
   - **Hub**: Runs on port 80 (web interface and API)
   - **Agents**: All agents run on port 3080
   - This separation allows the hub to coexist with other web services while agents use a dedicated port

## Configuration

### Hub Configuration (.env)
```
PORT=80
ANTHROPIC_API_KEY=your-api-key-here
```

### Agent Configuration (agents-config.json)
```json
{
  "agents": [
    {
      "agent-name": "nginx",
      "ip": "192.168.1.2",
      "port": 3080,
      "aliases": ["nginx", "forwarder", "dns router", "web server"]
    }
  ]
}
```

## Deployment

### On Hub Server (192.168.1.30)

```bash
# Navigate to hub directory
cd /home/jeffk/dev/provider-search/backend-ai/hub

# Build the TypeScript code
npm run build

# Start hub (requires sudo for port 80)
sudo nohup node dist/index.js > hub.log 2>&1 &

# Check status
sudo ps aux | grep "node dist/index.js" | grep -v grep

# View logs
tail -f hub.log

# Stop hub
sudo pkill -f "node dist/index.js"

# Restart hub
sudo pkill -f "node dist/index.js" && sudo nohup node dist/index.js > hub.log 2>&1 &
```

## Agent Status Monitoring

The hub continuously polls all configured agents and displays their status:
- 🟢 **Green dot**: Agent is online and responding
- 🔴 **Red dot**: Agent is offline or not responding

## API Endpoints

- `GET /api/agents` - List all configured agents with online/offline status
- `POST /api/command` - Execute natural language commands on agents
- `GET /api/command/:id/results` - Get command execution results
- `POST /api/suggestions` - Get AI-suggested commands
- `GET /health` - Hub health check

## How It Works

1. **Agent Configuration**: Add agents to `agents-config.json` with their IP addresses and port 3080
2. **Polling Cycle**: Every 30 seconds, the hub sends HTTP GET requests to each agent's `/api/status` endpoint
3. **Status Updates**: Agent responses update the online/offline status shown in the web UI
4. **Command Execution**: When you send a command, the hub POSTs it to the appropriate agent(s)
5. **Result Collection**: The hub polls agents for command results and displays them

## Security Considerations

- The hub only exposes port 80 for user interface access
- All agent communication is outbound HTTP requests from the hub
- Agents only respond to requests from the hub's IP address
- No external systems can directly access agents

## Adding New Agents

1. Deploy the agent software to the target machine
2. Configure it to listen on port 3080
3. Add the agent to `agents-config.json`
4. The hub will automatically discover it within 60 seconds

## Troubleshooting

### Agent Shows as Offline
- Verify agent is running: `curl http://[agent-ip]:3080/api/status`
- Check firewall allows inbound connections on port 3080
- Verify agent IP in agents-config.json is correct

### Hub Won't Start
- Check if port 80 is already in use: `sudo lsof -i :80`
- Verify running as root/sudo (required for port 80)
- Check hub.log for error messages

### Commands Not Executing
- Verify agent capabilities match the command type
- Check agent logs on the target machine
- Ensure Anthropic API key is configured in .env