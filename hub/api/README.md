# Backend AI Hub API Documentation

## Overview
The Hub API provides centralized management and coordination for all Backend AI agents. It handles command dispatch, execution tracking, browser integration, chat logging, and system monitoring.

## Base URL
- Local: `http://192.168.1.30/api`
- All endpoints return JSON unless specified otherwise

---

## Core Endpoints

### System Status
- **GET** `/api/status` - Hub status, version, agent counts, uptime
- **GET** `/health` - Health check with agent status summary
- **GET** `/` - Root endpoint (reloads agent config, serves GUI)

### Agent Management
- **GET** `/api/agents` - List all connected agents with capabilities
- **GET** `/api/agents/:agentId` - Get specific agent details
- **POST** `/api/command` - Execute natural language command on agents
- **POST** `/api/command/v2` - Enhanced async command execution
- **GET** `/api/command/v2/:requestId` - Get async command results

---

## Browser Integration

### Browser Request Queue
- **POST** `/api/browser-requests` - Queue request for browser to pick up
- **GET** `/api/browser-requests/queue` - Queue request via GET (avoid permissions)
- **GET** `/api/browser-requests/pending/:tabId` - Get pending requests for tab
- **POST** `/api/browser-requests/:requestId/response` - Submit response for request
- **GET** `/api/browser-requests/:requestId` - Get response (supports `?wait=true`)
- **GET** `/api/browser-requests/stats` - Queue statistics

### Browser Control
- **POST** `/api/browser/logs` - Get logs from browser
- **POST** `/api/browser/logs/interleaved` - Get interleaved UI/backend logs
- **POST** `/api/browser/state` - Get browser state
- **POST** `/api/browser/control` - Control browser UI elements
- **POST** `/api/browser/execute-and-wait` - Execute command and wait for completion
- **POST** `/api/browser/refresh-after-deploy` - Refresh browser after deployment
- **GET** `/api/browser/logs/:correlationId` - Get complete logs for correlation ID

---

## Tab Registry

### Tab Management
- **POST** `/api/tabs/register` - Register new browser tab
- **GET** `/api/tabs` - Get all active tabs with activity timestamps
- **GET** `/api/tabs/most-recent` - Get most recently active tab
- **GET** `/api/tabs/most-recent/logs` - Request logs from most recent tab
- **GET** `/api/tabs/:tabId` - Get specific tab information

---

## Chat System

### Chat Sessions
- **POST** `/api/chat/start` - Start new chat session
- **POST** `/api/chat/message` - Log chat message
- **POST** `/api/chat/close` - Close chat session
- **GET** `/api/chat/agent/:agentName` - Get chat history for agent
- **GET** `/api/chat/load` - Load specific chat by file path
- **GET** `/api/chat/context` - Get context for resuming chat

---

## Execution Tracking

### Correlation Tracking
- **GET** `/api/executions/stream` - Server-Sent Events for real-time updates
- **GET** `/api/executions/:correlationId` - Get execution status
- **GET** `/api/executions/:correlationId/complete` - Get complete execution data
- **GET** `/api/executions` - Get all recent executions
- **GET** `/api/executions/config/timeouts` - Get timeout configuration
- **POST** `/api/executions/:correlationId/complete` - Mark execution complete
- **POST** `/api/executions/:correlationId/fail` - Mark execution failed
- **POST** `/api/executions/:correlationId/log` - Add log entry

### Logging
- **GET** `/api/logs` - Get system logs
- **GET** `/api/logs/:correlationId` - Search logs by correlation ID

---

## Multi-Agent Operations

### Batch Operations
- **POST** `/api/agents/multi/start` - Start multiple agents
- **POST** `/api/agents/multi/stop` - Stop multiple agents
- **POST** `/api/agents/multi/start-managers` - Start multiple managers
- **POST** `/api/agents/multi/stop-managers` - Stop multiple managers

---

## Manager Control

### Manager Operations
- **POST** `/api/managers/:agentName/:action` - Control specific agent manager
- **GET** `/api/managers/status` - Get status of all managers
- **POST** `/api/managers/start-all` - Emergency start all managers

---

## SSH Management

### SSH Setup
- **GET** `/api/ssh/public-key` - Get hub's SSH public key
- **POST** `/api/ssh/setup/:agentName` - Setup SSH for specific agent
- **POST** `/api/ssh/setup-all` - Batch setup SSH for all agents
- **GET** `/api/ssh/test` - Test SSH connectivity to all agents

---

## Notifications

### Agent Notifications
- **POST** `/api/notifications` - Endpoint for agents to send notifications

---

## Request/Response Formats

### Common Request Body
```json
{
  "type": "control|chat|data",
  "action": "actionName",
  "params": {
    "key": "value"
  }
}
```

### Common Response Format
```json
{
  "requestId": "req_timestamp_randomid",
  "status": "queued|completed|failed",
  "message": "Status message",
  "data": {}
}
```

### Browser Request Flow
1. POST to `/api/browser-requests` to queue request
2. Browser polls `/api/browser-requests/pending/:tabId` 
3. Browser processes and submits response via `/api/browser-requests/:requestId/response`
4. Caller gets result via `/api/browser-requests/:requestId`

### Auto-Registration
- Browsers auto-register when first polling `/api/browser-requests/pending/:tabId`
- Auto-registered tabs receive refresh command to sync versions

---

## Error Handling
- All endpoints return appropriate HTTP status codes
- Error responses include `error` field with description
- Async operations use correlation IDs for tracking

## Authentication
- Currently no authentication required
- SSH endpoints require proper SSH key setup

## Rate Limiting
- Browser polling recommended at 250ms intervals
- No explicit rate limits enforced