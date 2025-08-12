# Backend AI Agent API Documentation

## Overview
The Agent API provides local system management, command execution, and service control for individual infrastructure nodes. Each agent runs on a specific machine and can manage local services, execute commands, and communicate with the hub.

## Base URL
- Local: `http://[agent-ip]:3080/api`
- All endpoints return JSON unless specified otherwise

---

## Core Endpoints

### System Status
- **GET** `/api/status` - Full system information (OS, CPU, memory, uptime, agent version)
- **GET** `/api/version` - Agent version information 
- **GET** `/health` - Simple health check (returns "OK")

### Capabilities
- **GET** `/api/capabilities` - Agent capabilities, services, supported commands, modules
- **GET** `/api/capabilities/:path` - Get specific capability README content

---

## Command Execution

### Direct Execution
- **POST** `/api/execute` - Execute command with request tracking
  ```json
  {
    "command": "systemctl status nginx",
    "requestId": "optional-uuid",
    "async": false,
    "correlationId": "optional-correlation-id"
  }
  ```

### AI-Powered Chat
- **POST** `/api/chat` - Process natural language commands
  ```json
  {
    "command": "restart nginx service",
    "correlationId": "correlation-id",
    "skipConfirmation": false,
    "tabId": "browser-tab-id"
  }
  ```

### Command Status
- **GET** `/api/command/:requestId` - Get command execution status and results

---

## Service Management

### Service Control
- **GET** `/api/services` - List all available services and their status
- **POST** `/api/services/:service/:action` - Control specific service
  - Actions: `start`, `stop`, `restart`, `status`, `enable`, `disable`
  - Example: `POST /api/services/nginx/restart`

---

## Correlation & Events

### Correlation Tracking
- **POST** `/api/correlation/acknowledge` - Acknowledge correlation ID receipt from hub
  ```json
  {
    "correlationId": "correlation-id"
  }
  ```

### Event Notifications
- **POST** `/api/events` - Send events to hub for centralized logging
  ```json
  {
    "type": "service_status",
    "agentId": "nginx",
    "timestamp": "2025-08-04T00:00:00.000Z",
    "data": {}
  }
  ```

---

## Logging

### System Logs
- **GET** `/api/logs` - Get system logs
  - Query params: `lines` (default: 100)
  - Returns recent log entries from agent operations

---

## Agent Variants

The agent API comes in several variants:

### Standard Agent (`index.ts`)
- Full-featured API with all endpoints
- Service discovery and management
- Correlation tracking and hub communication
- Chat/AI command processing

### HTTP Agent (`http-agent.ts`)
- Lightweight version focused on HTTP operations
- Basic status and capabilities endpoints
- Simple command execution

### Debug Agent (`index-debug.ts`)
- Minimal API for debugging and testing
- Basic health and status endpoints only
- Reduced logging and complexity

### Profiled Agent (`index-profiled.ts`)
- Performance monitoring enabled
- Same functionality as standard agent
- Additional profiling and metrics collection

---

## Request/Response Formats

### Standard Response Format
```json
{
  "success": true|false,
  "message": "Response message",
  "data": {},
  "requestId": "uuid",
  "timestamp": "ISO-8601-timestamp"
}
```

### Command Execution Response
```json
{
  "requestId": "uuid",
  "status": "pending|running|completed|failed",
  "output": "command output",
  "error": "error message if failed",
  "startTime": "ISO-8601-timestamp",
  "endTime": "ISO-8601-timestamp",
  "duration": 1234
}
```

### Service Status Response
```json
{
  "serviceName": "nginx",
  "status": "active|inactive|failed",
  "enabled": true|false,
  "pid": 1234,
  "uptime": "1d 2h 3m",
  "lastStart": "ISO-8601-timestamp"
}
```

---

## Capabilities System

### Capability Structure
Each agent reports capabilities including:
- **Agent ID**: Unique identifier
- **Type**: linux-host, docker-host, etc.
- **Summary**: Brief description
- **Services**: Available services (nginx, docker, ssh, etc.)
- **Commands**: Supported command categories
- **Modules**: Extended functionality modules

### Module System
Agents can have specialized modules:
- **Nginx Management**: SSL certificate management, site configuration
- **Docker Management**: Container lifecycle, image management
- **DNS Management**: Cloudflare API integration
- **Backup Management**: Automated backup operations

---

## Security & Authentication

### Access Control
- No authentication required for local access
- Hub communication uses internal networking
- SSH key management handled via hub coordination

### Safe Command Execution
- Commands run with agent's system privileges
- Dangerous operations may require confirmation
- All commands logged with correlation tracking

---

## Error Handling

### HTTP Status Codes
- `200`: Success
- `400`: Bad request (invalid parameters)
- `404`: Endpoint or resource not found
- `500`: Internal server error

### Error Response Format
```json
{
  "success": false,
  "error": "Error description",
  "code": "ERROR_CODE",
  "requestId": "uuid"
}
```

---

## Integration with Hub

### Hub Communication
- Agents register with hub on startup
- Regular heartbeat/status updates sent to hub
- Hub can dispatch commands to agents
- Correlation IDs track command execution across hub and agents

### Event Flow
1. Hub sends command to agent via `/api/execute` or `/api/chat`
2. Agent acknowledges with `/api/correlation/acknowledge`
3. Agent executes command and reports progress
4. Agent notifies hub of completion via hub's correlation endpoints

---

## Performance Notes

- Standard agent includes full system monitoring
- Use http-agent variant for reduced overhead
- Async command execution available for long-running operations
- Service status cached for performance

## Deployment Notes

- Each agent runs on port 3080 by default
- Agent name determined by AGENT_NAME environment variable
- Configuration managed via shared backend-ai-config.json
- Multiple agent variants available based on requirements