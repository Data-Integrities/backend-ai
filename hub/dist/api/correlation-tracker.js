"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.correlationTracker = exports.CorrelationTracker = void 0;
const events_1 = require("events");
class CorrelationTracker extends events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this.executions = new Map();
        this.DEFAULT_TIMEOUT_MS = 30000; // 30 seconds for all operations per STATUS_CHANGE_RULES
        this.MANAGER_TIMEOUT_MS = 30000; // 30 seconds for all operations
        this.timeouts = new Map();
    }
    generateCorrelationId() {
        return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    startExecution(correlationId, command, agent, type, parentId) {
        const execution = {
            correlationId,
            command,
            agent,
            startTime: Date.now(),
            status: 'pending',
            type,
            logs: [],
            parentId
        };
        this.executions.set(correlationId, execution);
        // If this is a child operation, add it to parent's childIds
        if (parentId) {
            const parentExecution = this.executions.get(parentId);
            if (parentExecution) {
                if (!parentExecution.childIds) {
                    parentExecution.childIds = [];
                }
                parentExecution.childIds.push(correlationId);
                this.addLog(parentId, `[PARENT] Added child operation: ${correlationId} for ${agent}`);
            }
        }
        // Add initial log entry with appropriate action label
        const actionLabel = command.toLowerCase().includes('stop') ? '[STOP]' : '[START]';
        this.addLog(correlationId, `${actionLabel} Execution started: ${command} on ${agent}`);
        this.addLog(correlationId, `${actionLabel} CorrelationId: ${correlationId}`);
        // Determine timeout duration based on operation type
        const isManagerOperation = type && (type === 'start-manager' ||
            type === 'stop-manager' ||
            type === 'restart-manager' ||
            command.toLowerCase().includes('manager'));
        const timeoutMs = isManagerOperation ? this.MANAGER_TIMEOUT_MS : this.DEFAULT_TIMEOUT_MS;
        const timeoutSeconds = timeoutMs / 1000;
        // Set timeout for this execution
        const timeout = setTimeout(() => {
            this.timeoutExecution(correlationId, `Command timed out after ${timeoutSeconds} seconds`);
        }, timeoutMs);
        this.timeouts.set(correlationId, timeout);
        console.log(`[TRACKER] Started execution ${correlationId}: ${command} on ${agent} (timeout: ${timeoutSeconds}s)`);
        // Add detailed logging for debugging
        this.addLog(correlationId, `[DEBUG] Agent name: ${agent}`);
        this.addLog(correlationId, `[DEBUG] Command: ${command}`);
        this.addLog(correlationId, `[DEBUG] Type: ${type || 'not specified'}`);
        this.addLog(correlationId, `[DEBUG] Parent ID: ${parentId || 'none'}`);
        this.addLog(correlationId, `[DEBUG] Timeout: ${timeoutSeconds}s`);
        // Emit event for SSE
        this.emit('executionUpdate', execution);
    }
    completeExecution(correlationId, result) {
        const execution = this.executions.get(correlationId);
        if (!execution) {
            console.warn(`[TRACKER] Unknown correlationId: ${correlationId}`);
            return;
        }
        // Clear timeout
        const timeout = this.timeouts.get(correlationId);
        if (timeout) {
            clearTimeout(timeout);
            this.timeouts.delete(correlationId);
        }
        // If execution had timed out, change status to timeoutSuccess (start operations only)
        if (execution.status === 'timeout' && execution.command && execution.command.includes('start')) {
            execution.status = 'timeoutSuccess';
            execution.timedOut = true;
            this.addLog(correlationId, '[LATE-CALLBACK] Received successful completion after timeout');
        }
        else if (execution.status === 'timeout') {
            // For stop operations, timeout status remains - no late callbacks expected
            this.addLog(correlationId, '[LATE-CALLBACK] Ignoring late callback for stop operation after timeout');
            return;
        }
        else {
            execution.status = 'success';
        }
        execution.endTime = Date.now();
        execution.callbackTime = Date.now(); // Record when callback was received
        execution.result = result;
        const duration = execution.endTime - execution.startTime;
        console.log(`[TRACKER] Completed execution ${correlationId} for ${execution.agent} in ${duration}ms${execution.timedOut ? ' (after timeout)' : ''}`);
        // Log the agent name being used for instant status update
        this.addLog(correlationId, `[TRACKER] Execution completed for agent: ${execution.agent}`);
        this.addLog(correlationId, `[TRACKER] Command: ${execution.command}`);
        this.addLog(correlationId, `[TRACKER] Status will be updated to: ${execution.status}`);
        this.emit('execution-complete', execution);
        this.emit('executionUpdate', execution);
        // If this was a manager operation, trigger immediate status check
        if (execution.command && (execution.command.includes('manager') ||
            execution.type === 'start-manager' || execution.type === 'stop-manager' ||
            execution.type === 'restart-manager')) {
            this.emit('manager-operation-complete', execution);
        }
        // Check if this is a child operation and update parent if needed
        if (execution.parentId) {
            this.checkAndUpdateParentStatus(execution.parentId);
        }
    }
    failExecution(correlationId, error) {
        const execution = this.executions.get(correlationId);
        if (!execution) {
            console.warn(`[TRACKER] Unknown correlationId: ${correlationId}`);
            return;
        }
        // Clear timeout
        const timeout = this.timeouts.get(correlationId);
        if (timeout) {
            clearTimeout(timeout);
            this.timeouts.delete(correlationId);
        }
        // Don't override timeout status if already set
        if (execution.status === 'timeout') {
            return;
        }
        execution.status = 'failed';
        execution.endTime = Date.now();
        execution.error = error;
        const duration = execution.endTime - execution.startTime;
        console.log(`[TRACKER] Failed execution ${correlationId} after ${duration}ms: ${error}`);
        this.emit('execution-failed', execution);
        this.emit('executionUpdate', execution);
        // Check if this is a child operation and update parent if needed
        if (execution.parentId) {
            this.checkAndUpdateParentStatus(execution.parentId);
        }
    }
    timeoutExecution(correlationId, message) {
        const execution = this.executions.get(correlationId);
        if (!execution) {
            console.warn(`[TRACKER] Unknown correlationId: ${correlationId}`);
            return;
        }
        // Clear timeout reference
        this.timeouts.delete(correlationId);
        execution.status = 'timeout';
        execution.endTime = Date.now();
        execution.error = message;
        const duration = execution.endTime - execution.startTime;
        const timeoutSeconds = duration / 1000;
        this.addLog(correlationId, `[TIMEOUT] Execution timed out after ${timeoutSeconds.toFixed(1)} seconds`);
        console.log(`[TRACKER] Timeout execution ${correlationId} after ${duration}ms`);
        this.emit('execution-timeout', execution);
        this.emit('executionUpdate', execution);
        // Check if this is a child operation and update parent if needed
        if (execution.parentId) {
            this.checkAndUpdateParentStatus(execution.parentId);
        }
    }
    addLog(correlationId, log) {
        const execution = this.executions.get(correlationId);
        if (!execution) {
            return;
        }
        if (!execution.logs) {
            execution.logs = [];
        }
        execution.logs.push(`[${new Date().toISOString()}] ${log}`);
    }
    recordPollingDetection(correlationId) {
        const execution = this.executions.get(correlationId);
        if (!execution || execution.pollingDetectedTime) {
            return; // Already recorded or execution not found
        }
        execution.pollingDetectedTime = Date.now();
        const timeSinceStart = execution.pollingDetectedTime - execution.startTime;
        const timeSinceCallback = execution.callbackTime ?
            execution.pollingDetectedTime - execution.callbackTime : null;
        // Add log entry for polling detection
        this.addLog(correlationId, `[POLLING] Status change detected by polling after ${(timeSinceStart / 1000).toFixed(1)}s from start`);
        if (timeSinceCallback) {
            this.addLog(correlationId, `[POLLING] Polling detected change ${(timeSinceCallback / 1000).toFixed(1)}s after callback`);
        }
        console.log(`[TRACKER] Polling detected ${correlationId} after ${timeSinceStart}ms from start` +
            (timeSinceCallback ? ` (${timeSinceCallback}ms after callback)` : ''));
        this.emit('executionUpdate', execution);
    }
    getExecution(correlationId) {
        return this.executions.get(correlationId);
    }
    getAllExecutions() {
        return Array.from(this.executions.values());
    }
    // Clean up old executions (keep last 1000)
    cleanup() {
        if (this.executions.size > 1000) {
            const sorted = Array.from(this.executions.entries())
                .sort((a, b) => a[1].startTime - b[1].startTime);
            const toRemove = sorted.slice(0, sorted.length - 1000);
            toRemove.forEach(([id]) => {
                this.executions.delete(id);
                const timeout = this.timeouts.get(id);
                if (timeout) {
                    clearTimeout(timeout);
                    this.timeouts.delete(id);
                }
            });
        }
    }
    // Get timeout configuration
    getTimeoutConfig() {
        return {
            defaultTimeout: this.DEFAULT_TIMEOUT_MS,
            managerTimeout: this.MANAGER_TIMEOUT_MS
        };
    }
    // Check all children of a parent and update parent status accordingly
    checkAndUpdateParentStatus(parentId) {
        const parentExecution = this.executions.get(parentId);
        if (!parentExecution || !parentExecution.childIds || parentExecution.childIds.length === 0) {
            return;
        }
        // Don't update if parent is already complete
        if (parentExecution.status !== 'pending' && parentExecution.status !== 'timeout') {
            return;
        }
        // Get all child executions
        const childExecutions = parentExecution.childIds
            .map(childId => this.executions.get(childId))
            .filter(child => child !== undefined);
        // Count child statuses
        const childStatuses = {
            pending: 0,
            success: 0,
            failed: 0,
            timeout: 0,
            timeoutSuccess: 0,
            partialSuccess: 0,
            manualTermination: 0
        };
        childExecutions.forEach(child => {
            childStatuses[child.status]++;
        });
        const totalChildren = childExecutions.length;
        const completedChildren = totalChildren - childStatuses.pending;
        // Log progress
        this.addLog(parentId, `[PARENT] Child progress: ${completedChildren}/${totalChildren} completed`);
        this.addLog(parentId, `[PARENT] Status breakdown: ${childStatuses.success} success, ${childStatuses.failed} failed, ${childStatuses.timeout} timeout`);
        // If any children are still pending, don't update parent
        if (childStatuses.pending > 0) {
            return;
        }
        // All children are complete, determine parent status
        let parentStatus = 'success';
        let parentResult = {};
        if (childStatuses.failed === totalChildren) {
            // All children failed
            parentStatus = 'failed';
            parentResult.message = 'All child operations failed';
        }
        else if (childStatuses.success === totalChildren) {
            // All children succeeded
            parentStatus = 'success';
            parentResult.message = 'All child operations completed successfully';
        }
        else {
            // Mix of success and failure
            parentStatus = 'partialSuccess';
            parentResult.message = `Partial success: ${childStatuses.success} succeeded, ${childStatuses.failed} failed`;
        }
        // Include child results summary
        parentResult.childResults = {
            total: totalChildren,
            success: childStatuses.success,
            failed: childStatuses.failed,
            timeout: childStatuses.timeout,
            timeoutSuccess: childStatuses.timeoutSuccess
        };
        // Clear parent timeout if it exists
        const parentTimeout = this.timeouts.get(parentId);
        if (parentTimeout) {
            clearTimeout(parentTimeout);
            this.timeouts.delete(parentId);
        }
        // Update parent execution
        parentExecution.status = parentStatus;
        parentExecution.endTime = Date.now();
        parentExecution.result = parentResult;
        const duration = parentExecution.endTime - parentExecution.startTime;
        this.addLog(parentId, `[PARENT] Operation completed with status: ${parentStatus} after ${duration}ms`);
        console.log(`[TRACKER] Parent ${parentId} completed with status: ${parentStatus} after ${duration}ms`);
        // Emit updates
        this.emit('execution-complete', parentExecution);
        this.emit('executionUpdate', parentExecution);
    }
}
exports.CorrelationTracker = CorrelationTracker;
// Singleton instance
exports.correlationTracker = new CorrelationTracker();
//# sourceMappingURL=correlation-tracker.js.map