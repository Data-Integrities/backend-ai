# Current Work Session - Backend AI

## Date: July 29, 2025

## Issue: Agent Start/Stop Correlation Tracking

### Problem Description
The correlation tracking mechanism for agent start/stop operations was timing out after 60 seconds, even though the operations were completing successfully. The hub's polling was detecting the agent status changes, but the console wasn't receiving completion notifications.

### Root Cause Analysis

1. **File-based correlation passing was problematic**
   - Manager wrote correlationId to `.correlationId` file
   - Agent read and immediately deleted the file
   - Potential race conditions and complexity

2. **Missing completion calls in hub polling**
   - When polling detected agent online (start): Only recorded detection, didn't complete execution
   - When polling detected agent offline (stop): Only recorded detection, didn't complete execution

### Solution Implemented

#### 1. Command-Line Parameter Approach (v2.1.47)
Replaced file-based correlation with command-line parameters:
- **rc.d systems**: `/etc/rc.d/rc.ai-agent start correlationId`
- **systemd systems**: Pass via wrapper script using environment variable
- Agent reads from `process.argv[2]`

#### 2. Dual-Memory Correlation Tracking
Agent maintains two copies of correlationId:
- **Callback memory**: For immediate callback to hub (cleared on success)
- **Polling memory**: For status endpoint responses (cleared after hub acknowledges)

#### 3. Hub Polling Completion (v2.1.48)
Added missing `completeExecution` calls:
```javascript
// When agent comes online with correlationId
correlationTracker.completeExecution(correlationId, {
  result: 'Agent started successfully (detected by polling)',
  agentId: agent.name,
  detectedBy: 'polling'
});

// When agent goes offline with correlationId
correlationTracker.completeExecution(correlationId, {
  result: 'Agent stopped successfully (detected by polling)',
  agentId: agent.name,
  detectedBy: 'polling'
});
```

### Current Status

- **Start Command**: ✅ FIXED - Completes in ~0.3 seconds (was timing out at 60s)
- **Stop Command**: 🔧 FIXED - Ready for testing (was timing out at 60s)
- **Deployment**: v2.1.48 deployed to all systems

### Testing Needed

1. Test stop command correlation completion
2. Verify both systemd and rc.d systems work correctly
3. Test rapid start/stop sequences
4. Test concurrent operations on multiple agents

### Architecture Notes

The correlation flow now works as follows:

1. **Hub → Manager**: Send command with correlationId
2. **Manager → Agent**: Pass correlationId as command-line argument
3. **Agent → Hub**: Try immediate callback (fast path)
4. **Hub Polling**: Detect status change and complete correlation (fallback path)

This dual-path approach ensures correlation completion even if:
- Agent can't reach hub for callback (network issues)
- Agent is stopping and can't send callback
- Timing issues prevent immediate detection

### Related Documentation

- This issue highlighted the importance of automatic README reading
- Led to implementing recursive documentation reading in CLAUDE.md
- Each project now has instructions to read all .md files on startup
- Documentation hierarchy pattern: summaries in parent folders, details in child folders