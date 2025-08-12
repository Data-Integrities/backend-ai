# Hub Debug API Documentation

This document describes the client-side debug API built into the Backend AI Hub UI. This API allows Claude (or developers) to request diagnostic information from the browser that would otherwise be inaccessible.

**See Also**: [GUI_LOGGING_SYSTEM.md](GUI_LOGGING_SYSTEM.md) for a complete explanation of the logging architecture.

## Overview

The Hub Debug API is a client-side routing system that intercepts specific URLs and handles them in the browser rather than sending them to the server. This gives access to browser-only data like sessionStorage, in-memory logs, and UI state.

## Tab Registration System

Each browser tab registers itself with the Hub API and maintains a unique identifier:

### Tab Lifecycle

1. **Tab Creation**: Each tab generates a unique ID on first load
2. **Registration**: Tab registers with Hub API at `/api/tabs/register`
3. **Activity Tracking**: Every API request updates the tab's last activity timestamp
4. **Most Recent Tab**: The Hub API tracks which tab was most recently active

### Tab ID Format
```
tab_<timestamp>_<random>
Example: tab_1706623200000_a3b7c9d
```

## Client-Side API Endpoints

### Query Endpoints (GET)

#### `/api/client/logs`
Returns hubGuiLog entries from sessionStorage.

**Query Parameters:**
- `worker` - Filter by worker name (e.g., nginx, pve1)
- `correlationId` - Filter by specific correlation ID
- `action` - Filter by action type (e.g., stop-manager, start-agent)
- `last` - Return only the last N entries
- `from` - ISO timestamp for range start
- `to` - ISO timestamp for range end
- `format` - Output format: json (default) or html

**Examples:**
```
/api/client/logs?worker=nginx&last=20
/api/client/logs?correlationId=cmd_123_abc
/api/client/logs?action=stop-manager&from=2024-01-30T10:00:00Z
```

#### `/api/client/state`
Returns current UI state information.

**Response includes:**
- Current agent states and versions
- Active tab information
- Pending commands
- Console visibility
- Tab ID and session info

#### `/api/client/performance`
Returns browser performance metrics.

#### `/api/client/errors`
Returns any JavaScript errors collected during the session.

#### `/api/client/storage`
Returns summary of browser storage usage.

### Action Endpoints (POST)

#### `/api/client/action/stop-all-agents`
Simulates clicking "Stop All Agents" in the hamburger menu.

#### `/api/client/action/stop-all-managers`
Simulates clicking "Stop All Managers" in the hamburger menu.

#### `/api/client/action/clear-console`
Clears the console display.

#### `/api/client/action/clear-logs`
Clears the hubGuiLog from sessionStorage.

#### `/api/client/action/simulate-click`
Simulates clicking a specific button.

**Body Parameters:**
- `target` - The action to simulate (e.g., stop-manager, start-agent)
- `agent` - The agent name to target

## Hub API Coordination

The Hub API maintains a registry of active tabs:

### `/api/tabs`
Returns list of all registered tabs with their last activity time.

### `/api/tabs/most-recent`
Returns information about the most recently active tab.

### `/api/tabs/:tabId/request-logs`
Instructs the Hub API to prepare a redirect to that tab's logs.

## Usage Examples

### For Claude Debugging

1. **Request logs from most recent tab:**
   ```
   Claude: "Please go to /api/tabs/most-recent/logs"
   ```
   This will redirect to the actual tab's client API.

2. **Request specific tab's logs:**
   ```
   Claude: "Can you check tab_1706623200000_a3b7c9d and go to /api/client/logs?last=50"
   ```

3. **Get current UI state:**
   ```
   Claude: "Please visit /api/client/state and share the output"
   ```

### Log Entry Structure

Each log entry in hubGuiLog follows this structure:

```javascript
{
  worker: string | null,      // Worker name or null for hub events
  correlationId: string | null,
  datetime: string,           // ISO timestamp
  action: string,            // Action identifier
  description: string,       // Human-readable description
  error: string | null       // Error message if applicable
}
```

### Common Logged Actions

- `start-agent` - User initiated agent start
- `stop-agent` - User initiated agent stop
- `start-manager` - User initiated manager start
- `stop-manager` - User initiated manager stop
- `stop-all-agents` - Batch operation initiated
- `stop-all-managers` - Batch operation initiated
- `status-change` - A/M indicator changed
- `poll-detected` - Status change detected by polling
- `console-command` - Command added to console
- `hub-startup` - Hub UI loaded
- `tab-registered` - Tab registered with Hub API

## Implementation Notes

1. **Security**: This API only responds to local navigation, not external requests
2. **Persistence**: Logs are stored in sessionStorage (cleared when tab closes)
3. **Size Limits**: Logs are limited to 1000 entries to prevent storage overflow
4. **Format**: Responses can be JSON (for debugging) or HTML (for viewing)

## Future Enhancements

- Log level filtering (debug, info, warn, error)
- Export functionality for extended debugging sessions
- Real-time log streaming via SSE
- Log correlation across multiple tabs