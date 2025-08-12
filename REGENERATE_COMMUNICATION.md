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
- **Parent status remains pending** until ALL children complete
- Parent completion triggers:
  - When all children reach a final state (success, failed, timeout, manualTermination)
  - Parent MUST NOT be marked complete based on HTTP response alone
  - Parent completion happens ONLY via correlation tracker when last child completes
- Final parent status:
  - **success**: All children succeeded
  - **partialSuccess**: Mix of success/failure (show "3/5 completed")
  - **failed**: All children failed

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

### Manager Availability Check

When executing "Stop All Agents" or similar operations:

1. **Manager Status Verification**:
   - Check if manager is online before attempting agent operations
   - Manager is considered online if `managerVersion` exists and is NOT 'unknown' or 'offline'
   - Empty string ('') should be treated as online (legacy compatibility)
   
2. **Skip Logic**:
   - If manager is offline, skip the agent operation
   - Add result to summary as "Manager must be running to control agent"
   - Don't create child operation for agents with offline managers
   
3. **UI Filtering**:
   ```javascript
   // Check manager status
   const managerOnline = managerVersion && 
                        managerVersion !== 'unknown' && 
                        managerVersion !== 'offline';
   ```

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
- UI polls `/api/agents` every 5 seconds (current implementation)
- Updates agent cards (online/offline, versions)
- Regular polling ensures eventual consistency

### Instant Status Updates (Callback-Driven)
- When a callback is received for agent/manager operations:
  - Console status updates immediately (already implemented)
  - **A/M status icons update instantly** without waiting for next poll
  - Implementation: Callback handler directly updates agent status in UI
- Benefits:
  - Immediate visual feedback (no 2-3 second delay)
  - Better user experience
  - Polling still ensures eventual consistency if instant update fails

#### Implementation Details
1. When processing callbacks in `pollExecutionStatus`:
   - Identify the agent from the callback (via agentName or correlationId)
   - Update the agent's status in the DOM or shared data structure
   - For manager operations: Update `managerOnline` status
   - For agent operations: Update `agentOnline` status
2. The status change triggers immediate re-render of A/M indicators
3. Regular 5-second polling continues as fallback/sync mechanism

#### Critical Implementation Requirements
1. **Command String Preservation**: The original command string (e.g., "stop-manager") must be preserved in the command object when stored via `addConsoleCommand`
2. **Command Retrieval**: When execution updates arrive via EventSource or updateCommandStatus is called:
   - Retrieve the command object by correlationId
   - Get the command string from `command.command` (NOT from the execution object)
3. **Manager Detection**: Use the preserved command string to determine if it's a manager operation by checking `commandString.includes('manager')`
4. **DOM Update**: 
   - Find the agent element in the DOM by matching agent name
   - Identify the correct indicator (index 0 for A, index 1 for M)
   - Update the status class based on operation type and result

#### Working Implementation
```javascript
// In updateCommandStatus, after finding the command:
if (execution.status === 'success' || execution.status === 'failed' || 
    execution.status === 'timeout' || execution.status === 'manualTermination') {
    const commandString = command.command || execution.command || '';
    updateAgentStatusInstantly(command.agent, commandString, execution.status);
}

// In updateAgentStatusInstantly:
- Check if it's a manager command: `command.includes('manager')`
- For stop commands: success = offline, failed = online
- For start/restart commands: success = online, failed = offline
- Update the correct indicator's class immediately
```

## Multi-Agent Operation Rules

### Command Dispatch
- Parent operation creates child operations with proper parent-child linking
- Each child operation is tracked independently
- HTTP endpoints return 202 Accepted immediately (not success)
- **Critical**: HTTP response success (200/202) means "command received", NOT "operation complete"
- **Race Condition Prevention**: All child operations must be pre-registered with the parent before any async work begins

### Status Propagation
- Child operations update their own status via callbacks FROM THE WORKER
- **Console updates happen ONLY when worker sends callback**, never from initial HTTP response
- Initial HTTP response only confirms command was sent, not executed
- Parent status is calculated and updated ONLY by correlation tracker
- UI polls parent status - it should remain pending until all children complete

### Parent-Child Registration (Critical)
To prevent race conditions where parent shows "success" before children are tracked:

1. **Pre-register all children** before starting any async operations:
   ```javascript
   // Create parent
   correlationTracker.startExecution(parentId, 'stop-all', 'multi-agent', 'stop-all');
   
   // Pre-register ALL children synchronously
   agents.forEach(agent => {
     const childId = correlationTracker.generateCorrelationId();
     correlationTracker.startExecution(childId, 'stop-agent', agent, 'stop-agent', parentId);
   });
   
   // THEN start async operations
   agents.map(async (agent, index) => { /* ... */ });
   ```

2. **Parent completion check** only runs when:
   - All childIds are registered in parent.childIds array
   - All children have reached a final state (not pending)
   - This prevents premature parent completion

### Async Operation Flow
1. UI sends command → Hub WebAPI → Manager/Agent (HTTP request)
2. HTTP response (202) → Command acknowledged, operation starts
3. Console shows "pending" → Operation is running
4. Worker executes operation → Sends callback when complete
5. Hub receives callback → Updates correlationTracker
6. UI polls status → Sees update → Updates console to success/failed
7. **NEVER**: HTTP response → Console shows success (this is wrong!)

## Agent Stop Callback Rules

### Who Sends Stop Callbacks
- **Agent Stop**: The MANAGER monitors the agent and sends callback when agent is unreachable
- The manager must:
  1. Successfully stop the agent
  2. Poll agent /status endpoint until unreachable
  3. Send callback to hub with correlationId
  4. Include agent name in callback for correlation

### Correlation ID Tracking
- **Hub Responsibility**: Track pending correlation IDs for each agent
- **Storage Method**: Use `httpAgents.setPendingCorrelationId(agentName, correlationId)`
- **Callback Matching**: 
  1. When agent-offline notification received
  2. Check for pending correlation ID: `httpAgents.getPendingCorrelationId(agentName)`
  3. If found, complete the execution with that correlation ID
  4. Clear the pending ID after use
- **Fallback**: If no pending ID found, log warning but don't fail

### Callback Timeout Handling
- If no callback received within 30 seconds:
  - Mark operation as **timeout**
  - Log which component failed to send callback
  - Parent operation should still complete with partial information
  - Check logs for missed callbacks or correlation ID mismatches

## Console Display Rules

### Pending Status Visibility
- Commands showing "pending" for extended periods should include:
  - Elapsed time indicator (e.g., "pending (45s)")
  - After timeout period, automatically transition to "timeout" status
  - Parent should show count of pending children (e.g., "pending - 5 children waiting")

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

## Callback JSON Structure Standards

### Agent/Manager Status Callbacks

When an agent or manager sends a callback to report its status, it must use this structure:

```json
{
    "agentId": "agent-name",      // Required: The agent's identifier
    "agentName": "agent-name",    // Required: Human-readable agent name
    "status": "online|offline",    // Required: Current status
    "version": "1.0.0",           // Optional: Software version
    "detectedBy": "string"        // Optional: Who detected the status change
}
```

### Operation Completion Callbacks

When operations complete (start/stop), the callback must include:

```json
{
    "result": "Operation completed successfully",  // Required: Human-readable result
    "agentId": "agent-name",                      // Required: The agent's identifier
    "agentName": "agent-name",                    // Required: Human-readable agent name
    "detectedBy": "manager|script|self",          // Optional: Who detected completion
    "error": "Error message if failed"            // Optional: Error details if failed
}
```

### Hub Callback Endpoints

The hub expects callbacks at these endpoints:

1. **Operation Completion**: `POST /api/executions/{correlationId}/complete`
   - Body should be the JSON structure above (NOT wrapped in a "result" field)
   - Hub will extract agentId/agentName from root level of JSON

2. **Operation Failure**: `POST /api/executions/{correlationId}/fail`

## Version Persistence and Polling

### Version Storage in Configuration

**Configuration Enhancement**:
Each agent in `backend-ai-config.json` includes:
- `lastKnownAgentVersion`: The last successfully retrieved agent version
- `lastKnownManagerVersion`: The last successfully retrieved manager version

**Deployment Updates**:
- `deploy-everything.sh` sets these fields after successful deployment
- Initial values match the deployed version (e.g., "2.1.103")

### Hub Polling and Version Updates

**On Startup**:
1. Load configuration including `lastKnownAgentVersion` and `lastKnownManagerVersion`
2. Display these versions in agent cards regardless of online/offline status

**During Polling** (every 30 seconds):
1. Poll agent status endpoint: `GET http://{agent-ip}:3080/status`
2. Poll manager status endpoint: `GET http://{agent-ip}:3081/status`
3. Compare returned versions with in-memory versions
4. If version differs:
   - Update UI immediately
   - Write new version to `backend-ai-config.json`
   - Update `lastKnownAgentVersion` or `lastKnownManagerVersion`

**Offline Behavior**:
- When agent/manager is offline, display last known version
- Never show "unknown" for version if a last known version exists
- Only show "unknown" if no version has ever been retrieved

**Configuration Write-back**:
When hub detects a version change, it updates the configuration file:
```javascript
// Pseudo-code for version update
if (polledVersion !== agent.lastKnownAgentVersion) {
    agent.lastKnownAgentVersion = polledVersion;
    writeConfigFile(config); // Persist to backend-ai-config.json
}
```

## Error Handling and User Feedback

### Manager Offline Error Dialog

**When Displayed**:
- User attempts to start/stop an agent
- Manager service is not running on that worker
- Hub detects this through:
  - Manager status is "offline" in agent data
  - API returns ECONNREFUSED error
  - Manager version is "unknown" or "offline"

**Trigger Flow**:
1. User clicks start/stop agent button
2. Hub checks manager status for that agent
3. If manager offline, show error dialog immediately
4. If manager online, send command to agent
5. If command fails with ECONNREFUSED, show error dialog

**Dialog Purpose**:
- Prevent confusing failed operations
- Guide user to start manager first
- Provide clear feedback about system state

**API Response Handling**:
```javascript
// If error.code === 'ECONNREFUSED' && operation involves agent control
// Show manager offline error dialog
```
   - Body should include error details

### Important Notes

1. **Field Location**: The hub looks for `agentId` and `agentName` at the **root level** of the JSON body, not nested inside other fields
2. **Both Fields Preferred**: While either `agentId` or `agentName` will work, sending both ensures maximum compatibility
3. **Consistent Naming**: The agent name used in callbacks must match the agent name used in the original command

### Example Implementation

**Manager Stop Script Callback (Correct)**:
```bash
PAYLOAD=$(cat <<EOF
{
    "result": "Manager stopped successfully on ${AGENT_NAME}",
    "agentId": "${AGENT_NAME}",
    "agentName": "${AGENT_NAME}",
    "detectedBy": "manager-stop-monitor"
}
EOF
)

curl -X POST \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "${HUB_URL}/api/executions/${CORRELATION_ID}/complete"
```

**Hub Processing (Correct)**:
```javascript
app.post('/api/executions/:correlationId/complete', (req, res) => {
    const { correlationId } = req.params;
    // Extract fields directly from req.body
    const agentInfo = req.body.agentId || req.body.agentName || 'unknown';
    const result = req.body.result || req.body;
    
    // Log callback details
    correlationTracker.addLog(correlationId, 
        `[CALLBACK] Completion callback received from ${agentInfo}`);
    
    // Complete the execution
    correlationTracker.completeExecution(correlationId, result);
});
```

## Logging Responsibilities

### Hub WebAPI Logging

The Hub WebAPI is responsible for logging:

1. **Command Receipt**:
   ```
   [HUB] Received {action} command for {agentName} [correlationId]
   ```

2. **Command Execution**:
   ```
   [HUB] Executing {action} for {agentName} [correlationId]: {command}
   ```

3. **SSH/HTTP Communication**:
   ```
   [HUB] SSH command: {full command}
   [HUB] HTTP request to {url}
   ```

4. **Callback Receipt**:
   ```
   [CALLBACK] Completion callback received from {agentName} (IP: {ip})
   [CALLBACK] Result: {result}
   [CALLBACK] Total duration: {duration}ms ({seconds}s)
   [WARNING] Callback missing agent identification (if applicable)
   ```

5. **Execution Tracking**:
   ```
   [TRACKER] Execution started for agent: {agentName}
   [TRACKER] Command: {command}
   [TRACKER] Status will be updated to: {status}
   [TRACKER] Execution completed for agent: {agentName}
   ```

6. **Timeout Events**:
   ```
   [TIMEOUT] No callback received for {correlationId} after {timeout}s
   [FORCE-KILL] Attempting to force kill {service} on {agent}
   ```

### Agent Logging

Agents are responsible for logging:

1. **Startup**:
   ```
   [AGENT] Starting on port {port}
   [AGENT] Loaded capabilities from README files
   [AGENT] Sending startup callback with correlationId: {id}
   ```

2. **Command Receipt**:
   ```
   [AGENT] Received command: {command} from {source}
   [AGENT] Executing: {command}
   ```

3. **Command Completion**:
   ```
   [AGENT] Command completed: {result}
   [AGENT] Sending callback to hub
   ```

### Manager Logging

Managers are responsible for logging:

1. **Startup**:
   ```
   [MANAGER] Starting on port {port}
   [MANAGER] Sending startup callback with correlationId: {id}
   ```

2. **Agent Control**:
   ```
   [MANAGER] Starting agent with correlationId: {id}
   [MANAGER] Stopping agent
   [MANAGER] Monitoring agent shutdown
   [MANAGER] Agent no longer responding, sending callback
   ```

3. **Health Checks**:
   ```
   [MANAGER] Agent health check: {status}
   ```

### Service Scripts Logging

Start/Stop scripts are responsible for logging:

1. **Script Start**:
   ```
   [date] Starting {service} {action} process with correlationId: {id}
   [date] AGENT_NAME environment variable: '{name}'
   ```

2. **Service Control**:
   ```
   [date] Starting/Stopping {service} service...
   [date] Service {action} initiated
   ```

3. **Background Monitoring** (stop scripts):
   ```
   [date] Starting background monitor for {service} shutdown
   [date] {Service} still responding, waiting... (attempt X/Y)
   [date] {Service} has stopped responding
   ```

4. **Callback Operations**:
   ```
   [date] Sending completion callback to hub...
   [date] Successfully notified hub of {action} completion
   [date] Failed to notify hub of {action} completion
   ```

### Frontend UI Logging

The browser console should log:

1. **User Actions**:
   ```
   Starting {operation} operation
   Sending {action} command to {agent} (correlationId: {id})
   ```

2. **Status Updates**:
   ```
   [STATUS-CHANGE] {A|M} indicator for {agent} changed from {old} to {new} (correlationId: {id})
   ```

3. **Polling Results**:
   ```
   Execution update for {correlationId}: {status}
   Agent status poll completed
   ```

4. **Dialog Events**:
   ```
   All callbacks received, showing dialog (total: {duration}s)
   ```

### Log Correlation

All log entries related to a specific operation should include the correlationId to enable tracking across components:

```
[2024-01-30T10:00:00.000Z] [HUB] Executing stop-manager for pve1 [cmd_123_abc]
[2024-01-30T10:00:00.100Z] [SCRIPT] Starting manager stop process with correlationId: cmd_123_abc
[2024-01-30T10:00:02.500Z] [SCRIPT] Manager has stopped responding
[2024-01-30T10:00:02.550Z] [HUB] [CALLBACK] Completion callback received from pve1 [cmd_123_abc]
```

## Implementation Notes

1. Track operation start time when user initiates action
2. Track individual command dispatch times
3. Monitor for callbacks using correlation IDs
4. Calculate durations based on actual callback receipt
5. Only show dialogs after all expected callbacks are received
6. Include comprehensive console logging for debugging
7. Ensure all callbacks follow the JSON structure standards above
8. Follow the logging responsibilities defined for each component