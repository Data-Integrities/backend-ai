#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
const SimpleHttpAgents_1 = require("./SimpleHttpAgents");
const AICommandProcessor_1 = require("./AICommandProcessor");
const notification_endpoints_1 = require("./notification-endpoints");
const manager_control_1 = require("./manager-control");
const ssh_manager_1 = require("./ssh-manager");
const correlation_endpoints_1 = require("./correlation-endpoints");
const correlation_tracker_1 = require("./correlation-tracker");
const chat_endpoints_1 = require("./chat-endpoints");
const shared_1 = require("@proxmox-ai-control/shared");
const fs_1 = __importDefault(require("fs"));
// Load environment variables
dotenv_1.default.config();
// Load configuration
const configLoader = shared_1.ConfigLoader.getInstance();
const config = configLoader.getConfig();
const app = (0, express_1.default)();
const PORT = config.hub.port;
// Initialize logging with local directory
(async () => {
    try {
        const retentionDays = config?.defaults?.logging?.retentionDays || 5;
        const logManager = new shared_1.LogManager(__dirname, 'hub.log', retentionDays);
        const logPath = await logManager.initialize();
        console.log(`Hub logging initialized at: ${logPath}`);
        // Redirect stdout and stderr to the log file if not in TTY mode
        if (!process.stdout.isTTY) {
            const logStream = fs_1.default.createWriteStream(logPath, { flags: 'a' });
            process.stdout.write = process.stderr.write = logStream.write.bind(logStream);
        }
    }
    catch (error) {
        console.error('Failed to initialize local logging:', error);
    }
})();
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Initialize components
const aiProcessor = new AICommandProcessor_1.AICommandProcessor(process.env.ANTHROPIC_API_KEY || '');
const httpAgents = new SimpleHttpAgents_1.SimpleHttpAgents();
const sshManager = new ssh_manager_1.SSHManager();
// Load HTTP agents configuration
httpAgents.loadConfig();
// Initialize SSH manager
sshManager.initialize().catch(err => {
    console.error('[SSH] Failed to initialize SSH manager:', err);
});
// Listen for manager operation completions to trigger immediate status updates
correlation_tracker_1.correlationTracker.on('manager-operation-complete', async (execution) => {
    if (execution.agent) {
        console.log(`[STATUS] Manager operation completed for ${execution.agent}, triggering immediate status check`);
        // Small delay to ensure service state has settled
        setTimeout(async () => {
            await httpAgents.checkSingleAgentStatus(execution.agent);
        }, 1000);
    }
});
// Serve static files from gui directory with no-cache for development
app.use(express_1.default.static(path_1.default.join(__dirname, '../../gui'), {
    setHeaders: (res, path) => {
        // Disable caching for HTML files
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));
// Root route - force config reload when accessing web UI
app.get('/', async (req, res) => {
    await httpAgents.reloadConfig();
    console.log('Reloaded agent config for web UI access');
    // Set no-cache headers for the root HTML file
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path_1.default.join(__dirname, '../../gui/index.html'));
});
// Setup enhanced endpoints for agent notifications
(0, notification_endpoints_1.setupEnhancedEndpoints)(app, httpAgents);
// Setup manager control endpoints
(0, manager_control_1.setupManagerControlEndpoints)(app, httpAgents);
// Setup correlation tracking endpoints
(0, correlation_endpoints_1.setupCorrelationEndpoints)(app);
// Setup SSH management endpoints
(0, ssh_manager_1.setupSSHEndpoints)(app, httpAgents, sshManager);
// Setup chat logging endpoints
(0, chat_endpoints_1.setupChatEndpoints)(app);
// API Routes
// Get all connected agents
app.get('/api/agents', async (req, res) => {
    const agents = httpAgents.getAgentsForApi();
    // Load version config
    let expectedVersion = '2.0.3'; // Default
    try {
        const versionConfig = require('../../VERSION_CONFIG.json');
        expectedVersion = versionConfig.agentVersion;
    }
    catch (e) {
        console.warn('Could not load VERSION_CONFIG.json, using default version');
    }
    // Add version comparison to response
    const enhancedAgents = {
        ...agents,
        expectedAgentVersion: expectedVersion,
        agents: agents.agents.map((agent) => ({
            ...agent,
            versionStatus: agent.version === expectedVersion ? 'up-to-date' : 'needs-update',
            expectedVersion: expectedVersion
        }))
    };
    res.json(enhancedAgents);
});
// Get specific agent status
app.get('/api/agents/:agentId', (req, res) => {
    const agent = httpAgents.getAgent(req.params.agentId);
    if (agent) {
        res.json(agent);
    }
    else {
        res.status(404).json({ error: 'Agent not found' });
    }
});
// Execute a natural language command
app.post('/api/command', async (req, res) => {
    try {
        const { command, targetAgents, requireConfirmation, tabId } = req.body;
        if (!command) {
            return res.status(400).json({ error: 'Command is required' });
        }
        console.log(`Processing command: ${command}`);
        // Get available agents from HTTP polling
        const httpAgentStatus = httpAgents.getAgentsForApi();
        const availableAgents = httpAgentStatus.agents
            .filter((a) => a.isOnline)
            .map((a) => ({
            agentId: a.name,
            hostname: a.name,
            summary: a.capabilities?.summary || `${a.name} agent`,
            type: a.capabilities?.type || 'generic'
        }));
        if (availableAgents.length === 0) {
            return res.status(503).json({ error: 'No agents available' });
        }
        // Process command with AI
        const request = await aiProcessor.processNaturalLanguageCommand(command, availableAgents);
        // Override target agents if specified
        if (targetAgents && targetAgents.length > 0) {
            request.targetAgents = targetAgents;
        }
        // Send command to HTTP agents
        const results = [];
        const targetAgentNames = request.targetAgents || availableAgents.map((a) => a.agentId);
        for (const agentName of targetAgentNames) {
            try {
                // Generate correlationId for this command
                const correlationId = correlation_tracker_1.correlationTracker.generateCorrelationId();
                correlation_tracker_1.correlationTracker.startExecution(correlationId, command, agentName);
                // Use chat endpoint for natural language processing
                const result = await httpAgents.sendChatCommand(agentName, command, { correlationId, tabId });
                results.push({
                    agentId: agentName,
                    success: result.success,
                    output: result.response || result.stdout || result.error,
                    timestamp: result.timestamp,
                    correlationId
                });
            }
            catch (error) {
                results.push({
                    agentId: agentName,
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }
        res.json({
            success: true,
            requestId: request.id,
            message: 'Command sent to agents',
            targetAgents: targetAgentNames,
            results
        });
    }
    catch (error) {
        console.error('Error processing command:', error);
        // Extract full error details
        let errorMessage = 'Failed to process command';
        let errorDetails = '';
        if (error instanceof Error) {
            errorMessage = error.message;
            errorDetails = `${error.name}: ${error.message}\n\nStack trace:\n${error.stack}`;
        }
        else {
            errorDetails = JSON.stringify(error, null, 2);
        }
        res.status(500).json({
            error: `Failed to process command: ${errorMessage}`,
            errorDetails: errorDetails
        });
    }
});
// Get logs endpoint
app.get('/api/logs', async (req, res) => {
    try {
        const { exec } = await Promise.resolve().then(() => __importStar(require('child_process')));
        const { promisify } = await Promise.resolve().then(() => __importStar(require('util')));
        const execAsync = promisify(exec);
        const lines = parseInt(req.query.lines) || 100;
        const service = req.query.service || 'hub';
        let command;
        if (service === 'hub') {
            // Get hub's own logs
            command = `journalctl -u ai-hub.service -n ${lines} --no-pager`;
        }
        else {
            // Get specific service logs
            command = `journalctl -u ${service} -n ${lines} --no-pager`;
        }
        const result = await execAsync(command);
        res.json({
            service: service,
            lines: lines,
            logs: result.stdout,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        res.status(500).json({
            error: 'Failed to fetch logs',
            message: error.message
        });
    }
});
// Health check
app.get('/health', (req, res) => {
    const httpAgentStatus = httpAgents.getAgentsForApi();
    res.json({
        status: 'healthy',
        agents: httpAgentStatus.totalAgents,
        onlineAgents: httpAgentStatus.onlineAgents,
        uptime: process.uptime()
    });
});
// Hub status endpoint (similar to agent status)
app.get('/api/status', async (req, res) => {
    const packageJson = require('../../package.json');
    const versionConfig = require('../../VERSION_CONFIG.json');
    const httpAgentStatus = httpAgents.getAgentsForApi();
    res.json({
        hubId: 'backend-ai-hub',
        status: 'online',
        version: packageJson.version,
        expectedAgentVersion: versionConfig.agentVersion,
        workingDirectory: process.cwd(),
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        agents: {
            total: httpAgentStatus.totalAgents,
            online: httpAgentStatus.onlineAgents,
            offline: httpAgentStatus.totalAgents - httpAgentStatus.onlineAgents
        },
        versionConfig: {
            agentVersion: versionConfig.agentVersion,
            minimumAgentVersion: versionConfig.minimumAgentVersion,
            lastUpdated: versionConfig.lastUpdated
        }
    });
});
// Version check endpoint - returns agents that need updates
app.get('/api/version-check', async (req, res) => {
    const versionConfig = require('../../VERSION_CONFIG.json');
    const agents = httpAgents.getAgentsForApi().agents;
    const versionReport = {
        expectedVersion: versionConfig.agentVersion,
        minimumVersion: versionConfig.minimumAgentVersion,
        timestamp: new Date().toISOString(),
        agents: {
            upToDate: [],
            needsUpdate: [],
            offline: [],
            belowMinimum: []
        }
    };
    // Check each agent's version
    for (const agent of agents) {
        if (!agent.isOnline) {
            versionReport.agents.offline.push({
                name: agent.name,
                lastSeen: agent.lastSeen || 'never'
            });
            continue;
        }
        const agentInfo = {
            name: agent.name,
            currentVersion: agent.version || 'unknown',
            ip: agent.ip,
            workingDirectory: agent.workingDirectory
        };
        if (agent.version === versionConfig.agentVersion) {
            versionReport.agents.upToDate.push(agentInfo);
        }
        else {
            versionReport.agents.needsUpdate.push({
                ...agentInfo,
                updateTo: versionConfig.agentVersion
            });
            // Check if below minimum version
            if (agent.version && agent.version < versionConfig.minimumAgentVersion) {
                versionReport.agents.belowMinimum.push(agentInfo);
            }
        }
    }
    // Add summary
    const summary = {
        totalAgents: agents.length,
        upToDate: versionReport.agents.upToDate.length,
        needsUpdate: versionReport.agents.needsUpdate.length,
        offline: versionReport.agents.offline.length,
        critical: versionReport.agents.belowMinimum.length
    };
    res.json({ ...versionReport, summary });
});
// Hub auto-update endpoint
app.post('/api/autoupdate', async (req, res) => {
    try {
        const { ver } = req.query;
        const { authToken } = req.body; // Optional FileBrowser auth token
        if (!ver) {
            return res.status(400).json({ error: 'Version parameter required' });
        }
        // Configuration
        const NAS_URL = 'http://192.168.1.10:8888';
        const updateUrl = `${NAS_URL}/api/raw/${ver}/hub-${ver}.tar.gz`;
        console.log(`Starting hub auto-update to version ${ver}...`);
        // Create update script with authentication
        const updateScript = `#!/bin/bash
# Hub Auto-Update Script
cd /tmp
echo "Downloading hub update version ${ver}..."

# Download with authentication if token provided
${authToken ? `curl -sL -H "X-Auth: ${authToken}" "${updateUrl}" -o hub-update.tar.gz || exit 1` :
            `curl -sL "${updateUrl}" -o hub-update.tar.gz || exit 1`}

# Verify download
if [ ! -f hub-update.tar.gz ] || [ ! -s hub-update.tar.gz ]; then
    echo "Download failed or file is empty"
    exit 1
fi

# Hub directory
HUB_DIR="/opt/backend-ai/hub"

echo "Updating hub in $HUB_DIR..."
cd "$HUB_DIR"

# Backup current version
if [ -d dist ]; then
    mv dist dist.backup.$(date +%Y%m%d_%H%M%S)
fi

# Preserve .env file if it exists
if [ -f .env ]; then
    cp .env .env.backup
fi

# Extract update
tar -xzf /tmp/hub-update.tar.gz || exit 1

# Restore .env if it was backed up
if [ -f .env.backup ]; then
    mv .env.backup .env
fi

# Clean up
rm /tmp/hub-update.tar.gz

echo "Update complete. Hub will restart..."
`;
        // Write and execute update script
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        await execAsync(`echo '${updateScript}' > /tmp/hub-update.sh && chmod +x /tmp/hub-update.sh`);
        // Execute update in background and restart
        res.json({
            success: true,
            message: `Hub auto-update to version ${ver} started. Hub will restart shortly.`,
            version: ver,
            updateUrl: updateUrl
        });
        // Give time for response to be sent
        setTimeout(async () => {
            try {
                await execAsync('/tmp/hub-update.sh');
                console.log('Update complete, restarting hub...');
                process.exit(0); // Systemd will restart the hub
            }
            catch (error) {
                console.error('Update failed:', error);
            }
        }, 1000);
    }
    catch (error) {
        res.status(500).json({ error: 'Hub auto-update failed', message: error.message });
    }
});
// Get cached agent capabilities
app.get('/api/capabilities/:agentName', (req, res) => {
    const { agentName } = req.params;
    const capabilities = httpAgents.getCapabilitySync().getAgentCapabilities(agentName);
    if (!capabilities) {
        return res.status(404).json({ error: 'Agent capabilities not found' });
    }
    res.json(capabilities);
});
// Get specific capability README
app.get('/api/capabilities/:agentName/*', async (req, res) => {
    const { agentName } = req.params;
    const capabilityPath = req.params[0];
    const readme = await httpAgents.getCapabilitySync().getCapabilityReadme(agentName, capabilityPath);
    if (!readme) {
        return res.status(404).json({ error: 'Capability README not found' });
    }
    res.type('text/markdown').send(readme);
});
// Agent lifecycle control endpoints
app.post('/api/agents/:agentName/start', async (req, res) => {
    const { agentName } = req.params;
    const { correlationId } = req.body;
    const agent = httpAgents.getAgent(agentName);
    if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
    }
    if (!correlationId) {
        return res.status(400).json({ error: 'correlationId is required' });
    }
    console.log(`\n[HUB] Start command received for ${agentName} with correlationId: ${correlationId}`);
    // Track execution
    correlation_tracker_1.correlationTracker.startExecution(correlationId, 'start-agent', agentName);
    httpAgents.setPendingCorrelationId(agentName, correlationId);
    try {
        // Call agent manager on port 3081 with correlationId
        correlation_tracker_1.correlationTracker.addLog(correlationId, `Calling manager API at http://${agent.ip}:3081/start`);
        const response = await axios_1.default.post(`http://${agent.ip}:3081/start`, {
            correlationId
        });
        console.log(`[HUB] Manager responded for ${agentName}`);
        correlation_tracker_1.correlationTracker.addLog(correlationId, `Manager responded: ${response.data.success ? 'Success' : 'Failed'}`);
        if (response.data.output) {
            correlation_tracker_1.correlationTracker.addLog(correlationId, `Manager output: ${response.data.output}`);
        }
        res.json({ agent: agentName, correlationId, ...response.data });
    }
    catch (error) {
        console.error(`[HUB] Failed to start ${agentName}:`, error.message);
        correlation_tracker_1.correlationTracker.addLog(correlationId, `Error calling manager: ${error.message}`);
        correlation_tracker_1.correlationTracker.failExecution(correlationId, error.message);
        res.status(500).json({
            agent: agentName,
            correlationId,
            error: 'Failed to start agent',
            message: error.message
        });
    }
});
app.post('/api/agents/:agentName/stop', async (req, res) => {
    const { agentName } = req.params;
    const { correlationId } = req.body;
    const agent = httpAgents.getAgent(agentName);
    if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
    }
    if (!correlationId) {
        return res.status(400).json({ error: 'correlationId is required' });
    }
    console.log(`\n[HUB] Stop command received for ${agentName} with correlationId: ${correlationId}`);
    // Track execution
    correlation_tracker_1.correlationTracker.startExecution(correlationId, 'stop-agent', agentName);
    httpAgents.setPendingCorrelationId(agentName, correlationId);
    try {
        // Call agent manager on port 3081 with correlationId
        correlation_tracker_1.correlationTracker.addLog(correlationId, `Calling manager API at http://${agent.ip}:3081/stop`);
        const response = await axios_1.default.post(`http://${agent.ip}:3081/stop`, {
            correlationId
        });
        correlation_tracker_1.correlationTracker.addLog(correlationId, `Manager responded: ${response.data.success ? 'Success' : 'Failed'}`);
        if (response.data.output) {
            correlation_tracker_1.correlationTracker.addLog(correlationId, `Manager output: ${response.data.output}`);
        }
        res.json({ agent: agentName, correlationId, ...response.data });
    }
    catch (error) {
        correlation_tracker_1.correlationTracker.addLog(correlationId, `Error calling manager: ${error.message}`);
        correlation_tracker_1.correlationTracker.failExecution(correlationId, error.message);
        res.status(500).json({
            agent: agentName,
            correlationId,
            error: 'Failed to stop agent',
            message: error.message
        });
    }
});
app.get('/api/agents/:agentName/manager-status', async (req, res) => {
    const { agentName } = req.params;
    const agent = httpAgents.getAgent(agentName);
    if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
    }
    try {
        // Check both manager and agent status
        const managerResponse = await axios_1.default.get(`http://${agent.ip}:3081/status`);
        res.json({
            agent: agentName,
            manager: 'online',
            agentRunning: managerResponse.data.running
        });
    }
    catch (error) {
        res.json({
            agent: agentName,
            manager: 'offline',
            agentRunning: agent.isOnline,
            note: 'Manager not installed, using direct status'
        });
    }
});
// SSE endpoint for execution status updates
app.get('/api/executions/stream', (req, res) => {
    // Set headers for SSE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });
    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    // Listen for execution updates from correlationTracker
    const updateHandler = (execution) => {
        res.write(`data: ${JSON.stringify(execution)}\n\n`);
    };
    // Add both event handlers
    correlation_tracker_1.correlationTracker.on('executionUpdate', updateHandler);
    correlation_tracker_1.correlationTracker.on('execution-update', updateHandler);
    // Handle client disconnect
    req.on('close', () => {
        correlation_tracker_1.correlationTracker.removeListener('executionUpdate', updateHandler);
        correlation_tracker_1.correlationTracker.removeListener('execution-update', updateHandler);
    });
});
// Start server
app.listen(PORT, () => {
    console.log(`
🚀 ${config.system.name} Hub Started
============================================
Version: ${config.system.version}
API Server: http://${config.hub.ip}:${PORT}
Agent Polling: Active (30s interval)

Available Endpoints:
- GET  /              - Web UI
- GET  /api/agents    - List all agents
- POST /api/command   - Execute natural language command
- POST /api/command/v2 - Enhanced command API
- GET  /api/health    - Hub health status
- POST /api/notifications - Receive agent notifications

Pure HTTP/REST architecture.
  `);
});
// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    httpAgents.stop();
    process.exit(0);
});
//# sourceMappingURL=index.js.map