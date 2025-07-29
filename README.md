# Backend AI - Intelligent Infrastructure Control System

An AI-powered remote management system that enables natural language control over servers, containers, VMs, and entire Proxmox clusters. Talk to your infrastructure like you would to a team member.

## 🌟 Overview

Backend AI transforms infrastructure management from command-line complexity to conversational simplicity. Instead of remembering dozens of commands and SSH-ing into multiple servers, just say what you want:

- "The download server isn't working, can you check it?"
- "Restart nginx on all web servers"
- "Move the database VM to a less busy node"
- "Install monitoring on all production containers"

## ⚠️ CRITICAL INVARIANTS - NEVER VIOLATE THESE

1. **HUB ALWAYS RUNS ON PORT 80** (192.168.1.30:80)
2. **ALL AGENTS ALWAYS RUN ON PORT 3080** (*.*.*.X:3080)
3. **NO WEBSOCKETS** - Everything uses HTTP REST APIs only
4. **Hub → Agent**: HTTP requests to agent:3080/api/*
5. **Agent → Hub**: HTTP requests to hub:80/api/*
6. **Polling**: Hub polls agents every 30s via HTTP
7. **Agents are stateless** - They only respond to HTTP requests

## 🏗️ Architecture

```
┌─────────────────────────┐
│   AI Command Hub        │ ← Natural language commands
│  (Port 80 - Web/API)    │ ← HTTP Polling Architecture
└────────┬────────────────┘
         │ HTTP Poll every 30s
    ┌────┴────┬──────────┬──────────┐
    │         │          │          │
┌───▼───┐ ┌──▼───┐ ┌────▼───┐ ┌────▼───┐
│Agent  │ │Agent │ │ Agent  │ │ Agent  │
│:3080  │ │:3080 │ │ :3080  │ │ :3080  │
└───────┘ └──────┘ └────────┘ └────────┘
   Native   Native    Docker     Native
   (Linux)  (PVE)   (Unraid)   (Linux)
```

**Key Architecture Decisions:**
- Hub runs on port 80, agents on port 3080
- HTTP polling (not WebSocket) - agents never initiate connections
- Different deployment methods based on OS (see [Agent Installation Architecture](./AGENT_INSTALLATION_ARCHITECTURE.md))

### Components

#### 🧠 AI Command Hub (`/hub`)
The central brain that processes natural language commands using Claude AI and orchestrates actions across your infrastructure.

**Features:**
- Natural language processing with Claude AI
- HTTP polling architecture for agent communication
- REST API for external integrations
- Web UI for monitoring and control
- Command risk assessment and confirmation
- Automatic agent discovery and health monitoring

**Tech Stack:** TypeScript, Express.js, Claude API

#### 🤖 Linux Agent (`/agent`)
Lightweight agent that runs on Linux servers, containers, and VMs to execute commands safely.

**Capabilities:**
- Service management (start/stop/restart/status)
- Configuration file management with automatic backups
- Log analysis and error detection
- System resource monitoring
- Network diagnostics
- Automatic updates from hub
- Event notifications for issues

**Safety Features:**
- Command validation before execution
- Automatic configuration backups
- Rollback on failures
- Sandboxed execution

#### 🎮 Proxmox Agent (`/agent-proxmox`)
Specialized agent that integrates with Proxmox VE API for cluster-wide management.

**Capabilities:**
- VM/Container lifecycle (start/stop/create/delete)
- Live migration between nodes
- Resource monitoring across cluster
- Backup management
- **Self-deployment to other Proxmox nodes**
- Network and storage management

**Unique Features:**
- Can install itself on other Proxmox nodes
- Monitors cluster health
- Automatic workload balancing suggestions

#### 🪟 Windows Agent (`/agent-windows`) *[Planned]*
For managing Windows build servers and runners.

#### 🍎 macOS Agent (`/agent-macos`) *[Planned]*
For managing macOS build machines.

#### 📦 Shared Types (`/shared`)
TypeScript type definitions shared across all components.

## 🚀 Quick Start

### 1. Deploy the Hub

The hub is deployed on 192.168.1.30 and runs on port 80:

```bash
# On your development machine
cd hub
npm run build
./deploy-hub.sh
```

The hub provides:
- Web UI: http://192.168.1.30
- API: http://192.168.1.30/api/
- Health: http://192.168.1.30/health

### 2. Deploy Agents

**⚠️ IMPORTANT**: Different systems require different deployment methods!  
See [Agent Deployment Quick Reference](./AGENT_DEPLOYMENT_QUICKREF.md) for details.

#### For Linux/Proxmox Systems (Native)
```bash
# Deploy to nginx server
./deploy-agent-v2.sh nginx root

# Deploy to all Proxmox hosts
for host in pve1 pve2 pve3; do
    ./deploy-agent-v2.sh $host root
done
```

#### For Unraid (Docker)
```bash
# Deploy via Docker
./deploy-agent-unraid-docker.sh unraid
```

### 3. Verify Deployment

```bash
# Check hub status
curl -s http://192.168.1.30/api/agents | jq '.'

# Check specific agent
curl -s http://192.168.1.2:3080/api/status | jq '.'
```

## 💬 Example Commands

### Service Management
```
"Check if nginx is running on web-server"
"Restart the MySQL service on database-server"
"Stop all Apache services tagged 'development'"
```

### Debugging & Diagnostics
```
"The API server isn't responding, can you check the logs?"
"Show me the last 50 error logs from the payment service"
"Why is the download server running slowly?"
```

### Configuration Management
```
"Show me the nginx configuration on web-server-01"
"Add domain shop.example.com to nginx"
"Update PHP memory limit to 512M on all app servers"
```

### Proxmox Cluster Management
```
"List all VMs on pve1"
"Migrate the database VM to pve2"
"Create a new container called test-api with 4GB RAM"
"Backup all production VMs"
"Which node has the most available resources?"
```

### System Information
```
"Show disk usage on all servers"
"Which servers are using more than 80% CPU?"
"List all servers running Ubuntu 22.04"
```

## 🔒 Security

### Authentication & Authorization
- JWT-based authentication between hub and agents
- Optional agent whitelisting
- Command approval for high-risk operations
- Full audit logging of all commands

### Network Security
- TLS encryption for all communications
- Agent-initiated connections (no inbound ports needed)
- Private network support with relay options

### Command Safety
- Risk assessment (Low/Medium/High/Critical)
- Automatic backups before configuration changes
- Rollback capabilities
- Confirmation required for destructive operations

## 🔄 Remote Updates

The system supports remote agent updates without manual intervention:

```
"Update all agents"
"Deploy version 1.2.0 to all agents"
"Check agent versions across infrastructure"
```

Updates are atomic with automatic rollback on failure.

## 📊 Monitoring & Alerts

Agents automatically monitor and alert on:
- High CPU usage (>80%)
- High memory usage (>85%)
- Disk space issues (>90%)
- Service failures
- Network connectivity problems

Events are sent to the hub for centralized handling and can trigger:
- Notifications (Slack, email, etc.)
- Auto-remediation
- Escalation workflows

## 🛠️ Advanced Features

### Self-Deployment
The Proxmox agent can deploy itself and other agents:
```
"Install the Proxmox agent on all nodes"
"Deploy monitoring agents to all production containers"
```

### Batch Operations
```
"Restart nginx on all servers tagged 'webserver'"
"Update all Ubuntu containers"
"Check disk space on servers matching 'db-*'"
```

### Conditional Logic
Commands can include conditions:
```
"If CPU usage is over 80%, restart the app service"
"Start backup-server only if primary-server is running"
```

## 🔧 Configuration

### Hub Configuration (.env)
```env
# API Configuration
PORT=80

# AI Configuration
ANTHROPIC_API_KEY=your-api-key

# Security
JWT_SECRET=your-secret-key
REQUIRE_AUTH=true
ALLOWED_AGENTS=agent-1,agent-2

# Proxmox Servers (optional)
PVE1_HOST=192.168.1.100
PVE1_USERNAME=root@pam
PVE1_PASSWORD=secure-password
```

### ⚠️ Important Deployment Notes

- **API Key Management**: The Anthropic API key should be securely stored and configured on both hub and agents
- **Port Configuration**: Hub runs on port 80, all agents run on port 3080
- **Network Architecture**: Hub polls agents via HTTP - agents never initiate connections
- **Deployment Methods**: Native for Linux/Proxmox, Docker for Unraid/Windows
- **Documentation**: 
  - [Agent Installation Architecture](./AGENT_INSTALLATION_ARCHITECTURE.md) - Detailed explanation
  - [Agent Deployment Quick Reference](./AGENT_DEPLOYMENT_QUICKREF.md) - Quick commands
  - [Deployment Guide](./DEPLOYMENT_GUIDE.md) - Decision flowchart

### Agent Configuration
Agents are automatically configured during deployment with appropriate settings for their OS

## 📚 API Reference

### REST API Endpoints

```http
POST /api/command
{
  "command": "restart nginx on web-server",
  "targetAgents": ["web-server-01"],  // optional
  "requireConfirmation": false         // optional
}

GET /api/agents
Returns list of connected agents and their status

GET /api/command/:id/results
Get results of a specific command execution
```

### HTTP API Messages

Agents are polled via HTTP and exchange typed messages:
- `command_request` - Hub → Agent command via polling
- `command_result` - Agent → Hub result via polling response
- `agent_heartbeat` - Periodic health check via polling
- `event_notification` - Agent → Hub alerts via notification endpoint

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built with Claude AI by Anthropic
- Inspired by the need to simplify infrastructure management
- Special thanks to the Proxmox VE team for their excellent API

---

**Remember:** Your infrastructure should work for you, not the other way around. Talk to it naturally, and let AI handle the complexity.