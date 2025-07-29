#!/usr/bin/env node

console.log('[STARTUP] Process started at', new Date().toISOString());
const processStart = Date.now();

import { StartupProfiler } from './startup-profiler';
const profiler = new StartupProfiler();
profiler.mark('Initial imports started');

import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import * as si from 'systeminformation';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import path from 'path';
import { CapabilitiesManager } from './capabilities-manager';

profiler.mark('Imports completed');

// Load environment variables
dotenv.config();
profiler.mark('Environment loaded');

const execAsync = promisify(exec);
const app = express();
const PORT = parseInt(process.env.PORT || '3080');
const AGENT_ID = process.env.AGENT_ID || `agent-${require('os').hostname()}`;
const HUB_URL = process.env.HUB_URL || 'http://192.168.1.30';

// Initialize capabilities manager
profiler.mark('Initializing capabilities manager');
const capabilitiesManager = new CapabilitiesManager();
profiler.mark('Capabilities manager initialized');

// Command tracking
const activeCommands = new Map<string, any>();

profiler.mark('Setting up Express middleware');
app.use(express.json());

// Serve static files from gui directory
app.use(express.static(path.join(__dirname, '../../gui')));
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
    } catch (error: any) {
        res.status(404).json({ error: error.message });
    }
});

// Command execution with request ID tracking
app.post('/api/execute', async (req, res) => {
    const { command, requestId = uuidv4(), async = false } = req.body;
    
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
    } else {
        // Execute synchronously
        try {
            const result = await executeCommand(parsedCommand);
            
            res.json({
                requestId,
                success: true,
                ...result,
                timestamp: new Date().toISOString()
            });
        } catch (error: any) {
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
    } catch (error) {
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
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get logs endpoint
app.get('/api/logs', async (req, res) => {
    try {
        const lines = parseInt(req.query.lines as string) || 100;
        const service = req.query.service as string;
        
        let command: string;
        if (service === 'agent') {
            // Get agent's own logs (systemd)
            command = `journalctl -u ai-agent.service -n ${lines} --no-pager`;
        } else if (service) {
            // Get specific service logs
            command = `journalctl -u ${service} -n ${lines} --no-pager`;
        } else {
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
    } catch (error: any) {
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

async function discoverServices(): Promise<string[]> {
    const services: string[] = [];
    const commonServices = ['nginx', 'apache2', 'mysql', 'postgresql', 'redis', 'docker', 'ssh', 'systemd'];
    
    for (const service of commonServices) {
        try {
            const { stdout } = await execAsync(`which ${service} 2>/dev/null || systemctl is-enabled ${service} 2>/dev/null || service ${service} status 2>/dev/null`);
            if (stdout.trim()) {
                services.push(service);
            }
        } catch {
            // Service not found
        }
    }
    
    return services;
}

function determineAgentType(platform: string): string {
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

async function isProxmox(): Promise<boolean> {
    try {
        const { stdout } = await execAsync('test -f /etc/pve/version && echo "true"');
        return stdout.trim() === 'true';
    } catch {
        return false;
    }
}

function generateExamples(services: string[]): string[] {
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

async function parseCommand(command: string): Promise<any> {
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

function extractServiceName(command: string): string {
    const words = command.split(' ');
    const serviceIndex = words.findIndex(w => ['nginx', 'apache', 'mysql', 'docker', 'redis'].includes(w.toLowerCase()));
    return serviceIndex >= 0 ? words[serviceIndex] : 'unknown';
}

async function executeCommand(parsed: any): Promise<any> {
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

async function executeCommandAsync(parsed: any, requestId: string): Promise<void> {
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
    } catch (error: any) {
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

async function getServiceStatus(): Promise<any[]> {
    const services = await discoverServices();
    const statuses = [];
    
    for (const service of services) {
        try {
            const { stdout } = await execAsync(`systemctl is-active ${service} 2>/dev/null || service ${service} status 2>/dev/null | grep -q running && echo active || echo inactive`);
            statuses.push({
                name: service,
                status: stdout.trim() === 'active' ? 'running' : 'stopped'
            });
        } catch {
            statuses.push({
                name: service,
                status: 'unknown'
            });
        }
    }
    
    return statuses;
}

async function manageService(service: string, action: string): Promise<any> {
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

async function notifyHub(type: string, data: any): Promise<void> {
    try {
        await axios.post(`${HUB_URL}/api/notifications`, {
            type,
            agentId: AGENT_ID,
            timestamp: new Date().toISOString(),
            ...data
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
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
    } catch (error) {
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