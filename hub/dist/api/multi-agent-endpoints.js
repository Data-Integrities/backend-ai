"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupMultiAgentEndpoints = setupMultiAgentEndpoints;
const correlation_tracker_1 = require("./correlation-tracker");
const axios_1 = __importDefault(require("axios"));
function setupMultiAgentEndpoints(app, httpAgents) {
    // Multi-agent start operation
    app.post('/api/agents/multi/start', async (req, res) => {
        const { agents, parentCorrelationId } = req.body;
        if (!agents || !Array.isArray(agents) || agents.length === 0) {
            return res.status(400).json({ error: 'agents array is required' });
        }
        if (!parentCorrelationId) {
            return res.status(400).json({ error: 'parentCorrelationId is required' });
        }
        console.log(`[MULTI-AGENT] Starting multi-agent start operation with parent ${parentCorrelationId}`);
        // Start parent execution tracking
        correlation_tracker_1.correlationTracker.startExecution(parentCorrelationId, 'start-all', 'multi-agent', 'start-all');
        // Pre-register all child IDs to prevent race condition
        const childCorrelationIds = [];
        agents.forEach((agentName) => {
            const childCorrelationId = correlation_tracker_1.correlationTracker.generateCorrelationId();
            childCorrelationIds.push(childCorrelationId);
            // Register child with parent immediately
            correlation_tracker_1.correlationTracker.startExecution(childCorrelationId, 'start-agent', agentName, 'start-agent', parentCorrelationId);
        });
        // Start all child operations
        const childPromises = agents.map(async (agentName, index) => {
            const agent = httpAgents.getAgent(agentName);
            const childCorrelationId = childCorrelationIds[index];
            if (!agent) {
                correlation_tracker_1.correlationTracker.failExecution(childCorrelationId, 'Agent not found');
                return {
                    agentName,
                    success: false,
                    error: 'Agent not found'
                };
            }
            httpAgents.setPendingCorrelationId(agentName, childCorrelationId);
            try {
                // Call agent manager
                correlation_tracker_1.correlationTracker.addLog(childCorrelationId, `Calling manager API at http://${agent.ip}:3081/start`);
                const response = await axios_1.default.post(`http://${agent.ip}:3081/start`, {
                    correlationId: childCorrelationId
                });
                correlation_tracker_1.correlationTracker.addLog(childCorrelationId, `Manager responded: ${response.data.success ? 'Success' : 'Failed'}`);
                if (response.data.output) {
                    correlation_tracker_1.correlationTracker.addLog(childCorrelationId, `Manager output: ${response.data.output}`);
                }
                return {
                    agentName,
                    correlationId: childCorrelationId,
                    success: true,
                    ...response.data
                };
            }
            catch (error) {
                correlation_tracker_1.correlationTracker.addLog(childCorrelationId, `Error calling manager: ${error.message}`);
                correlation_tracker_1.correlationTracker.failExecution(childCorrelationId, error.message);
                return {
                    agentName,
                    correlationId: childCorrelationId,
                    success: false,
                    error: error.message
                };
            }
        });
        // Return immediately with accepted status
        res.status(202).json({
            parentCorrelationId,
            message: 'Multi-agent start operation initiated',
            agents: agents
        });
        // Don't wait for completion - parent will be updated automatically
        Promise.all(childPromises).then(results => {
            console.log(`[MULTI-AGENT] All child operations initiated for parent ${parentCorrelationId}`);
        });
    });
    // Multi-agent stop operation
    app.post('/api/agents/multi/stop', async (req, res) => {
        const { agents, parentCorrelationId } = req.body;
        if (!agents || !Array.isArray(agents) || agents.length === 0) {
            return res.status(400).json({ error: 'agents array is required' });
        }
        if (!parentCorrelationId) {
            return res.status(400).json({ error: 'parentCorrelationId is required' });
        }
        console.log(`[MULTI-AGENT] Starting multi-agent stop operation with parent ${parentCorrelationId}`);
        // Start parent execution tracking with expected child count
        correlation_tracker_1.correlationTracker.startExecution(parentCorrelationId, 'stop-all', 'multi-agent', 'stop-all');
        // Pre-register all child IDs to prevent race condition
        const childCorrelationIds = [];
        agents.forEach((agentName) => {
            const childCorrelationId = correlation_tracker_1.correlationTracker.generateCorrelationId();
            childCorrelationIds.push(childCorrelationId);
            // Register child with parent immediately
            correlation_tracker_1.correlationTracker.startExecution(childCorrelationId, 'stop-agent', agentName, 'stop-agent', parentCorrelationId);
        });
        // Stop all child operations
        const childPromises = agents.map(async (agentName, index) => {
            const agent = httpAgents.getAgent(agentName);
            const childCorrelationId = childCorrelationIds[index];
            if (!agent) {
                correlation_tracker_1.correlationTracker.failExecution(childCorrelationId, 'Agent not found');
                return {
                    agentName,
                    success: false,
                    error: 'Agent not found'
                };
            }
            httpAgents.setPendingCorrelationId(agentName, childCorrelationId);
            try {
                // Call agent manager
                correlation_tracker_1.correlationTracker.addLog(childCorrelationId, `Calling manager API at http://${agent.ip}:3081/stop`);
                const response = await axios_1.default.post(`http://${agent.ip}:3081/stop`, {
                    correlationId: childCorrelationId
                });
                correlation_tracker_1.correlationTracker.addLog(childCorrelationId, `Manager responded: ${response.data.success ? 'Success' : 'Failed'}`);
                if (response.data.output) {
                    correlation_tracker_1.correlationTracker.addLog(childCorrelationId, `Manager output: ${response.data.output}`);
                }
                return {
                    agentName,
                    correlationId: childCorrelationId,
                    success: true,
                    ...response.data
                };
            }
            catch (error) {
                correlation_tracker_1.correlationTracker.addLog(childCorrelationId, `Error calling manager: ${error.message}`);
                correlation_tracker_1.correlationTracker.failExecution(childCorrelationId, error.message);
                return {
                    agentName,
                    correlationId: childCorrelationId,
                    success: false,
                    error: error.message
                };
            }
        });
        // Return immediately with accepted status
        res.status(202).json({
            parentCorrelationId,
            message: 'Multi-agent stop operation initiated',
            agents: agents
        });
        // Don't wait for completion - parent will be updated automatically
        Promise.all(childPromises).then(results => {
            console.log(`[MULTI-AGENT] All child operations initiated for parent ${parentCorrelationId}`);
        });
    });
    // Multi-agent manager operations (start/stop managers)
    app.post('/api/agents/multi/start-managers', async (req, res) => {
        const { agents, parentCorrelationId } = req.body;
        if (!agents || !Array.isArray(agents) || agents.length === 0) {
            return res.status(400).json({ error: 'agents array is required' });
        }
        if (!parentCorrelationId) {
            return res.status(400).json({ error: 'parentCorrelationId is required' });
        }
        console.log(`[MULTI-AGENT] Starting multi-agent start-managers operation with parent ${parentCorrelationId}`);
        // Start parent execution tracking
        correlation_tracker_1.correlationTracker.startExecution(parentCorrelationId, 'start-all-managers', 'multi-agent', 'start-all-managers');
        // Implementation would follow similar pattern to start/stop
        // For now, return accepted status
        res.status(202).json({
            parentCorrelationId,
            message: 'Multi-agent start-managers operation initiated',
            agents: agents
        });
    });
    app.post('/api/agents/multi/stop-managers', async (req, res) => {
        const { agents, parentCorrelationId } = req.body;
        if (!agents || !Array.isArray(agents) || agents.length === 0) {
            return res.status(400).json({ error: 'agents array is required' });
        }
        if (!parentCorrelationId) {
            return res.status(400).json({ error: 'parentCorrelationId is required' });
        }
        console.log(`[MULTI-AGENT] Starting multi-agent stop-managers operation with parent ${parentCorrelationId}`);
        // Start parent execution tracking
        correlation_tracker_1.correlationTracker.startExecution(parentCorrelationId, 'stop-all-managers', 'multi-agent', 'stop-all-managers');
        // Implementation would follow similar pattern to start/stop
        // For now, return accepted status
        res.status(202).json({
            parentCorrelationId,
            message: 'Multi-agent stop-managers operation initiated',
            agents: agents
        });
    });
}
//# sourceMappingURL=multi-agent-endpoints.js.map