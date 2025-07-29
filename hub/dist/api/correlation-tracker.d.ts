import { EventEmitter } from 'events';
export interface CommandExecution {
    correlationId: string;
    command: string;
    agent: string;
    startTime: number;
    status: 'pending' | 'success' | 'failed' | 'timeout';
    type?: string;
    endTime?: number;
    callbackTime?: number;
    pollingDetectedTime?: number;
    result?: any;
    error?: string;
    logs?: string[];
}
export declare class CorrelationTracker extends EventEmitter {
    private executions;
    private readonly TIMEOUT_MS;
    private timeouts;
    generateCorrelationId(): string;
    startExecution(correlationId: string, command: string, agent: string): void;
    completeExecution(correlationId: string, result: any): void;
    failExecution(correlationId: string, error: string): void;
    addLog(correlationId: string, log: string): void;
    recordPollingDetection(correlationId: string): void;
    getExecution(correlationId: string): CommandExecution | undefined;
    getAllExecutions(): CommandExecution[];
    cleanup(): void;
}
export declare const correlationTracker: CorrelationTracker;
//# sourceMappingURL=correlation-tracker.d.ts.map