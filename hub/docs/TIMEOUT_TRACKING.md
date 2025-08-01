# Timeout Tracking Implementation

This document describes the timeout tracking feature implemented in the correlation tracker.

## Overview

The correlation tracker now automatically marks executions as timed out after a configurable timeout period:
- **Default timeout**: 60 seconds for regular commands
- **Manager timeout**: 30 seconds for start/stop/restart manager operations

## Key Features

### 1. Automatic Timeout Detection
- When an execution starts, a timeout timer is set based on the operation type
- If the execution doesn't complete within the timeout period, it's automatically marked as `timeout`
- Timeout events emit an `execution-timeout` event for monitoring

### 2. Operation Type Detection
The system determines timeout duration based on:
- The `type` parameter passed to `startExecution()`
- Command name containing "manager"
- Specific types: `start-manager`, `stop-manager`, `restart-manager`

### 3. Late Callback Support
If a callback arrives after timeout:
- Status changes from `timeout` to `timeoutSuccess`
- The `timedOut` flag is set to `true` on the execution
- Logs indicate the late callback was received

### 4. Status Values
- `pending`: Execution is in progress
- `success`: Execution completed successfully within timeout
- `failed`: Execution failed (error occurred)
- `timeout`: Execution timed out without response
- `timeoutSuccess`: Execution completed successfully after timeout

## API Changes

### Updated startExecution Method
```typescript
startExecution(correlationId: string, command: string, agent: string, type?: string): void
```
- New optional `type` parameter to specify operation type

### New Method: timeoutExecution
```typescript
timeoutExecution(correlationId: string, message: string): void
```
- Internal method that handles timeout logic
- Sets status to `timeout` and records error message

### New Method: getTimeoutConfig
```typescript
getTimeoutConfig(): { defaultTimeout: number; managerTimeout: number }
```
- Returns current timeout configuration in milliseconds

### New Endpoint: GET /api/executions/config/timeouts
Returns timeout configuration:
```json
{
  "defaultTimeoutMs": 60000,
  "managerTimeoutMs": 30000,
  "defaultTimeoutSeconds": 60,
  "managerTimeoutSeconds": 30
}
```

## Implementation Details

### Timeout Timer Management
- Timers are stored in a Map keyed by correlationId
- Timers are cleared when execution completes, fails, or times out
- Cleanup process also clears orphaned timers

### Event Flow
1. `startExecution()` creates timer based on operation type
2. If timer expires, `timeoutExecution()` is called
3. `execution-timeout` event is emitted
4. If late callback arrives, `completeExecution()` changes status to `timeoutSuccess`

### Logging
Timeout events are logged with:
- `[TIMEOUT]` prefix in execution logs
- Duration in both milliseconds and seconds
- `[LATE-CALLBACK]` prefix for callbacks after timeout

## Usage Example

```typescript
// Start a manager operation with 30s timeout
correlationTracker.startExecution(correlationId, 'start-manager', 'nginx', 'start-manager');

// Listen for timeout events
correlationTracker.on('execution-timeout', (execution) => {
  console.log(`Execution ${execution.correlationId} timed out`);
});

// Check if execution timed out
const execution = correlationTracker.getExecution(correlationId);
if (execution.status === 'timeout' || execution.timedOut) {
  // Handle timeout case
}
```

## Monitoring

To monitor timeouts:
1. Subscribe to SSE stream at `/api/executions/stream`
2. Watch for executions with status `timeout` or `timeoutSuccess`
3. Check the `timedOut` flag for executions that completed late
4. Use execution logs to see detailed timeout information

## Future Enhancements

Possible future improvements:
- Configurable timeout values per agent or command type
- Timeout escalation (e.g., retry with longer timeout)
- Metrics collection for timeout rates
- Webhook notifications for timeout events