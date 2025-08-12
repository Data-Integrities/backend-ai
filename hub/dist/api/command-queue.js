"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commandQueue = void 0;
const events_1 = require("events");
class CommandQueue extends events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this.commands = new Map();
        this.commandHistory = [];
        this.maxHistorySize = 100;
    }
    // Add a command to the queue
    addCommand(agent, operation) {
        const command = {
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
    getPendingCommands() {
        return Array.from(this.commands.values())
            .filter(cmd => cmd.status === 'pending')
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }
    // Mark command as processing
    markProcessing(commandId, correlationId) {
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
    markCompleted(commandId, result) {
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
    markFailed(commandId, error) {
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
    getCommand(commandId) {
        return this.commands.get(commandId) ||
            this.commandHistory.find(cmd => cmd.id === commandId);
    }
    // Clear old pending commands (cleanup)
    clearOldCommands(maxAgeMs = 60000) {
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
exports.commandQueue = new CommandQueue();
// Clean up old commands every minute
setInterval(() => {
    const cleared = exports.commandQueue.clearOldCommands();
    if (cleared > 0) {
        console.log(`[CommandQueue] Cleared ${cleared} expired commands`);
    }
}, 60000);
//# sourceMappingURL=command-queue.js.map