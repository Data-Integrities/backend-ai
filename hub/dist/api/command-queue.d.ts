import { EventEmitter } from 'events';
export interface QueuedCommand {
    id: string;
    agent: string;
    operation: string;
    correlationId?: string;
    timestamp: Date;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    result?: any;
    error?: string;
}
declare class CommandQueue extends EventEmitter {
    private commands;
    private commandHistory;
    private maxHistorySize;
    addCommand(agent: string, operation: string): QueuedCommand;
    getPendingCommands(): QueuedCommand[];
    markProcessing(commandId: string, correlationId?: string): boolean;
    markCompleted(commandId: string, result?: any): boolean;
    markFailed(commandId: string, error: string): boolean;
    getCommand(commandId: string): QueuedCommand | undefined;
    clearOldCommands(maxAgeMs?: number): number;
}
export declare const commandQueue: CommandQueue;
export {};
//# sourceMappingURL=command-queue.d.ts.map