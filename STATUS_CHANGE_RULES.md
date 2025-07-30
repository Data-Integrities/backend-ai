# Backend AI Status Change Rules

This document defines the exact rules and timing expectations for status changes in the Backend AI system, particularly for operations that involve callbacks.

## Overview

The Backend AI system uses a callback-based architecture where:

1. Commands are sent from the Hub to:
   - Service managers (systemd/rc.d) via SSH for manager control
   - Manager HTTP endpoints for agent control
2. Operations execute on the remote systems
3. Callbacks are sent back to the Hub when operations complete
4. Status updates and UI elements should reflect actual callback receipt, not just command dispatch

## Key Principles

1. **No Artificial Delays**: The system should never use setTimeout or artificial delays. All timing should be based on actual events.
2. **Callback-Based Completion**: Operations are only considered complete when their callback is received.
3. **Accurate Timing Display**: All timing displays should show the actual time until callback receipt, not just API response time.

## Service Manager Differences

### systemd (Linux)
- **Limitation**: systemctl cannot accept command line arguments
- **Solution**: Use environment variables or wrapper scripts
- **Example**: `CORRELATION_ID="cmd_123" systemctl start ai-agent-manager`

### rc.d (Unraid)
- **Capability**: Scripts can accept command line arguments
- **Solution**: Pass correlationId as second argument ($2)
- **Example**: `/etc/rc.d/rc.ai-agent-manager start "cmd_123"`

Both approaches work, but rc.d is more direct while systemd requires workarounds.

## Console Status Updates

### Status States

Commands can have the following states:

- **pending** (blue): Operation in progress
- **success** (green): Callback received confirming completion
- **failed** (red): Error occurred during operation
- **timeout** (orange): No callback received within timeout period
- **timeoutSuccess** (yellow): Timed out but completed after the timeout period (start operations only)
- **manualTermination** (orange): Service killed via fallback kill script (stop operations only)
- **partialSuccess** (yellow): Some children succeeded, some failed (parent commands only)

### Individual Commands

- Set to **pending** immediately when command is sent
- Update to final state only when callback is received or timeout occurs
- Show actual time from command dispatch to callback/timeout
- For stop operations that timeout, attempt force kill and show **manualTermination** if successful

### Parent Commands (e.g., "Stop All Managers")

- Set to **pending** when operation starts
- Update status based on ALL children:
  - **success**: All children succeeded
  - **partialSuccess**: Mix of success/failure (show "3/5 completed")
  - **failed**: All children failed
- Only update after ALL child operations complete (callback or timeout)

## Dialog Display Rules

### Summary Dialogs (Start/Stop All)

1. **When to Show**: Only after ALL callbacks have been received
2. **Total Duration**: Time from operation start until dialog is shown (after last callback)
3. **Individual Durations**: Time from each command dispatch until its callback receipt

### Dialog Content Requirements

- **Header**: "Total time until dialog shown: X.XX seconds"
- **Per-Agent Timing**: Show callback duration next to each agent (→ X.XXs)
- **Status Accuracy**: Status shown must reflect actual callback status, not predicted status

### Partial Success Dialog Example

```
Stop All Managers - Partial Success

Total time until dialog shown: 8.32 seconds

✅ Successful (3):
• nginx - Stopped → 2.4s
• pve1 - Stopped → 3.1s
• pve2 - Stopped → 2.8s

⚠️ Manual Termination (1):
• unraid - Force killed → 8.2s

❌ Failed (1):
• pve3 - Timeout after 30s

Summary: 3 of 5 managers stopped successfully
```

## Start Process

### Overall Summary

The start process follows a callback-based architecture where services announce their readiness:
- Commands are sent via SSH (managers) or HTTP (agents)
- Starting services send their own callbacks when ready to accept commands
- Console and UI updates reflect actual service readiness, not command dispatch

### Manager Start (Details)

1. **Hub UI → Hub WebAPI**: Request to start manager with correlationId
2. **Hub WebAPI → SSH → Worker**: SSH command with correlationId
   - **systemd systems**: Use environment variable (systemctl cannot accept arguments)
     ```bash
     ssh root@worker "CORRELATION_ID='cmd_123' systemctl start ai-agent-manager"
     ```
   - **rc.d systems**: Pass as command line argument ($2)
     ```bash
     ssh root@worker "/etc/rc.d/rc.ai-agent-manager start 'cmd_123'"
     ```
3. **Manager Startup**:
   - Kill any process using its port (3081)
   - Kill any existing manager process
   - Perform startup initialization
   - Start listening on port 3081
4. **Manager → Hub WebAPI**: Sends callback with correlationId when ready
5. **Hub WebAPI Updates**:
   - Mark execution as completed
   - Trigger immediate agent status poll
6. **UI Updates**: Console shows success, agent card shows manager online

### Agent Start (Details)

1. **Hub UI → Hub WebAPI**: Request to start agent
2. **Hub WebAPI → Manager HTTP**: Send start command (fail if manager not running)
3. **Manager → Agent**: Start agent process with correlationId
4. **Agent Startup**:
   - Kill any process using its port (3080)
   - Kill any existing agent process
   - **Read local README files** to learn capabilities
   - Perform startup initialization
   - Start listening on port 3080
5. **Agent → Hub WebAPI**: Sends callback with correlationId when ready
6. **Hub WebAPI Updates**:
   - Mark execution as completed
   - Trigger immediate agent status poll
7. **UI Updates**: Console shows success, agent card shows agent online

## Stop Process

### Overall Summary

The stop process requires monitoring because stopped services cannot report their own death:
- Commands are sent via SSH (managers) or HTTP (agents)
- External monitors (manager or script) detect when service stops
- Callbacks are sent by the monitor, not the stopped service

### Manager Stop (Details)

1. **Hub UI → Hub WebAPI**: Request to stop manager with correlationId
2. **Hub WebAPI → SSH → Worker**: SSH to run stop command
   - **systemd systems**: Use wrapper script (handles monitoring)
     ```bash
     ssh root@worker "/opt/ai-agent/ai-agent-manager-stop.sh 'cmd_123'"
     ```
   - **rc.d systems**: Use wrapper script (handles monitoring)
     ```bash
     ssh root@worker "/opt/ai-agent/rc.d/ai-agent-manager-stop.sh 'cmd_123'"
     ```
3. **Wrapper Script Actions**:
   - Stop manager via systemd/rc.d
   - Start background monitoring script
4. **Background Script**:
   - Poll manager /status endpoint every 2 seconds
   - When manager no longer responds → Send callback to hub
5. **Hub WebAPI Updates**:
   - Mark execution as completed
   - Trigger immediate agent status poll
6. **UI Updates**: Console shows success, agent card shows manager offline

### Agent Stop (Details)

1. **Hub UI → Hub WebAPI**: Request to stop agent
2. **Hub WebAPI → Manager HTTP**: Send stop command (fail if manager not running)
3. **Manager → Agent**: Stop agent process
4. **Manager Monitoring**:
   - Poll agent /status endpoint
   - When agent no longer responds → Send callback to hub
5. **Hub WebAPI Updates**:
   - Mark execution as completed
   - Trigger immediate agent status poll
6. **UI Updates**: Console shows success, agent card shows agent offline

## ALL Commands

### Correlation ID Structure

- **Parent**: Tracks overall operation (e.g., `parent_1234567890`)
- **Children**: Individual operations per worker (e.g., `cmd_nginx_abc123`)
- **Relationship**: Parent completes when all children complete

### Parent-Child Coordination

1. **UI Creates Parent**: Shows in console immediately
2. **WebAPI Creates Children**: One per target worker
3. **Children Execute**: Each follows individual start/stop rules
4. **WebAPI Monitors**: As each child callback received, check siblings
5. **Parent Completion**: When last child completes, webAPI marks parent complete
6. **Dialog Display**: Only after parent marked complete

## Timeout Handling

### Timeout Values

**Start Operations**
- SSH command timeout: 10 seconds
- Callback timeout: 30 seconds
- Timeout result: Mark as **timeout** or **failed**

**Stop Operations**
- SSH command timeout: 10 seconds
- Callback timeout: 30 seconds
- On timeout: Attempt force kill via fallback script
- Force kill timeout: 5 seconds
- Timeout result: **manualTermination** if force kill succeeds, **timeout** if it fails

### Fallback Kill Script

For stop operations that timeout or fail:

1. SSH to worker with kill script: `/opt/ai-agent/kill-service.sh <agent|manager>`
2. Script reads configuration from `/opt/ai-agent/backend-ai-config.json`:
   - Port number from `defaults.{service}.port`
   - Process pattern from `defaults.{service}.processPattern`
3. Kill by port: `lsof -ti:{port} | xargs -r kill -9`
4. Kill by process pattern: `pkill -9 -f "{processPattern}"`
5. Verify process is dead by checking port again
6. Return exit code 0 (success) or 1 (failure)

Result states:
- Success: Mark as **manualTermination**
- Failure: Mark as **failed** with "manual intervention required"

Note: If force kill fails, the operation is marked as **failed** with no retry.

### Late Callbacks (Start Operations Only)

If a start callback arrives after timeout:
- Update status from **timeout** to **timeoutSuccess**
- Log the late arrival time
- Update UI to reflect actual completion

Note: Stop operations don't have late callbacks because timeout triggers the kill script

## Polling Mechanisms

### Execution Polling
- UI polls `/api/executions/{correlationId}` every 500ms
- Updates console entries when status changes
- Stops polling when execution completes or times out

### Agent Status Polling
- UI polls `/api/agents` every 30 seconds
- Updates agent cards (online/offline, versions)
- After callback received: One immediate poll, then resume 30-second schedule

## Timing Examples

### Expected Flow for "Stop All Managers" (5 agents)

```text
T+0.00s: User clicks "Stop All Managers"
T+0.01s: Parent command added to console (pending)
T+0.02s: SSH stop command sent to manager 1
T+0.03s: SSH stop command sent to manager 2
T+0.04s: SSH stop command sent to manager 3
T+0.05s: SSH stop command sent to manager 4
T+0.06s: SSH stop command sent to manager 5
T+0.10s: All SSH commands completed (managers stopping)
T+2.50s: Background script detects manager 1 stopped → Callback sent → Console updated
T+3.20s: Background script detects manager 2 stopped → Callback sent → Console updated
T+4.10s: Background script detects manager 3 stopped → Callback sent → Console updated
T+5.80s: Background script detects manager 4 stopped → Callback sent → Console updated
T+6.30s: Background script detects manager 5 stopped → Callback sent → Console updated
T+6.31s: WebAPI detects all children complete → Parent marked complete
T+6.32s: Dialog shown with "Total time: 6.32 seconds"
T+6.33s: Immediate agent status poll triggered
T+36.33s: Next regular agent status poll
```

## Console Logging Requirements

For debugging and transparency, the console should log:

1. Operation start time
2. Each command dispatch time
3. Each callback receipt time
4. Dialog display time
5. Correlation IDs being tracked

Example console output:

```text
[2024-01-30T10:00:00.000Z] Starting stopAllManagers operation
[2024-01-30T10:00:00.020Z] Sending stop command to nginx (correlationId: cmd_123_abc)
[2024-01-30T10:00:00.030Z] Sending stop command to pve1 (correlationId: cmd_124_def)
[2024-01-30T10:00:02.500Z] Callback received for nginx (2.48s)
[2024-01-30T10:00:03.200Z] Callback received for pve1 (3.17s)
[2024-01-30T10:00:03.210Z] All callbacks received, showing dialog (total: 3.21s)
```

## Implementation Notes

1. Track operation start time when user initiates action
2. Track individual command dispatch times
3. Monitor for callbacks using correlation IDs
4. Calculate durations based on actual callback receipt
5. Only show dialogs after all expected callbacks are received
6. Include comprehensive console logging for debugging