# Backend AI Hub GUI Logging System

## Overview

The Backend AI Hub has a sophisticated multi-layer logging system that tracks both user interactions in the browser and backend operations on the servers. This document explains how the logging system works and how to use it effectively.

## Architecture

### Three Layers of Logging

1. **hubGuiLog (Browser)** - Tracks UI events in sessionStorage
2. **Correlation Tracker (Backend)** - Tracks command execution across services  
3. **Interleaved View** - Combines both for complete operation visibility

## hubGuiLog - UI Event Tracking

### What It Tracks
Every user action in the Hub UI is logged with:
- **Worker**: Which agent/worker was targeted (or 'hub' for general actions)
- **CorrelationId**: Links UI actions to backend operations
- **Action**: Type of action (e.g., 'stop-agent', 'tab-switch')
- **Description**: Human-readable description
- **Timestamp**: When the action occurred

### Logged Actions
- `hub-startup` - When the Hub UI loads
- `tab-created` / `tab-closed` / `tab-switch` - Tab lifecycle
- `agent-selected` / `agent-deselected` - Agent selection
- `console-command` - Commands submitted in console
- `start-agent` / `stop-agent` - Individual agent operations
- `start-manager` / `stop-manager` - Manager operations
- `start-all-agents` / `stop-all-agents` - Batch operations
- `clear-console` - Console cleared
- And more...

### Storage
- Stored in browser's sessionStorage (persists across refreshes, cleared on tab close)
- Limited to 1000 entries to prevent overflow
- Each tab has unique ID for tracking

## Correlation Tracking - Backend Operations

### What It Tracks
Every backend operation is tracked with:
- **CorrelationId**: Unique identifier for the operation
- **Command**: What operation was requested
- **Agent**: Which agent is involved
- **Status**: Current state (pending, completed, failed)
- **Logs**: Detailed execution logs with timestamps
- **Parent/Child**: Relationships for multi-agent operations

### Operation Flow
1. UI generates correlationId when user initiates action
2. Hub API receives request with correlationId
3. Backend tracks all steps of execution
4. Status updates flow back via SSE (Server-Sent Events)
5. UI updates console in real-time

## Interleaved Log View

When you click "View" on any operation with a correlationId:

### Timeline View
Shows chronological sequence of events:
- **Backend Events**: SSH commands, callbacks, status changes
- **UI Events**: User actions that triggered the operation
- Icons indicate event type (👤 for UI, ⚡ for Hub, 🔌 for SSH, etc.)
- Elapsed time from operation start

### Log View  
Raw logs with UI events interleaved:
- Backend logs appear in white
- UI events appear in purple with `[UI EVENT]` prefix
- Perfect chronological ordering

## Accessing the Logs

### For Debugging (Claude)

1. **Get logs from most recent tab**:
   ```
   Please visit: http://192.168.1.30/api/tabs/most-recent/logs
   ```

2. **Get filtered logs**:
   ```
   http://192.168.1.30/api/client/logs?correlationId=cmd_123_abc
   http://192.168.1.30/api/client/logs?action=stop-agent&last=20
   http://192.168.1.30/api/client/logs?worker=nginx
   ```

3. **Get current UI state**:
   ```
   http://192.168.1.30/api/client/state
   ```

### For Users

- Click "View" link in console for any operation
- See both what you did and what happened in response
- Perfect for troubleshooting issues

## Example Scenario

User stops an agent:

1. **UI logs**: "User initiated stop-agent operation on nginx"
2. **Backend starts**: Correlation tracker begins execution
3. **Hub logs**: "Stop command received for nginx" 
4. **Hub logs**: "Calling manager API at http://192.168.1.2:3081/stop"
5. **Manager executes**: Sends stop command via SSH
6. **Callback received**: Manager reports success
7. **UI updates**: Agent indicator changes from green to red

All of this appears in the interleaved view with timestamps and elapsed times.

## Benefits

1. **Complete Visibility**: See user actions AND system responses
2. **Debugging**: Understand exactly what triggered an operation
3. **Audit Trail**: Full history of who did what when
4. **Correlation**: Links UI events to backend operations
5. **Real-time**: Updates as operations progress

## Technical Details

### Tab Registry
- Each browser tab gets unique ID (stored in sessionStorage)
- Hub tracks active tabs with heartbeat
- Can request logs from specific tab or most recent

### Client-Side API
- Special URLs intercepted by browser (not sent to server)
- `/api/client/*` routes handled locally
- Returns browser-only data (sessionStorage, memory state)

### Performance
- Logs limited to 1000 entries per tab
- Old logs auto-pruned
- Minimal overhead on operations
- No impact on normal hub operations

## Future Enhancements

Potential improvements being considered:
- Console tabs for different log views
- Log level filtering
- Export functionality
- Cross-tab correlation
- Persistent storage options