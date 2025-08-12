# Testing the Hub Debug API

This document provides test instructions for the new Hub Debug API functionality.

## Prerequisites

1. Hub is deployed and running at http://192.168.1.30/
2. Browser DevTools console access

## Testing Tab Registration

1. Open the Hub UI in your browser
2. Open DevTools console and run:
```javascript
TAB_ID
```
This should show a unique tab ID like `tab_1706623200000_a3b7c9d`

3. Check tab registration with Hub API:
```bash
curl http://192.168.1.30/api/tabs
```
Should show your active tab

## Testing Client-Side API

### Test 1: Hub Startup Log
Navigate to: http://192.168.1.30/api/client/logs?action=hub-startup

You should see a log entry showing when the hub UI loaded.

### Test 2: Agent Operations
1. Right-click on any agent to open context menu
2. Perform an operation (e.g., Stop Agent)
3. Navigate to: http://192.168.1.30/api/client/logs?last=10

You should see your agent operation logged.

### Test 3: Tab Operations
1. Create a new tab by entering a command
2. Switch between tabs
3. Close a tab
4. Navigate to: http://192.168.1.30/api/client/logs?action=tab-created,tab-switch,tab-closed

### Test 4: Console Commands
1. Submit a command in the console
2. Navigate to: http://192.168.1.30/api/client/logs?action=console-command

### Test 5: Batch Operations
1. Use hamburger menu to "Stop All Agents"
2. Navigate to: http://192.168.1.30/api/client/logs?action=stop-all-agents

### Test 6: Agent Selection
1. Click on agents to select/deselect them
2. Navigate to: http://192.168.1.30/api/client/logs?action=agent-selected,agent-deselected

## Testing Hub API Integration

### Test 1: Most Recent Tab
```bash
curl http://192.168.1.30/api/tabs/most-recent
```
Should return the most recently active tab info.

### Test 2: Request Logs from Most Recent Tab
```bash
curl http://192.168.1.30/api/tabs/most-recent/logs
```
Should redirect to the client API with the tab ID.

## Testing Client API Actions

### Test 1: Simulate Stop All Agents
Navigate to: http://192.168.1.30/api/client/action/stop-all-agents
(POST request required - use DevTools or curl)

### Test 2: Clear Logs
Navigate to: http://192.168.1.30/api/client/action/clear-logs
(POST request required)

## Testing Log Filtering

### By Worker
http://192.168.1.30/api/client/logs?worker=nginx

### By Correlation ID
http://192.168.1.30/api/client/logs?correlationId=cmd_123_abc

### By Time Range
http://192.168.1.30/api/client/logs?from=2024-01-30T10:00:00Z

### Multiple Filters
http://192.168.1.30/api/client/logs?worker=nginx&action=stop-agent&last=5

## Testing State Endpoint

Navigate to: http://192.168.1.30/api/client/state

Should show:
- Current agent states
- Active tab info
- Tab ID
- Console visibility

## Expected Log Actions

The following actions should be logged:
- `hub-startup` - When hub UI loads
- `tab-created` - When creating a new tab
- `tab-switch` - When switching tabs
- `tab-closed` - When closing a tab
- `tab-registered` - When tab registers with hub
- `agent-selected` - When selecting an agent
- `agent-deselected` - When deselecting an agent
- `console-command` - When submitting a command
- `clear-console` - When clearing console
- `start-agent` - Individual agent start
- `stop-agent` - Individual agent stop
- `start-manager` - Individual manager start
- `stop-manager` - Individual manager stop
- `start-all-agents` - Batch start agents
- `stop-all-agents` - Batch stop agents
- `start-all-managers` - Batch start managers
- `stop-all-managers` - Batch stop managers
- `status-change` - When A/M indicators change
- `poll-detected` - When polling detects changes

## Debugging Tips

1. Check sessionStorage in DevTools:
```javascript
JSON.parse(sessionStorage.getItem('hubGuiLogs'))
```

2. Check tab ID:
```javascript
sessionStorage.getItem('tabId')
```

3. Test log format parameter:
- JSON: http://192.168.1.30/api/client/logs?format=json
- HTML: http://192.168.1.30/api/client/logs?format=html

## For Claude Testing

When Claude asks you to test, navigate to these URLs and share the output:
1. http://192.168.1.30/api/tabs/most-recent/logs?last=20
2. http://192.168.1.30/api/client/state
3. http://192.168.1.30/api/client/logs?action=hub-startup