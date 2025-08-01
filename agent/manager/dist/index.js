#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const axios_1 = __importDefault(require("axios"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const shared_1 = require("@proxmox-ai-control/shared");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const app = (0, express_1.default)();
// Load configuration
const configLoader = shared_1.ConfigLoader.getInstance();
let config;
let myAgent;
let serviceManager;
try {
    config = configLoader.getConfig();
    myAgent = configLoader.getMyAgent();
    serviceManager = configLoader.getMyServiceManager();
    console.log(`Manager loaded configuration for agent: ${myAgent.name}`);
}
catch (error) {
    console.error('Failed to load configuration:', error);
    process.exit(1);
}
const PORT = configLoader.getManagerPort();
const MANAGER_VERSION = config.system.version || 'unknown';
app.use(express_1.default.json());
// Configuration values
const AGENT_DIR = config.defaults.agent.installPath;
const SERVICE_NAME = config.defaults.agent.serviceName;
const HUB_URL = configLoader.getHubUrl();
// Status endpoint
app.get('/status', async (req, res) => {
    let isRunning = false;
    let managerVersion = 'unknown';
    try {
        // Check if agent process is running
        const { stdout } = await execAsync(`systemctl is-active ${SERVICE_NAME}`);
        isRunning = stdout.trim() === 'active';
    }
    catch (error) {
        // Service not running or systemctl not available
        isRunning = false;
    }
    // Use hard-coded version for now
    managerVersion = MANAGER_VERSION;
    res.json({
        running: isRunning,
        managerVersion: managerVersion,
        workingDirectory: process.cwd()
    });
});
// Start agent
app.post('/start', async (req, res) => {
    const correlationId = req.body?.correlationId;
    if (!correlationId) {
        return res.status(400).json({
            success: false,
            error: 'correlationId is required'
        });
    }
    console.log(`[${correlationId}] Starting agent...`);
    try {
        // Use the start wrapper script that handles correlationId
        // Check if this is a systemd or rc.d system
        const isSystemd = await promises_1.default.access('/etc/systemd/system').then(() => true).catch(() => false);
        const startScript = isSystemd
            ? '/opt/ai-agent/ai-agent-start.sh'
            : '/opt/ai-agent/rc.d/ai-agent-start.sh';
        try {
            await execAsync(`${startScript} "${correlationId}"`);
            console.log(`[${correlationId}] Agent started via wrapper script`);
        }
        catch (error) {
            // Fallback: write correlationId file and use standard service command
            const CORRELATION_FILE = path_1.default.join(AGENT_DIR, '.correlationId');
            await promises_1.default.writeFile(CORRELATION_FILE, correlationId, 'utf8');
            const startCommand = serviceManager.commands.start.replace('{service}', SERVICE_NAME);
            await execAsync(startCommand);
            console.log(`[${correlationId}] Agent started via service command`);
        }
        // Notify hub of completion
        notifyHubCompletion(correlationId, { success: true });
        res.json({ success: true, correlationId });
    }
    catch (error) {
        console.error(`[${correlationId}] Failed to start agent:`, error.message);
        notifyHubCompletion(correlationId, { success: false, error: error.message });
        res.status(500).json({
            success: false,
            error: error.message,
            correlationId
        });
    }
});
// Stop agent
app.post('/stop', async (req, res) => {
    const correlationId = req.body?.correlationId;
    if (!correlationId) {
        return res.status(400).json({
            success: false,
            error: 'correlationId is required'
        });
    }
    console.log(`[${correlationId}] Stopping agent...`);
    try {
        // Use service manager command to stop agent
        const stopCommand = serviceManager.commands.stop.replace('{service}', SERVICE_NAME);
        await execAsync(stopCommand);
        console.log(`[${correlationId}] Agent stopped via service manager`);
        // Notify hub of completion
        notifyHubCompletion(correlationId, { success: true });
        res.json({ success: true, correlationId });
    }
    catch (error) {
        console.error(`[${correlationId}] Failed to stop agent:`, error.message);
        notifyHubCompletion(correlationId, { success: false, error: error.message });
        res.status(500).json({
            success: false,
            error: error.message,
            correlationId
        });
    }
});
// Restart agent
app.post('/restart', async (req, res) => {
    const correlationId = req.body?.correlationId;
    if (!correlationId) {
        return res.status(400).json({
            success: false,
            error: 'correlationId is required'
        });
    }
    console.log(`[${correlationId}] Restarting agent...`);
    try {
        // For restart, we need to stop first then start with correlationId
        const stopCommand = serviceManager.commands.stop.replace('{service}', SERVICE_NAME);
        await execAsync(stopCommand);
        await execAsync('sleep 2');
        // Use the start wrapper script that handles correlationId
        const isSystemd = await promises_1.default.access('/etc/systemd/system').then(() => true).catch(() => false);
        const startScript = isSystemd
            ? '/opt/ai-agent/ai-agent-start.sh'
            : '/opt/ai-agent/rc.d/ai-agent-start.sh';
        await execAsync(`${startScript} "${correlationId}"`);
        console.log(`[${correlationId}] Agent restarted with correlationId`);
        // Notify hub of completion
        notifyHubCompletion(correlationId, { success: true });
        res.json({ success: true, correlationId });
    }
    catch (error) {
        console.error(`[${correlationId}] Failed to restart agent:`, error.message);
        notifyHubCompletion(correlationId, { success: false, error: error.message });
        res.status(500).json({
            success: false,
            error: error.message,
            correlationId
        });
    }
});
// Get logs
app.get('/logs', async (req, res) => {
    try {
        const { stdout } = await execAsync(`journalctl -u ${SERVICE_NAME} -n 100 --no-pager`);
        res.type('text/plain').send(stdout);
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// Get agent version
app.get('/version', async (req, res) => {
    try {
        const agentPackageJson = require(path_1.default.join(AGENT_DIR, 'package.json'));
        res.json({
            agentVersion: agentPackageJson.version,
            agentName: agentPackageJson.name,
            managerVersion: MANAGER_VERSION,
            managerName: '@backend-ai/agent-manager'
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// Clear our own port before starting
console.log('Checking port availability...');
try {
    const { execSync } = require('child_process');
    const portInUse = execSync(`lsof -ti:${PORT} || true`, { encoding: 'utf8' }).trim();
    if (portInUse) {
        console.log(`Port ${PORT} is in use by PID ${portInUse}, killing it...`);
        try {
            execSync(`kill -9 ${portInUse}`);
            // Give it a moment to release the port
            execSync('sleep 1');
            console.log(`Port ${PORT} cleared`);
        }
        catch (killErr) {
            console.error(`Failed to kill process: ${killErr}`);
            console.log('Continuing anyway...');
        }
    }
    else {
        console.log(`Port ${PORT} is available`);
    }
}
catch (err) {
    console.log(`Port check failed: ${err}, continuing anyway...`);
}
// Helper function to notify hub of command completion
async function notifyHubCompletion(correlationId, result) {
    if (!correlationId || correlationId.startsWith('mgr_')) {
        // Don't notify for locally generated IDs
        return;
    }
    try {
        const endpoint = result.success ? 'complete' : 'fail';
        await axios_1.default.post(`${HUB_URL}/api/executions/${correlationId}/${endpoint}`, result.success ? { result } : { error: result.error }, { timeout: 5000 });
        console.log(`[${correlationId}] Notified hub of ${endpoint}`);
    }
    catch (error) {
        console.error(`[${correlationId}] Failed to notify hub:`, error);
    }
}
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Agent manager listening on port ${PORT}`);
    console.log('Available endpoints:');
    console.log('  GET  /status  - Check agent status');
    console.log('  POST /start   - Start agent (with optional correlationId)');
    console.log('  POST /stop    - Stop agent (with optional correlationId)');
    console.log('  POST /restart - Restart agent (with optional correlationId)');
    console.log('  GET  /version - Get agent version');
    console.log('  GET  /logs    - Get agent logs');
    // Check if we were started with a correlationId (from environment or temp file)
    let correlationId = process.env.CORRELATION_ID;
    let agentName = process.env.AGENT_NAME || myAgent.name;
    // If not in environment, check temp files (used by wrapper scripts)
    if (!correlationId) {
        try {
            correlationId = (await promises_1.default.readFile('/tmp/ai-agent-manager.correlationId', 'utf8')).trim();
            console.log(`Found correlationId in temp file: ${correlationId}`);
        }
        catch (error) {
            // No temp file, that's okay
        }
    }
    // Check for agent name in temp file
    try {
        const tempAgentName = (await promises_1.default.readFile('/tmp/ai-agent-manager.agentName', 'utf8')).trim();
        if (tempAgentName && tempAgentName !== 'unknown') {
            agentName = tempAgentName;
            console.log(`Found agentName in temp file: ${agentName}`);
        }
    }
    catch (error) {
        // No temp file, use default
    }
    if (correlationId) {
        console.log(`Manager started with correlationId: ${correlationId}`);
        // Send callback to hub that manager has started successfully
        try {
            await axios_1.default.post(`${HUB_URL}/api/executions/${correlationId}/complete`, {
                result: `Manager started successfully on ${agentName}`,
                agentId: agentName,
                agentName: agentName,
                detectedBy: 'manager-startup'
            }, { timeout: 5000 });
            console.log(`Notified hub of manager startup completion`);
        }
        catch (error) {
            console.error(`Failed to notify hub of manager startup:`, error);
        }
    }
});
