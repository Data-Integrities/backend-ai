# Parent-Child Callback Monitoring

## Overview

The Backend AI Hub now supports automatic parent-child command monitoring. When executing multi-agent operations (like "start all" or "stop all"), the system automatically tracks parent-child relationships and updates the parent status based on child completions.

## How It Works

1. **Parent Operation Created**: When a multi-agent command is initiated, a parent execution is created with a unique correlationId
2. **Child Operations Spawned**: Each agent operation gets its own child correlationId with a reference to the parent
3. **Automatic Status Updates**: As each child completes (success, failure, or timeout), the system checks if all children are complete
4. **Parent Completion**: When all children finish, the parent is automatically marked as:
   - `success` - All children succeeded
   - `failed` - All children failed
   - `partialSuccess` - Mix of success and failure

## API Endpoints

### Multi-Agent Start
```bash
POST /api/agents/multi/start
{
  "agents": ["nginx", "pve1", "pve2"],
  "parentCorrelationId": "start-all_1234567890_abc123"
}
```

### Multi-Agent Stop
```bash
POST /api/agents/multi/stop
{
  "agents": ["nginx", "pve1", "pve2"],
  "parentCorrelationId": "stop-all_1234567890_def456"
}
```

## Execution Tracking

The correlation tracker maintains parent-child relationships:

```typescript
interface CommandExecution {
  correlationId: string;
  parentId?: string;      // Reference to parent operation
  childIds?: string[];    // Array of child operation IDs
  status: 'pending' | 'success' | 'failed' | 'timeout' | 'partialSuccess';
  // ... other fields
}
```

## GUI Integration

The web GUI automatically:
- Uses the multi-agent endpoints for "Start All" and "Stop All" operations
- Displays parent-child relationships in the console
- Shows real-time status updates via SSE (Server-Sent Events)
- Updates parent status automatically when all children complete

## Testing

Use the provided test script to verify parent-child monitoring:

```bash
./test-parent-child.sh
```

This script:
1. Creates a parent operation
2. Sends a multi-agent command
3. Monitors the parent status until completion
4. Displays the final results including child operation summary

## Benefits

- **No Manual Tracking**: Parent operations complete automatically
- **Accurate Status**: Parent status reflects actual child outcomes
- **Better UX**: Users see when bulk operations truly finish
- **Cleaner Code**: No need for client-side result aggregation