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

class CommandQueue extends EventEmitter {
    private commands: Map<string, QueuedCommand> = new Map();
    private commandHistory: QueuedCommand[] = [];
    private maxHistorySize = 100;

    // Add a command to the queue
    addCommand(agent: string, operation: string): QueuedCommand {
        const command: QueuedCommand = {
            id: `queued_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            agent,
            operation,
            timestamp: new Date(),
            status: 'pending'
        };

        this.commands.set(command.id, command);
        this.emit('commandAdded', command);
        
        console.log(`[CommandQueue] Added command: ${operation} for ${agent} (${command.id})`);
        return command;
    }

    // Get all pending commands
    getPendingCommands(): QueuedCommand[] {
        return Array.from(this.commands.values())
            .filter(cmd => cmd.status === 'pending')
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }

    // Mark command as processing
    markProcessing(commandId: string, correlationId?: string): boolean {
        const command = this.commands.get(commandId);
        if (command && command.status === 'pending') {
            command.status = 'processing';
            if (correlationId) {
                command.correlationId = correlationId;
            }
            console.log(`[CommandQueue] Command ${commandId} marked as processing`);
            return true;
        }
        return false;
    }

    // Mark command as completed
    markCompleted(commandId: string, result?: any): boolean {
        const command = this.commands.get(commandId);
        if (command) {
            command.status = 'completed';
            command.result = result;
            
            // Move to history
            this.commandHistory.push(command);
            if (this.commandHistory.length > this.maxHistorySize) {
                this.commandHistory.shift();
            }
            
            this.commands.delete(commandId);
            console.log(`[CommandQueue] Command ${commandId} completed`);
            return true;
        }
        return false;
    }

    // Mark command as failed
    markFailed(commandId: string, error: string): boolean {
        const command = this.commands.get(commandId);
        if (command) {
            command.status = 'failed';
            command.error = error;
            
            // Move to history
            this.commandHistory.push(command);
            if (this.commandHistory.length > this.maxHistorySize) {
                this.commandHistory.shift();
            }
            
            this.commands.delete(commandId);
            console.log(`[CommandQueue] Command ${commandId} failed: ${error}`);
            return true;
        }
        return false;
    }

    // Get command by ID
    getCommand(commandId: string): QueuedCommand | undefined {
        return this.commands.get(commandId) || 
               this.commandHistory.find(cmd => cmd.id === commandId);
    }

    // Clear old pending commands (cleanup)
    clearOldCommands(maxAgeMs: number = 60000): number {
        const now = Date.now();
        let cleared = 0;
        
        for (const [id, command] of this.commands.entries()) {
            if (command.status === 'pending' && 
                now - command.timestamp.getTime() > maxAgeMs) {
                this.markFailed(id, 'Command expired');
                cleared++;
            }
        }
        
        return cleared;
    }
}

// Export singleton instance
export const commandQueue = new CommandQueue();

// Clean up old commands every minute
setInterval(() => {
    const cleared = commandQueue.clearOldCommands();
    if (cleared > 0) {
        console.log(`[CommandQueue] Cleared ${cleared} expired commands`);
    }
}, 60000);