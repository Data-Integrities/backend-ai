# Backend AI UI Regeneration Rules

This document defines the user interface specifications for the Backend AI Hub. When regenerating UI code, these rules ensure consistent appearance and behavior.

## Overview

The Backend AI Hub UI provides:
- Real-time agent/manager status monitoring
- Command execution console
- Log viewing capabilities
- Batch operations via dropdown menu

## Agent Status Cards

### Card Layout

Each agent card displays:
```
┌─────────────────────────────┐
│ nginx            A M        │
│ 192.168.1.2                 │
│ Agent: v2.1.94              │
│ Manager: v2.1.94            │
└─────────────────────────────┘
```

### Status Indicators

**Position**: Top right of card, two letter indicators
- **A** - Agent status (left indicator)
- **M** - Manager status (right indicator)

**Display**:
- Letters are shown as plain text, not circles
- Format: "A M" with a space between
- Font: Bold, same size as agent name
- Positioned inline with agent name on the right side

**Colors**:
- Green (#10b981) - Service is online and responding
- Red (#ef4444) - Service is offline or not responding
- Gray (#9ca3af) - Status unknown or not applicable

**Implementation**: Letters change color based on status, not background circles

### Version Display

**Version Persistence**:
- Display persisted versions from `backend-ai-config.json`
- Each agent has `versions.agent` and `versions.manager` fields
- Format: "Agent: vX.X.X" and "Manager: vX.X.X"
- Show "unknown" only if no version has ever been detected

**Version Updates**:
- Polling automatically updates versions in config when changes detected
- Visual feedback when version changes (brief highlight/flash)
- Versions persist across hub restarts and service outages
- Config file is updated immediately when version changes are detected

**Initial Load**:
- Hub loads last known versions from config on startup
- Shows these versions even if agents are offline
- Updates occur only when polling detects different versions

## Command Console

### Console Entry Layout

Each console entry shows:
```
[timestamp] [correlationId] [agent] [status] command
```

**Status Colors**:
- `pending` - Blue (#3b82f6)
- `success` - Green (#10b981)
- `failed` - Red (#ef4444)
- `timeout` - Orange (#f59e0b)
- `timeoutSuccess` - Yellow (#eab308)
- `manualTermination` - Orange (#f59e0b)
- `partialSuccess` - Yellow (#eab308)

### Parent-Child Display

- Parent commands appear BEFORE their children
- Children are indented with "└─" prefix
- Parent status updates only after all children complete

## Log Viewer Modal

### Modal Dimensions

```css
.modal {
    height: 80vh;
    position: fixed;
    top: 10vh;
    width: 90%;
    max-width: 1200px;
}
```

**Rationale**: Ensures entire modal fits in screenshot with 10% gaps top/bottom

### Header Layout

**Two-line compact header**:
```
Command: stop-manager | Agent: pve1 | Status: success
Started: 14:45:23 | Completed: 14:45:26 → 3.2s
```

**Key changes**:
- Remove dates from timestamps (just show time)
- Status on same line as command/agent
- Completed time on same line as started
- Small gap before "Execution Timeline" section

### Title Bar

- Smaller font size (0.875rem vs 1rem)
- Reduced padding (0.5rem vs 1rem)
- Maintains close button positioning

### Execution Timeline

- Scrollable area for log entries
- Monospace font for consistency
- Line wrapping for long entries

## Hamburger Menu

### Structure

```
☰ Backend AI Hub
├─ System Health Check
├─ View Agent Capabilities
├─ ─────────────────────── (divider)
├─ Agent Operations
│  ├─ Start All Agents
│  └─ Stop All Agents
├─ Manager Operations
│  ├─ Start All Managers
│  └─ Stop All Managers
└─ ─────────────────────── (divider)
```

### Divider Style

```css
.dropdown-divider {
    height: 0;
    margin: 0.5rem 0;
    overflow: hidden;
    border-top: 1px solid #e5e7eb;
}
```

## Status Bar

### Clock Display

**Format**: "h:mm:ss A" (e.g., "2:45:33 PM")
- Remove leading zero from hour
- Include seconds
- Update every second via setInterval(1000)

**Implementation**:
```javascript
function formatTime(date = new Date()) {
    return date.toLocaleTimeString('en-US', { 
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true 
    });
}
```

**Purpose**:
- Provides timestamp reference for screenshots
- Helps correlate UI events with log entries
- Useful for debugging and tracking action timing

## Dialogs

### Summary Dialogs (Batch Operations)

**Header**: Shows total execution time
```
Stop All Managers - Success
Total time: 6.32 seconds
```

**Success Section**:
```
✅ Successful (3):
• nginx - Stopped → 2.4s
• pve1 - Stopped → 3.1s
• pve2 - Stopped → 2.8s
```

**Failure Section** (if any):
```
❌ Failed (1):
• pve3 - Connection refused
```

**Timing**: Show individual callback duration for each agent

### Error Dialogs

**Manager Offline Error**:
```
Cannot Control Agent

The manager on {agentName} is not running.
Please start the manager first before attempting to control the agent.
```

### Confirmation Dialogs

Standard browser confirm() for destructive operations

## Visual Feedback

### Instant Status Updates

When callbacks are received:
1. Console entry updates immediately
2. A/M status indicators change color instantly
3. No waiting for next 5-second poll

### Loading States

- Show "pending" status during operations
- Disable buttons during execution
- Update UI immediately on completion

## Responsive Design

- Cards flow in grid layout
- Modal adapts to screen width (90% max)
- Console remains readable on narrow screens

## Accessibility

- Semantic HTML structure
- ARIA labels for status indicators
- Keyboard navigation support
- High contrast colors for status states

## Browser Console Logging

### Status Changes
```
[{timestamp}] [STATUS-CHANGE] {A|M} indicator for {agent} changed from {old} to {new} (correlationId: {id})
```

### User Actions
```
Starting {operation} operation
Sending {action} command to {agent} (correlationId: {id})
```

### Dialog Events
```
All callbacks received, showing dialog (total: {duration}s)
```

## Implementation Notes

1. All colors use Tailwind CSS color palette
2. Timestamps use ISO format in logs, human-readable in UI
3. All animations should be subtle (no more than 200ms)
4. Maintain UI state in memory, persist to localStorage if needed
5. Error boundaries to prevent UI crashes
6. Console should auto-scroll to bottom on new entries