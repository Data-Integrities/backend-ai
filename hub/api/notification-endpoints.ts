// Additional endpoints for the hub to receive notifications from agents

import express from 'express';

export function setupEnhancedEndpoints(app: express.Application, httpAgents: any) {
    
    // Endpoint for agents to send notifications
    app.post('/api/notifications', (req, res) => {
        const { type, agentId, timestamp, ...data } = req.body;
        
        console.log(`Notification from ${agentId}: ${type}`, data);
        
        switch (type) {
            case 'agent-online':
                console.log(`Agent ${agentId} came online`);
                // Could trigger immediate polling
                break;
                
            case 'agent-ready':
                console.log(`\n=== AGENT READY: ${agentId} ===`);
                console.log(`Total startup time: ${data.startupTime}ms`);
                if (data.startupProfile) {
                    console.log('Startup profile:');
                    data.startupProfile.milestones.forEach((m: any) => {
                        console.log(`  ${m.name}: ${m.time}ms (+${m.duration}ms)`);
                    });
                    console.log(`API ready: ${data.startupProfile.apiReady}`);
                    console.log(`Timestamp: ${data.startupProfile.timestamp}`);
                }
                console.log('===============================\n');
                // Mark agent as online immediately
                const readyAgent = httpAgents.getAgent(agentId);
                if (readyAgent) {
                    readyAgent.isOnline = true;
                    readyAgent.lastSeen = new Date();
                    console.log(`[STATUS] Marked ${agentId} as online immediately`);
                    
                    // Check if agent has a pending correlationId (start operation)
                    if (readyAgent.pendingCorrelationId) {
                        const { correlationTracker } = require('./correlation-tracker');
                        correlationTracker.addLog(readyAgent.pendingCorrelationId, `[NOTIFICATION] Agent ${agentId} sent ready notification`);
                        correlationTracker.addLog(readyAgent.pendingCorrelationId, `[NOTIFICATION] Startup time: ${data.startupTime}ms`);
                        correlationTracker.recordPollingDetection(readyAgent.pendingCorrelationId);
                        httpAgents.clearPendingCorrelationId(agentId);
                    }
                }
                break;
                
            case 'agent-offline':
                console.log(`[NOTIFICATION] Agent ${agentId} going offline at ${new Date().toISOString()}`);
                // Mark agent as offline immediately
                const agent = httpAgents.getAgent(agentId);
                if (agent) {
                    agent.isOnline = false;
                    console.log(`[STATUS] Marked ${agentId} as offline immediately`);
                    
                    // Check if agent has a pending correlationId (stop operation)
                    if (agent.pendingCorrelationId) {
                        console.log(`[CORRELATION] Agent ${agentId} offline notification with correlationId: ${agent.pendingCorrelationId}`);
                        // Import correlation tracker
                        const { correlationTracker } = require('./correlation-tracker');
                        correlationTracker.addLog(agent.pendingCorrelationId, `[NOTIFICATION] Agent ${agentId} sent offline notification`);
                        correlationTracker.recordPollingDetection(agent.pendingCorrelationId);
                        // Complete the execution since agent is now offline
                        correlationTracker.completeExecution(agent.pendingCorrelationId, {
                            result: 'Agent stopped successfully (offline notification received)',
                            agentId: agentId,
                            detectedBy: 'notification'
                        });
                        // Clear the pending correlationId
                        httpAgents.clearPendingCorrelationId(agentId);
                    } else {
                        console.log(`[WARNING] Agent ${agentId} offline notification received but no pending correlationId found`);
                        // Check if there's a pending correlation ID using the getter
                        const pendingId = httpAgents.getPendingCorrelationId(agentId);
                        if (pendingId) {
                            console.log(`[WARNING] Found pending ID via getter: ${pendingId}`);
                        }
                    }
                }
                break;
                
            case 'command-result':
                console.log(`Command result from ${agentId}:`, data);
                // Store result for retrieval
                storeCommandResult(data);
                break;
                
            case 'event':
                console.log(`Event from ${agentId}:`, data);
                // Handle system events (high CPU, etc)
                handleAgentEvent(agentId, data);
                break;
                
            default:
                console.log(`Unknown notification type: ${type}`);
        }
        
        res.json({ received: true });
    });
    
    // Enhanced command endpoint that supports async execution
    app.post('/api/command/v2', async (req, res) => {
        const { command, targetAgents, async = false, requestId = generateRequestId() } = req.body;
        
        if (!command) {
            return res.status(400).json({ error: 'Command required' });
        }
        
        const agents = targetAgents || httpAgents.getAgentsForApi().agents
            .filter((a: any) => a.isOnline)
            .map((a: any) => a.name);
        
        if (async) {
            // Start async execution
            executeCommandsAsync(command, agents, requestId, httpAgents);
            
            res.json({
                requestId,
                status: 'accepted',
                targetAgents: agents,
                message: 'Command accepted for async execution'
            });
        } else {
            // Execute synchronously
            const results = await executeCommandsSync(command, agents, httpAgents);
            
            res.json({
                requestId,
                results,
                success: results.every(r => r.success)
            });
        }
    });
    
    // Get async command results
    app.get('/api/command/v2/:requestId', (req, res) => {
        const { requestId } = req.params;
        const results = getCommandResults(requestId);
        
        if (!results) {
            return res.status(404).json({ error: 'Request not found' });
        }
        
        res.json(results);
    });
}

// Command result storage (in production, use Redis or database)
const commandResults = new Map<string, any>();

function storeCommandResult(result: any) {
    const { requestId, ...data } = result;
    
    if (!commandResults.has(requestId)) {
        commandResults.set(requestId, {
            requestId,
            status: 'in-progress',
            results: []
        });
    }
    
    const stored = commandResults.get(requestId);
    stored.results.push(data);
    
    // Check if all agents have responded
    // This would need to track expected agents
}

function getCommandResults(requestId: string): any {
    return commandResults.get(requestId);
}

function handleAgentEvent(agentId: string, event: any) {
    const { severity, message, resource, value } = event;
    
    // Log critical events
    if (severity === 'critical' || severity === 'error') {
        console.error(`CRITICAL EVENT from ${agentId}: ${message}`);
        // Could send alerts, emails, etc.
    }
    
    // Store events for dashboard
    // Could send to UI clients via Server-Sent Events (if needed for real-time updates)
}

async function executeCommandsSync(command: string, agents: string[], httpAgents: any): Promise<any[]> {
    const results = [];
    
    for (const agentName of agents) {
        try {
            const result = await httpAgents.sendCommand(agentName, command);
            results.push({
                agentId: agentName,
                ...result
            });
        } catch (error: any) {
            results.push({
                agentId: agentName,
                success: false,
                error: error.message
            });
        }
    }
    
    return results;
}

async function executeCommandsAsync(command: string, agents: string[], requestId: string, httpAgents: any): Promise<void> {
    // Store initial state
    commandResults.set(requestId, {
        requestId,
        status: 'in-progress',
        startTime: new Date().toISOString(),
        expectedAgents: agents,
        results: []
    });
    
    // Send commands to all agents with requestId
    for (const agentName of agents) {
        httpAgents.sendCommand(agentName, command, { async: true, requestId })
            .catch((error: any) => {
                storeCommandResult({
                    requestId,
                    agentId: agentName,
                    success: false,
                    error: error.message
                });
            });
    }
}

function generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}