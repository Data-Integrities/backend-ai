# Backend AI - Intelligent Infrastructure Control System

An AI-powered remote management system that enables natural language control over servers, containers, VMs, and entire Proxmox clusters. Talk to your infrastructure like you would to a team member.

## 🌟 Overview

Backend AI transforms infrastructure management from command-line complexity to conversational simplicity. Instead of remembering dozens of commands and SSH-ing into multiple servers, just say what you want:

- "The download server isn't working, can you check it?"
- "Restart nginx on all web servers"
- "Move the database VM to a less busy node"
- "Install monitoring on all production containers"

## 🏗️ Architecture

```
┌─────────────────────────┐
│   AI Command Hub        │ ← Natural language commands
│  (Master Controller)    │ ← Web UI + API
└────────┬────────────────┘
         │ WebSocket/gRPC
    ┌────┴────┬──────────┬──────────┐
    │         │          │          │
┌───▼───┐ ┌──▼───┐ ┌────▼───┐ ┌────▼───┐
│ PVE1  │ │ PVE2 │ │  PVE3  │ │  ...   │
└───┬───┘ └──┬───┘ └────┬───┘ └────┬───┘
    │        │          │          │
┌───▼───┐ ┌──▼───┐ ┌────▼───┐ ┌────▼───┐
│Agent  │ │Agent │ │ Agent  │ │ Agent  │
│(CT100)│ │(VM101)│ │(CT102) │ │(VM103) │
└───────┘ └──────┘ └────────┘ └────────┘
```

### Components

#### 🧠 AI Command Hub (`/hub`)
The central brain that processes natural language commands using Claude AI and orchestrates actions across your infrastructure.

**Features:**
- Natural language processing with Claude AI
- WebSocket server for real-time agent communication
- REST API for external integrations
- Web UI for monitoring and control
- Command risk assessment and confirmation
- Automatic agent discovery and health monitoring

**Tech Stack:** TypeScript, Express.js, WebSocket, Claude API

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

### 1. Start the Hub

```bash
cd hub
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
npm install
npm run dev
```

The hub will start on:
- API: http://localhost:3000
- WebSocket: ws://localhost:3001
- Web UI: http://localhost:3000

### 2. Install Agents

#### Linux Agent (on any Linux server/container)
```bash
curl -sSL http://your-hub:3000/install-agent.sh | sudo HUB_URL=ws://your-hub:3001 bash
```

#### Proxmox Agent (on Proxmox host)
```bash
cd agent-proxmox
npm install && npm run build
sudo ./install-proxmox-agent.sh
```

Then use natural language to deploy to other nodes:
```
"Install the agent on all Proxmox nodes"
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
PORT=3000
WS_PORT=3001

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

### Agent Configuration
Agents are configured during installation or via `/etc/ai-agent/agent.env`

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

### WebSocket Events

Agents connect via WebSocket and exchange typed messages:
- `command_request` - Hub → Agent command
- `command_result` - Agent → Hub result
- `agent_heartbeat` - Periodic health check
- `event_notification` - Agent → Hub alerts

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