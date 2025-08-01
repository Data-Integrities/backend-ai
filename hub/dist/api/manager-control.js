"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupManagerControlEndpoints = setupManagerControlEndpoints;
const child_process_1 = require("child_process");
const util_1 = require("util");
const axios_1 = __importDefault(require("axios"));
const correlation_tracker_1 = require("./correlation-tracker");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
function setupManagerControlEndpoints(app, httpAgents) {
    // Listen for timeout events to handle force kill
    correlation_tracker_1.correlationTracker.on('execution-timeout', async (execution) => {
        // Only handle stop operations that timeout
        if (execution.type === 'stop-manager' && execution.status === 'timeout') {
            console.log(`[HUB] Stop operation timed out for ${execution.agent}, attempting force kill...`);
            correlation_tracker_1.correlationTracker.addLog(execution.correlationId, '[FORCE-KILL] Stop operation timed out, attempting force termination');
            const agent = httpAgents.getAgent(execution.agent);
            const agentConfig = httpAgents.getAgentConfig(execution.agent);
            if (!agent || !agentConfig) {
                correlation_tracker_1.correlationTracker.addLog(execution.correlationId, '[FORCE-KILL] Error: Agent or config not found');
                return;
            }
            try {
                // Use kill-service.sh script to force terminate
                const killCommand = `/opt/ai-agent/scripts/kill-service.sh manager`;
                const sshCommand = `ssh -o StrictHostKeyChecking=no ${agentConfig.accessUser || 'root'}@${agent.ip} "${killCommand}"`;
                correlation_tracker_1.correlationTracker.addLog(execution.correlationId, `[FORCE-KILL] Executing: ${killCommand}`);
                const { stdout, stderr } = await execAsync(sshCommand);
                if (stdout && stdout.trim()) {
                    correlation_tracker_1.correlationTracker.addLog(execution.correlationId, `[FORCE-KILL] Output: ${stdout.trim()}`);
                }
                if (stderr && stderr.trim()) {
                    correlation_tracker_1.correlationTracker.addLog(execution.correlationId, `[FORCE-KILL] Stderr: ${stderr.trim()}`);
                }
                // Update execution status to manual termination
                const updatedExecution = correlation_tracker_1.correlationTracker.getExecution(execution.correlationId);
                if (updatedExecution) {
                    updatedExecution.status = 'manualTermination';
                    updatedExecution.result = {
                        message: 'Service force terminated after timeout',
                        forceKilled: true
                    };
                    correlation_tracker_1.correlationTracker.addLog(execution.correlationId, '[FORCE-KILL] Service successfully force terminated');
                    correlation_tracker_1.correlationTracker.emit('executionUpdate', updatedExecution);
                }
            }
            catch (error) {
                console.error(`[HUB] Force kill failed for ${execution.agent}:`, error.message);
                correlation_tracker_1.correlationTracker.addLog(execution.correlationId, `[FORCE-KILL] Error: ${error.message}`);
                // Update execution status to failed
                const updatedExecution = correlation_tracker_1.correlationTracker.getExecution(execution.correlationId);
                if (updatedExecution) {
                    updatedExecution.status = 'failed';
                    updatedExecution.error = `Force kill failed: ${error.message}`;
                    correlation_tracker_1.correlationTracker.emit('executionUpdate', updatedExecution);
                }
            }
        }
    });
    // Control agent managers remotely
    app.post('/api/managers/:agentName/:action', async (req, res) => {
        const { agentName, action } = req.params;
        const agent = httpAgents.getAgent(agentName);
        // Generate or use provided correlationId
        const correlationId = req.body?.correlationId || correlation_tracker_1.correlationTracker.generateCorrelationId();
        if (!agent) {
            return res.status(404).json({ error: 'Agent not found', correlationId });
        }
        // Get agent config from agents-config.json
        const agentConfig = httpAgents.getAgentConfig(agentName);
        if (!agentConfig) {
            return res.status(404).json({ error: 'Agent configuration not found', correlationId });
        }
        // Start tracking this execution
        correlation_tracker_1.correlationTracker.startExecution(correlationId, `${action}-manager`, agentName, `${action}-manager`);
        // Set pending correlationId for agent polling
        if (action === 'start' || action === 'restart') {
            httpAgents.setPendingCorrelationId(agentName, correlationId);
        }
        let sshCommand = '';
        try {
            let command;
            const serviceName = 'ai-agent-manager';
            // Get service manager configuration
            const serviceManagerType = agentConfig.serviceManager || 'systemd';
            const serviceManagers = httpAgents.getServiceManagers();
            const serviceManager = serviceManagers[serviceManagerType];
            if (!serviceManager || !serviceManager.commands[action]) {
                return res.status(400).json({
                    error: `Invalid action or service manager configuration for ${agentName}`,
                    correlationId
                });
            }
            // Use service manager template, replacing {service} with actual service name
            command = serviceManager.commands[action].replace('{service}', serviceName);
            // For special actions that need correlationId support, modify the command
            if (action === 'start') {
                // Use wrapper script for start that can handle correlationId
                if (serviceManagerType === 'systemd') {
                    command = `AGENT_NAME="${agentName}" /opt/ai-agent/ai-agent-manager-start.sh "${correlationId}"`;
                }
                else if (serviceManagerType === 'rc.d') {
                    command = `AGENT_NAME="${agentName}" /opt/ai-agent/rc.d/ai-agent-manager-start.sh "${correlationId}"`;
                }
                else {
                    // Fallback - just add correlationId as environment variable
                    command = `CORRELATION_ID="${correlationId}" AGENT_NAME="${agentName}" ${command}`;
                }
            }
            else if (action === 'restart') {
                // Use wrapper script for restart that handles stop and start with correlationId
                if (serviceManagerType === 'systemd') {
                    command = `AGENT_NAME="${agentName}" /opt/ai-agent/ai-agent-manager-restart.sh "${correlationId}"`;
                }
                else if (serviceManagerType === 'rc.d') {
                    command = `AGENT_NAME="${agentName}" /opt/ai-agent/rc.d/ai-agent-manager-restart.sh "${correlationId}"`;
                }
                else {
                    // Fallback - just add correlationId as environment variable
                    command = `CORRELATION_ID="${correlationId}" AGENT_NAME="${agentName}" ${command}`;
                }
            }
            else if (action === 'stop') {
                // For stop, use wrapper script that can send callback
                if (serviceManagerType === 'systemd') {
                    command = `AGENT_NAME="${agentName}" /opt/ai-agent/ai-agent-manager-stop.sh "${correlationId}"`;
                }
                else if (serviceManagerType === 'rc.d') {
                    // For unraid, use rc.d version of the script
                    command = `AGENT_NAME="${agentName}" /opt/ai-agent/rc.d/ai-agent-manager-stop.sh "${correlationId}"`;
                }
                else {
                    // Fallback - just add correlationId as environment variable
                    command = `CORRELATION_ID="${correlationId}" AGENT_NAME="${agentName}" ${command}`;
                }
            }
            // Execute command via SSH
            sshCommand = `ssh -o StrictHostKeyChecking=no ${agentConfig.accessUser || 'root'}@${agent.ip} "${command}"`;
            console.log(`[HUB] Executing manager ${action} for ${agentName} [${correlationId}]: ${command}`);
            correlation_tracker_1.correlationTracker.addLog(correlationId, `[HUB] Executing manager ${action} for ${agentName}`);
            correlation_tracker_1.correlationTracker.addLog(correlationId, `Command: ${command}`);
            const { stdout, stderr } = await execAsync(sshCommand);
            // Log the full command for debugging
            correlation_tracker_1.correlationTracker.addLog(correlationId, `Full SSH command: ${sshCommand}`);
            // Log stdout if present
            if (stdout && stdout.trim()) {
                correlation_tracker_1.correlationTracker.addLog(correlationId, `Output: ${stdout.trim()}`);
            }
            else {
                correlation_tracker_1.correlationTracker.addLog(correlationId, `No output from command`);
            }
            // Log stderr if present
            if (stderr && stderr.trim()) {
                correlation_tracker_1.correlationTracker.addLog(correlationId, `Stderr: ${stderr.trim()}`);
            }
            // Log completion - the service scripts will send the actual completion callback
            correlation_tracker_1.correlationTracker.addLog(correlationId, `SSH command completed successfully`);
            res.json({
                agent: agentName,
                action: action,
                success: true,
                output: stdout.trim(),
                command: command,
                correlationId: correlationId
            });
        }
        catch (error) {
            console.error(`[HUB] Manager ${action} failed for ${agentName} [${correlationId}]:`, error.message);
            // Log the full SSH command that failed
            correlation_tracker_1.correlationTracker.addLog(correlationId, `Full SSH command: ${sshCommand}`);
            // Log error details
            correlation_tracker_1.correlationTracker.addLog(correlationId, `Error: ${error.message}`);
            if (error.stdout) {
                correlation_tracker_1.correlationTracker.addLog(correlationId, `Stdout before failure: ${error.stdout}`);
            }
            if (error.stderr) {
                correlation_tracker_1.correlationTracker.addLog(correlationId, `Stderr: ${error.stderr}`);
            }
            correlation_tracker_1.correlationTracker.failExecution(correlationId, error.message);
            res.status(500).json({
                agent: agentName,
                action: action,
                success: false,
                error: error.message,
                stderr: error.stderr,
                correlationId: correlationId
            });
        }
    });
    // Get manager status for all agents
    app.get('/api/managers/status', async (req, res) => {
        const agents = httpAgents.getAgents();
        const statuses = [];
        for (const agent of agents) {
            const agentConfig = httpAgents.getAgentConfig(agent.name);
            if (!agentConfig)
                continue;
            try {
                // Check if manager is responding
                const managerUrl = `http://${agent.ip}:3081/status`;
                const response = await axios_1.default.get(managerUrl, { timeout: 2000 });
                if (response.status === 200) {
                    const data = response.data;
                    statuses.push({
                        agent: agent.name,
                        managerRunning: true,
                        managerVersion: data.managerVersion,
                        agentRunning: data.running
                    });
                }
                else {
                    statuses.push({
                        agent: agent.name,
                        managerRunning: false,
                        managerVersion: null,
                        agentRunning: false
                    });
                }
            }
            catch (error) {
                // Manager not responding
                statuses.push({
                    agent: agent.name,
                    managerRunning: false,
                    managerVersion: null,
                    agentRunning: false,
                    error: 'Manager not responding'
                });
            }
        }
        res.json({ managers: statuses });
    });
    // Emergency recovery - start all managers
    app.post('/api/managers/start-all', async (req, res) => {
        const agents = httpAgents.getAgents();
        const results = [];
        console.log('[HUB] Starting all agent managers...');
        for (const agent of agents) {
            const agentConfig = httpAgents.getAgentConfig(agent.name);
            if (!agentConfig)
                continue;
            try {
                let command;
                if (agentConfig.systemType === 'unraid') {
                    command = `/etc/rc.d/rc.ai-agent-manager start`;
                }
                else {
                    command = `systemctl start ai-agent-manager`;
                }
                const sshCommand = `ssh -o StrictHostKeyChecking=no ${agentConfig.accessUser || 'root'}@${agent.ip} "${command}"`;
                await execAsync(sshCommand);
                results.push({
                    agent: agent.name,
                    success: true,
                    message: 'Manager started'
                });
            }
            catch (error) {
                results.push({
                    agent: agent.name,
                    success: false,
                    error: error.message
                });
            }
        }
        res.json({ results });
    });
}
//# sourceMappingURL=manager-control.js.map