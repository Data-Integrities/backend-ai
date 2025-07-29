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
console.log('[STARTUP] Process started at', new Date().toISOString());
const processStart = Date.now();
const startup_profiler_1 = require("./startup-profiler");
const profiler = new startup_profiler_1.StartupProfiler();
profiler.mark('Initial imports started');
const express_1 = __importDefault(require("express"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const dotenv_1 = __importDefault(require("dotenv"));
const si = __importStar(require("systeminformation"));
const uuid_1 = require("uuid");
const axios_1 = __importDefault(require("axios"));
const path_1 = __importDefault(require("path"));
const capabilities_manager_1 = require("./capabilities-manager");
profiler.mark('Imports completed');
// Load environment variables
dotenv_1.default.config();
profiler.mark('Environment loaded');
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || '3080');
const AGENT_ID = process.env.AGENT_ID || `agent-${require('os').hostname()}`;
const HUB_URL = process.env.HUB_URL || 'http://192.168.1.30';
// Initialize capabilities manager
profiler.mark('Initializing capabilities manager');
const capabilitiesManager = new capabilities_manager_1.CapabilitiesManager();
profiler.mark('Capabilities manager initialized');
// Command tracking
const activeCommands = new Map();
profiler.mark('Setting up Express middleware');
app.use(express_1.default.json());
// Serve static files from gui directory
app.use(express_1.default.static(path_1.default.join(__dirname, '../../gui')));
profiler.mark('Express middleware configured');
// No authentication - internal infrastructure only
profiler.mark('Registering API routes');
// Status endpoint with full system info
app.get('/api/status', async (req, res) => {
    const osInfo = await si.osInfo();
    const currentLoad = await si.currentLoad();
    const mem = await si.mem();
    const diskLayout = await si.diskLayout();
    const packageJson = require('../../package.json');
    res.json({
        agentId: AGENT_ID,
        status: 'online',
        version: packageJson.version,
        workingDirectory: process.cwd(),
        platform: osInfo.platform,
        hostname: osInfo.hostname,
        timestamp: new Date().toISOString(),
        system: {
            os: osInfo.distro,
            kernel: osInfo.kernel,
            arch: osInfo.arch,
            uptime: process.uptime()
        },
        resources: {
            cpu: {
                usage: currentLoad.currentLoad,
                cores: currentLoad.cpus.length
            },
            memory: {
                total: mem.total,
                used: mem.used,
                free: mem.free,
                percentage: (mem.used / mem.total) * 100
            },
            disk: diskLayout.map(disk => ({
                device: disk.device,
                size: disk.size,
                type: disk.type
            }))
        }
    });
});
// Enhanced capabilities endpoint with service discovery and README system
app.get('/api/capabilities', async (req, res) => {
    const services = await discoverServices();
    const osInfo = await si.osInfo();
    const { includeContent } = req.query;
    // Get README-based capabilities
    const capabilitiesData = await capabilitiesManager.getCapabilities(includeContent === 'true');
    res.json({
        agentId: AGENT_ID,
        type: determineAgentType(osInfo.platform),
        summary: `${osInfo.platform} host with ${services.join(', ')} services`,
        capabilities: {
            docker: services.includes('docker'),
            systemd: osInfo.platform === 'linux',
            filesystem: true,
            proxmox: await isProxmox()
        },
        services: services,
        supportedCommands: [
            'service', 'config', 'debug', 'system', 'network', 'file', 'process'
        ],
        description: `Agent running on ${osInfo.distro} ${osInfo.release}`,
        examples: generateExamples(services),
        // New README-based capabilities
        modules: capabilitiesData.capabilities,
        capabilitiesHash: capabilitiesData.hash,
        capabilitiesLastUpdated: capabilitiesData.lastUpdated
    });
});
// Get specific capability README
app.get('/api/capabilities/:path(*)', async (req, res) => {
    try {
        const readmeContent = await capabilitiesManager.getCapabilityReadme(req.params.path);
        res.type('text/markdown').send(readmeContent);
    }
    catch (error) {
        res.status(404).json({ error: error.message });
    }
});
// Command execution with request ID tracking
app.post('/api/execute', async (req, res) => {
    const { command, requestId = (0, uuid_1.v4)(), async = false } = req.body;
    if (!command) {
        return res.status(400).json({ error: 'Command required' });
    }
    // Parse command if it's a high-level command
    const parsedCommand = await parseCommand(command);
    if (async) {
        // Start async execution
        executeCommandAsync(parsedCommand, requestId);
        res.json({
            requestId,
            status: 'accepted',
            message: 'Command accepted for async execution'
        });
    }
    else {
        // Execute synchronously
        try {
            const result = await executeCommand(parsedCommand);
            res.json({
                requestId,
                success: true,
                ...result,
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            res.json({
                requestId,
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
});
// Get command status/result
app.get('/api/command/:requestId', (req, res) => {
    const { requestId } = req.params;
    const command = activeCommands.get(requestId);
    if (!command) {
        return res.status(404).json({ error: 'Command not found' });
    }
    res.json(command);
});
// Event notification endpoint - agent can POST events to hub
app.post('/api/events', async (req, res) => {
    const event = req.body;
    try {
        // Send event to hub
        await notifyHub('event', event);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to send event to hub' });
    }
});
// Service management endpoints
app.get('/api/services', async (req, res) => {
    const services = await getServiceStatus();
    res.json(services);
});
app.post('/api/services/:service/:action', async (req, res) => {
    const { service, action } = req.params;
    if (!['start', 'stop', 'restart', 'status'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action' });
    }
    try {
        const result = await manageService(service, action);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get logs endpoint
app.get('/api/logs', async (req, res) => {
    try {
        const lines = parseInt(req.query.lines) || 100;
        const service = req.query.service;
        let command;
        if (service === 'agent') {
            // Get agent's own logs (systemd)
            command = `journalctl -u ai-agent.service -n ${lines} --no-pager`;
        }
        else if (service) {
            // Get specific service logs
            command = `journalctl -u ${service} -n ${lines} --no-pager`;
        }
        else {
            // Get system logs
            command = `journalctl -n ${lines} --no-pager`;
        }
        const result = await execAsync(command);
        res.json({
            service: service || 'system',
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
// Update functionality removed - handled by agent manager
// Version endpoint
app.get('/api/version', (req, res) => {
    const packageJson = require('../../package.json');
    res.json({
        version: packageJson.version,
        name: packageJson.name,
        agentId: AGENT_ID,
        buildTime: process.env.BUILD_TIME || 'unknown'
    });
});
// Health check
app.get('/health', (req, res) => {
    res.send('OK');
});
// Helper functions
async function discoverServices() {
    const services = [];
    const commonServices = ['nginx', 'apache2', 'mysql', 'postgresql', 'redis', 'docker', 'ssh', 'systemd'];
    for (const service of commonServices) {
        try {
            const { stdout } = await execAsync(`which ${service} 2>/dev/null || systemctl is-enabled ${service} 2>/dev/null || service ${service} status 2>/dev/null`);
            if (stdout.trim()) {
                services.push(service);
            }
        }
        catch {
            // Service not found
        }
    }
    return services;
}
function determineAgentType(platform) {
    if (process.env.AGENT_TYPE) {
        return process.env.AGENT_TYPE;
    }
    // Auto-detect based on platform and environment
    if (platform === 'linux') {
        if (process.env.container === 'docker') {
            return 'docker-container';
        }
        return 'linux-host';
    }
    return platform;
}
async function isProxmox() {
    try {
        const { stdout } = await execAsync('test -f /etc/pve/version && echo "true"');
        return stdout.trim() === 'true';
    }
    catch {
        return false;
    }
}
function generateExamples(services) {
    const examples = ['Check system status', 'View logs'];
    if (services.includes('docker')) {
        examples.push('List Docker containers', 'Manage Docker services');
    }
    if (services.includes('nginx')) {
        examples.push('Check nginx configuration', 'Reload nginx');
    }
    if (services.includes('mysql')) {
        examples.push('Check MySQL status', 'View MySQL logs');
    }
    return examples;
}
async function parseCommand(command) {
    // If it's already a shell command, return as-is
    if (command.startsWith('/') || command.includes('|') || command.includes('>')) {
        return { type: 'shell', command };
    }
    // Parse high-level commands
    const lowerCommand = command.toLowerCase();
    if (lowerCommand.includes('restart') && lowerCommand.includes('service')) {
        const service = extractServiceName(command);
        return { type: 'service', action: 'restart', service };
    }
    if (lowerCommand.includes('check') && lowerCommand.includes('logs')) {
        const service = extractServiceName(command);
        return { type: 'logs', service };
    }
    if (lowerCommand.includes('docker') && lowerCommand.includes('container')) {
        return { type: 'shell', command: 'docker ps -a' };
    }
    // Default to shell command
    return { type: 'shell', command };
}
function extractServiceName(command) {
    const words = command.split(' ');
    const serviceIndex = words.findIndex(w => ['nginx', 'apache', 'mysql', 'docker', 'redis'].includes(w.toLowerCase()));
    return serviceIndex >= 0 ? words[serviceIndex] : 'unknown';
}
async function executeCommand(parsed) {
    switch (parsed.type) {
        case 'service':
            return await manageService(parsed.service, parsed.action);
        case 'logs':
            const logsCommand = `journalctl -u ${parsed.service} -n 50 --no-pager || tail -50 /var/log/${parsed.service}/*.log`;
            const { stdout, stderr } = await execAsync(logsCommand);
            return { stdout, stderr };
        case 'shell':
        default:
            const result = await execAsync(parsed.command);
            return result;
    }
}
async function executeCommandAsync(parsed, requestId) {
    activeCommands.set(requestId, {
        requestId,
        status: 'running',
        startTime: new Date().toISOString()
    });
    try {
        const result = await executeCommand(parsed);
        activeCommands.set(requestId, {
            requestId,
            status: 'completed',
            success: true,
            ...result,
            startTime: activeCommands.get(requestId).startTime,
            endTime: new Date().toISOString()
        });
        // Notify hub of completion
        await notifyHub('command-result', {
            requestId,
            agentId: AGENT_ID,
            success: true,
            ...result
        });
    }
    catch (error) {
        activeCommands.set(requestId, {
            requestId,
            status: 'failed',
            success: false,
            error: error.message,
            startTime: activeCommands.get(requestId).startTime,
            endTime: new Date().toISOString()
        });
        // Notify hub of failure
        await notifyHub('command-result', {
            requestId,
            agentId: AGENT_ID,
            success: false,
            error: error.message
        });
    }
}
async function getServiceStatus() {
    const services = await discoverServices();
    const statuses = [];
    for (const service of services) {
        try {
            const { stdout } = await execAsync(`systemctl is-active ${service} 2>/dev/null || service ${service} status 2>/dev/null | grep -q running && echo active || echo inactive`);
            statuses.push({
                name: service,
                status: stdout.trim() === 'active' ? 'running' : 'stopped'
            });
        }
        catch {
            statuses.push({
                name: service,
                status: 'unknown'
            });
        }
    }
    return statuses;
}
async function manageService(service, action) {
    let command = '';
    switch (action) {
        case 'start':
            command = `systemctl start ${service} || service ${service} start`;
            break;
        case 'stop':
            command = `systemctl stop ${service} || service ${service} stop`;
            break;
        case 'restart':
            command = `systemctl restart ${service} || service ${service} restart`;
            break;
        case 'status':
            command = `systemctl status ${service} || service ${service} status`;
            break;
    }
    const { stdout, stderr } = await execAsync(command);
    return {
        service,
        action,
        success: !stderr || stderr.length === 0,
        output: stdout,
        error: stderr
    };
}
async function notifyHub(type, data) {
    try {
        await axios_1.default.post(`${HUB_URL}/api/notifications`, {
            type,
            agentId: AGENT_ID,
            timestamp: new Date().toISOString(),
            ...data
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
    catch (error) {
        console.error('Failed to notify hub:', error);
    }
}
// Monitor system and send events
setInterval(async () => {
    const currentLoad = await si.currentLoad();
    const mem = await si.mem();
    // Check for high resource usage
    if (currentLoad.currentLoad > 80) {
        await notifyHub('event', {
            severity: 'warning',
            message: `High CPU usage: ${currentLoad.currentLoad.toFixed(1)}%`,
            resource: 'cpu',
            value: currentLoad.currentLoad
        });
    }
    const memUsage = (mem.used / mem.total) * 100;
    if (memUsage > 85) {
        await notifyHub('event', {
            severity: 'warning',
            message: `High memory usage: ${memUsage.toFixed(1)}%`,
            resource: 'memory',
            value: memUsage
        });
    }
}, 60000); // Check every minute
profiler.mark('All routes registered');
// Start server
profiler.mark('Starting Express server');
app.listen(PORT, '0.0.0.0', async () => {
    profiler.mark('Express server listening');
    console.log(`Enhanced HTTP Agent ${AGENT_ID} listening on port ${PORT}`);
    console.log(`Hub URL: ${HUB_URL}`);
    console.log('Features: Authentication, Service Discovery, Command Parsing, Event Notifications');
    // Send initial registration to hub
    profiler.mark('Notifying hub - start');
    try {
        await notifyHub('agent-online', {
            capabilities: 'full'
        });
        profiler.mark('Hub notified successfully');
    }
    catch (error) {
        profiler.mark('Hub notification failed');
        console.error('Failed to notify hub:', error);
    }
    // Print final startup report
    const report = profiler.getReport();
    console.log('\n=== STARTUP PROFILING REPORT ===');
    console.log(`Total startup time: ${report.totalStartupTime}ms`);
    console.log('\nBreakdown:');
    report.events.forEach(e => {
        console.log(`  ${e.name}: ${e.duration}ms`);
    });
    console.log('================================\n');
});
// Handle shutdown
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, notifying hub and shutting down');
    await notifyHub('agent-offline', {});
    process.exit(0);
});
process.on('SIGINT', async () => {
    console.log('Received SIGINT, notifying hub and shutting down');
    await notifyHub('agent-offline', {});
    process.exit(0);
});
//# sourceMappingURL=index-profiled.js.map