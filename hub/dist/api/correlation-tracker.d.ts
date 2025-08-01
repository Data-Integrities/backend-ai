import { EventEmitter } from 'events';
export interface CommandExecution {
    correlationId: string;
    command: string;
    agent: string;
    startTime: number;
    status: 'pending' | 'success' | 'failed' | 'timeout' | 'timeoutSuccess' | 'partialSuccess' | 'manualTermination';
    type?: string;
    endTime?: number;
    callbackTime?: number;
    pollingDetectedTime?: number;
    result?: any;
    error?: string;
    logs?: string[];
    timedOut?: boolean;
    parentId?: string;
    childIds?: string[];
}
export declare class CorrelationTracker extends EventEmitter {
    private executions;
    private readonly DEFAULT_TIMEOUT_MS;
    private readonly MANAGER_TIMEOUT_MS;
    private timeouts;
    generateCorrelationId(): string;
    startExecution(correlationId: string, command: string, agent: string, type?: string, parentId?: string): void;
    completeExecution(correlationId: string, result: any): void;
    failExecution(correlationId: string, error: string): void;
    timeoutExecution(correlationId: string, message: string): void;
    addLog(correlationId: string, log: string): void;
    recordPollingDetection(correlationId: string): void;
    getExecution(correlationId: string): CommandExecution | undefined;
    getAllExecutions(): CommandExecution[];
    cleanup(): void;
    getTimeoutConfig(): {
        defaultTimeout: number;
        managerTimeout: number;
    };
    private checkAndUpdateParentStatus;
}
export declare const correlationTracker: CorrelationTracker;
//# sourceMappingURL=correlation-tracker.d.ts.map