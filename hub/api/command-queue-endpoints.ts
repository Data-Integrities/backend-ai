import { Express } from 'express';
import { commandQueue } from './command-queue';

export function setupCommandQueueEndpoints(app: Express) {
    // Queue a command for the browser to execute
    app.post('/api/commands/queue', (req, res) => {
        const { agent, operation } = req.body;
        
        if (!agent || !operation) {
            return res.status(400).json({ 
                error: 'agent and operation are required' 
            });
        }

        // Validate operation
        const validOperations = [
            'start', 'stop', 'restart',
            'start-manager', 'stop-manager', 'restart-manager',
            'reboot', 'ssh'
        ];

        if (!validOperations.includes(operation)) {
            return res.status(400).json({ 
                error: `Invalid operation. Valid operations: ${validOperations.join(', ')}` 
            });
        }

        const command = commandQueue.addCommand(agent, operation);
        
        res.json({
            success: true,
            command,
            message: `Command queued for browser execution`
        });
    });

    // Get pending commands (called by browser)
    app.get('/api/commands/pending', (req, res) => {
        const commands = commandQueue.getPendingCommands();
        res.json({ commands });
    });

    // Mark command as processing (called by browser)
    app.post('/api/commands/:commandId/processing', (req, res) => {
        const { commandId } = req.params;
        const { correlationId } = req.body;
        
        const success = commandQueue.markProcessing(commandId, correlationId);
        
        if (success) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Command not found or not pending' });
        }
    });

    // Mark command as completed (called by browser)
    app.post('/api/commands/:commandId/complete', (req, res) => {
        const { commandId } = req.params;
        const { result } = req.body;
        
        const success = commandQueue.markCompleted(commandId, result);
        
        if (success) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Command not found' });
        }
    });

    // Mark command as failed (called by browser)
    app.post('/api/commands/:commandId/fail', (req, res) => {
        const { commandId } = req.params;
        const { error } = req.body;
        
        const success = commandQueue.markFailed(commandId, error || 'Unknown error');
        
        if (success) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Command not found' });
        }
    });

    // Get command status
    app.get('/api/commands/:commandId', (req, res) => {
        const { commandId } = req.params;
        const command = commandQueue.getCommand(commandId);
        
        if (command) {
            res.json(command);
        } else {
            res.status(404).json({ error: 'Command not found' });
        }
    });

    // Convenience endpoint: Queue and wait for completion
    app.post('/api/commands/execute', async (req, res) => {
        const { agent, operation, timeout = 30000 } = req.body;
        
        if (!agent || !operation) {
            return res.status(400).json({ 
                error: 'agent and operation are required' 
            });
        }

        // Queue the command
        const command = commandQueue.addCommand(agent, operation);
        const startTime = Date.now();

        // Wait for completion
        while (Date.now() - startTime < timeout) {
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const currentCommand = commandQueue.getCommand(command.id);
            if (!currentCommand) {
                return res.status(500).json({ 
                    error: 'Command disappeared unexpectedly' 
                });
            }

            if (currentCommand.status === 'completed') {
                return res.json({
                    success: true,
                    command: currentCommand,
                    duration: Date.now() - startTime
                });
            }

            if (currentCommand.status === 'failed') {
                return res.status(500).json({
                    success: false,
                    command: currentCommand,
                    error: currentCommand.error,
                    duration: Date.now() - startTime
                });
            }
        }

        // Timeout
        commandQueue.markFailed(command.id, 'Timeout waiting for browser execution');
        res.status(408).json({
            success: false,
            error: 'Timeout waiting for browser to execute command',
            command,
            duration: Date.now() - startTime
        });
    });
}