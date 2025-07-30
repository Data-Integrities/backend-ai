import { EventEmitter } from 'events';

export interface CommandExecution {
  correlationId: string;
  command: string;
  agent: string;
  startTime: number;
  status: 'pending' | 'success' | 'failed' | 'timeout';
  type?: string;  // Type of operation (e.g., 'start-manager', 'stop-manager')
  endTime?: number;
  callbackTime?: number;  // When agent/manager reported completion
  pollingDetectedTime?: number;  // When polling first noticed the change
  result?: any;
  error?: string;
  logs?: string[];
}

export class CorrelationTracker extends EventEmitter {
  private executions: Map<string, CommandExecution> = new Map();
  private readonly TIMEOUT_MS = 60000; // 60 seconds
  private timeouts: Map<string, NodeJS.Timeout> = new Map();

  generateCorrelationId(): string {
    return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  startExecution(correlationId: string, command: string, agent: string): void {
    const execution: CommandExecution = {
      correlationId,
      command,
      agent,
      startTime: Date.now(),
      status: 'pending',
      logs: []
    };

    this.executions.set(correlationId, execution);
    
    // Add initial log entry with appropriate action label
    const actionLabel = command.toLowerCase().includes('stop') ? '[STOP]' : '[START]';
    this.addLog(correlationId, `${actionLabel} Execution started: ${command} on ${agent}`);
    this.addLog(correlationId, `${actionLabel} CorrelationId: ${correlationId}`);
    
    // Set timeout for this execution
    const timeout = setTimeout(() => {
      this.addLog(correlationId, '[TIMEOUT] Execution timed out after 60 seconds');
      this.failExecution(correlationId, 'Command timed out after 60 seconds');
    }, this.TIMEOUT_MS);
    
    this.timeouts.set(correlationId, timeout);
    
    console.log(`[TRACKER] Started execution ${correlationId}: ${command} on ${agent}`);
    
    // Emit event for SSE
    this.emit('executionUpdate', execution);
  }

  completeExecution(correlationId: string, result: any): void {
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

    execution.status = 'success';
    execution.endTime = Date.now();
    execution.callbackTime = Date.now(); // Record when callback was received
    execution.result = result;
    
    const duration = execution.endTime - execution.startTime;
    console.log(`[TRACKER] Completed execution ${correlationId} in ${duration}ms`);
    
    this.emit('execution-complete', execution);
    this.emit('executionUpdate', execution);
    
    // If this was a manager operation, trigger immediate status check
    if (execution.command && (execution.command.includes('manager') || 
        execution.type === 'start-manager' || execution.type === 'stop-manager' || 
        execution.type === 'restart-manager')) {
      this.emit('manager-operation-complete', execution);
    }
  }

  failExecution(correlationId: string, error: string): void {
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

    execution.status = 'failed';
    execution.endTime = Date.now();
    execution.error = error;
    
    const duration = execution.endTime - execution.startTime;
    console.log(`[TRACKER] Failed execution ${correlationId} after ${duration}ms: ${error}`);
    
    this.emit('execution-failed', execution);
    this.emit('executionUpdate', execution);
  }

  addLog(correlationId: string, log: string): void {
    const execution = this.executions.get(correlationId);
    if (!execution) {
      return;
    }

    if (!execution.logs) {
      execution.logs = [];
    }
    execution.logs.push(`[${new Date().toISOString()}] ${log}`);
  }

  recordPollingDetection(correlationId: string): void {
    const execution = this.executions.get(correlationId);
    if (!execution || execution.pollingDetectedTime) {
      return; // Already recorded or execution not found
    }

    execution.pollingDetectedTime = Date.now();
    const timeSinceStart = execution.pollingDetectedTime - execution.startTime;
    const timeSinceCallback = execution.callbackTime ? 
      execution.pollingDetectedTime - execution.callbackTime : null;
    
    // Add log entry for polling detection
    this.addLog(correlationId, `[POLLING] Status change detected by polling after ${(timeSinceStart/1000).toFixed(1)}s from start`);
    if (timeSinceCallback) {
      this.addLog(correlationId, `[POLLING] Polling detected change ${(timeSinceCallback/1000).toFixed(1)}s after callback`);
    }
    
    console.log(`[TRACKER] Polling detected ${correlationId} after ${timeSinceStart}ms from start` +
      (timeSinceCallback ? ` (${timeSinceCallback}ms after callback)` : ''));
    
    this.emit('executionUpdate', execution);
  }

  getExecution(correlationId: string): CommandExecution | undefined {
    return this.executions.get(correlationId);
  }

  getAllExecutions(): CommandExecution[] {
    return Array.from(this.executions.values());
  }

  // Clean up old executions (keep last 1000)
  cleanup(): void {
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
}

// Singleton instance
export const correlationTracker = new CorrelationTracker();