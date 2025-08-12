#!/usr/bin/env node

// Startup logging based on verbosity level
const startTime = Date.now();
const STARTUP_VERBOSITY = parseInt(process.env.STARTUP_VERBOSITY || '0');
const startupLog = (level: number, msg: string) => {
    if (STARTUP_VERBOSITY >= level) {
        const elapsed = Date.now() - startTime;
        console.log(`[STARTUP ${elapsed}ms] ${msg}`);
    }
};

// Verbosity levels:
// 0 = Silent (default)
// 1 = Basic milestones
// 2 = Detailed progress
// 3 = Debug everything

startupLog(1, `Process started with verbosity level ${STARTUP_VERBOSITY}`);
startupLog(2, `Node ${process.version}, PID ${process.pid}`);
startupLog(3, `Working directory: ${process.cwd()}`);

import express from 'express';
startupLog(2, 'Express imported');

import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
startupLog(3, 'Basic utilities imported');

import * as si from 'systeminformation';
startupLog(2, 'Systeminformation imported');

import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { CapabilitiesManager } from './capabilities-manager';
import { CapabilityLoader } from './capability-loader';
import { ConfigLoader, LogManager } from '@proxmox-ai-control/shared';
import { AgentAICommandProcessor } from './ai-command-processor';
startupLog(1, 'All imports complete');

// Load environment variables
dotenv.config();
startupLog(2, 'Environment variables loaded');

const execAsync = promisify(exec);
const app = express();

// Load configuration
const configLoader = ConfigLoader.getInstance();
let config: any;
let myAgent: any;
try {
    config = configLoader.getConfig();
    myAgent = configLoader.getMyAgent();
    startupLog(1, `Loaded configuration for agent: ${myAgent.name}`);
} catch (error) {
    console.error('Failed to load configuration:', error);
    process.exit(1);
}

const PORT = configLoader.getAgentPort();
const AGENT_ID = process.env.AGENT_NAME || myAgent?.name || 'unknown';
const HUB_URL = configLoader.getHubUrl();
const AGENT_DIR = config.defaults.agent.installPath;

// Initialize logging with local directory
(async () => {
    try {
        const retentionDays = config?.defaults?.logging?.retentionDays || 5;
        const logManager = new LogManager(
            __dirname,
            'agent.log',
            retentionDays
        );
        const logPath = await logManager.initialize();
        startupLog(1, `Agent logging initialized at: ${logPath}`);
        
        // Redirect stdout and stderr to the log file
        if (process.stdout.isTTY) {
            startupLog(2, 'Running in TTY mode, keeping console output');
        } else {
            startupLog(2, `Redirecting output to: ${logPath}`);
            const logStream = fs.createWriteStream(logPath, { flags: 'a' });
            process.stdout.write = process.stderr.write = logStream.write.bind(logStream);
        }
    } catch (error) {
        startupLog(1, `Failed to initialize local logging: ${error}`);
    }
})();

// Read correlationId from command-line argument
let CORRELATION_ID: string | undefined = process.argv[2];
if (CORRELATION_ID) {
    startupLog(1, `Starting with correlationId: ${CORRELATION_ID}`);
}

// Keep two copies for dual-memory approach
let CORRELATION_ID_FOR_CALLBACK: string | undefined = CORRELATION_ID;
let CORRELATION_ID_FOR_POLLING: string | undefined = CORRELATION_ID;

startupLog(2, `Configuration: PORT=${PORT}, AGENT_ID=${AGENT_ID}`);
if (CORRELATION_ID) {
    startupLog(1, `Starting with correlationId: ${CORRELATION_ID}`);
}
startupLog(3, `HUB_URL=${HUB_URL}`);

// Initialize capabilities manager
startupLog(2, 'Initializing capabilities manager...');
const capabilitiesManager = new CapabilitiesManager();
startupLog(2, 'Capabilities manager initialized');

const capabilityLoader = new CapabilityLoader();
startupLog(2, 'Capability loader initialized');

// Initialize AI command processor
let aiProcessor: AgentAICommandProcessor | null = null;
try {
    // Load the main backend-ai-config.json which is already loaded by ConfigLoader
    const mainConfig = config;
    
    if (mainConfig?.anthropic?.apiKey) {
        startupLog(2, 'Initializing AI command processor...');
        console.log(`API key type: ${typeof mainConfig.anthropic.apiKey}, length: ${mainConfig.anthropic.apiKey.length}`);
        console.log(`API key starts with: ${mainConfig.anthropic.apiKey.substring(0, 20)}...`);
        aiProcessor = new AgentAICommandProcessor(mainConfig.anthropic.apiKey, capabilitiesManager);
        startupLog(1, 'AI command processor initialized with natural language capabilities');
    } else {
        console.warn('No Anthropic API key found in backend-ai-config.json');
    }
} catch (error) {
    console.error('Failed to initialize AI processor:', error);
    console.warn('Agent will operate without AI capabilities');
}

// Command tracking
const activeCommands = new Map<string, any>();

startupLog(2, 'Configuring Express middleware...');
app.use(express.json());

// Serve static files from gui directory
app.use(express.static(path.join(__dirname, '../../gui')));
startupLog(2, 'Express middleware configured');

// No authentication - internal infrastructure only

// Status endpoint with full system info
app.get('/api/status', async (req, res) => {
    const osInfo = await si.osInfo();
    const currentLoad = await si.currentLoad();
    const mem = await si.mem();
    const diskLayout = await si.diskLayout();
    const packageJson = require('../../package.json');
    
    res.json({
        agentId: AGENT_ID,
        agentName: AGENT_ID,  // Add agentName for compatibility
        status: 'online',
        version: packageJson.version,
        workingDirectory: process.cwd(),
        platform: osInfo.platform,
        hostname: osInfo.hostname,
        timestamp: new Date().toISOString(),
        correlationId: CORRELATION_ID_FOR_POLLING,
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

// Acknowledge correlationId receipt from hub
app.post('/api/correlation/acknowledge', async (req, res) => {
    const { correlationId } = req.body;
    
    if (correlationId === CORRELATION_ID_FOR_POLLING) {
        console.log(`[CORRELATION] Hub acknowledged receipt of ${correlationId}, clearing from polling memory`);
        CORRELATION_ID_FOR_POLLING = undefined;
        res.json({ success: true, message: 'Correlation acknowledged' });
    } else {
        res.json({ success: false, message: 'Correlation not found or already cleared' });
    }
});

// Command execution with request ID tracking
app.post('/api/execute', async (req, res) => {
    const { command, requestId = uuidv4(), async = false, correlationId } = req.body;
    
    if (!command) {
        return res.status(400).json({ error: 'Command required' });
    }
    
    // Parse command if it's a high-level command
    const parsedCommand = await parseCommand(command);
    
    if (async) {
        // Start async execution
        executeCommandAsync(parsedCommand, requestId, correlationId);
        
        res.json({
            requestId,
            status: 'accepted',
            message: 'Command accepted for async execution'
        });
    } else {
        // Execute synchronously
        try {
            const result = await executeCommand(parsedCommand, correlationId);
            
            // If we have a correlationId, notify hub of completion
            if (correlationId) {
                try {
                    await axios.post(`${HUB_URL}/api/executions/${correlationId}/complete`, {
                        result: {
                            ...result,
                            requestId,
                            agent: AGENT_ID,
                            timestamp: new Date().toISOString()
                        }
                    });
                } catch (err) {
                    console.error(`Failed to notify hub of completion for ${correlationId}:`, err);
                }
            }
            
            res.json({
                requestId,
                success: true,
                ...result,
                timestamp: new Date().toISOString()
            });
        } catch (error: any) {
            // If we have a correlationId, notify hub of failure
            if (correlationId) {
                try {
                    await axios.post(`${HUB_URL}/api/executions/${correlationId}/fail`, {
                        error: error.message
                    });
                } catch (err) {
                    console.error(`Failed to notify hub of failure for ${correlationId}:`, err);
                }
            }
            
            res.json({
                requestId,
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
});

// AI Chat endpoint - processes natural language commands
app.post('/api/chat', async (req, res) => {
    const { command, correlationId, skipConfirmation = false, tabId } = req.body;
    
    if (!command) {
        return res.status(400).json({ error: 'Command required' });
    }
    
    if (!aiProcessor) {
        return res.status(503).json({ 
            error: 'AI processor not initialized',
            message: 'This agent does not have AI capabilities configured'
        });
    }
    
    try {
        console.log(`[CHAT] Processing natural language: ${command}`);
        
        // Use AI to process the natural language command and get natural language response
        const response = await aiProcessor.processNaturalLanguageCommand(command);
        console.log(`[CHAT] AI response received`);
        
        // Extract and execute commands from AI response
        let finalResponse = response;
        
        // Look for command patterns in the AI response
        // Pattern 1: Commands in code blocks ```command```
        const codeBlockPattern = /```\n?([^`]+)\n?```/g;
        const codeBlockMatches = [...response.matchAll(codeBlockPattern)];
        
        // Pattern 2: Inline capability commands like "nginx list-forwarders"
        const capabilityPattern = /(?:^|\n)\s*(nginx|cloudflare|dns)\s+([\w-]+)(?:\s|$)/gm;
        const inlineMatches = [...response.matchAll(capabilityPattern)];
        
        // Combine and deduplicate commands
        const commandsToExecute = new Set<string>();
        
        // Helper function to check if text looks like a shell command
        const looksLikeCommand = (text: string): boolean => {
            const trimmed = text.trim();
            // Check for common command patterns
            const commandPatterns = [
                /^(ls|cd|pwd|echo|cat|grep|find|curl|wget|ssh|scp|chmod|chown|mkdir|rm|cp|mv|touch|tail|head|ps|kill|systemctl|service|nginx|certbot|openssl)\s/,
                /^\/.+/, // Absolute paths
                /^\.\//, // Relative paths
                /\|/, // Pipes
                /^[A-Z_]+=[^\s]+/, // Environment variables
                /^(if|for|while|do|done|then|else|fi)\s/, // Shell constructs
                /^printf\s/, // Printf commands
                /^json=/, // Variable assignments
            ];
            
            // Also check if it's NOT explanatory text
            const explanatoryPatterns = [
                /^(SSL|TLS|HTTPS?|The|This|It|When|Where|What|How|Why)/i,
                /provides?\s/i,
                /is\s+(a|an|the)/i,
                /\s+(uses?|means?|allows?|enables?|helps?)\s/i,
            ];
            
            const isCommand = commandPatterns.some(pattern => pattern.test(trimmed));
            const isExplanation = explanatoryPatterns.some(pattern => pattern.test(trimmed));
            
            return isCommand && !isExplanation;
        };
        
        // Add commands from code blocks
        for (const match of codeBlockMatches) {
            let command = match[1].trim();
            if (command) {
                // If first line is a language specifier, remove it
                const lines = command.split('\n');
                if (lines[0].match(/^(bash|sh|python|javascript|js|ts|typescript|json|yaml|yml)$/i)) {
                    command = lines.slice(1).join('\n').trim();
                }
                
                // Only add if it looks like an actual command
                if (command && looksLikeCommand(command)) {
                    commandsToExecute.add(command);
                } else if (command) {
                    console.log(`[CHAT] Skipping non-command text in code block: ${command.substring(0, 50)}...`);
                }
            }
        }
        
        // Add inline commands
        for (const match of inlineMatches) {
            commandsToExecute.add(match[0].trim());
        }
        
        const matches = Array.from(commandsToExecute);
        
        if (matches.length > 0) {
            console.log(`[CHAT] Found ${matches.length} commands to execute`);
            
            // Execute each command found
            for (const fullCommand of matches) {
                console.log(`[CHAT] Executing command: ${fullCommand}`);
                
                try {
                    // First check if this is a capability command
                    if (capabilityLoader) {
                        const capabilityResult = await capabilityLoader.handleCommand(fullCommand);
                        if (capabilityResult) {
                            console.log(`[CHAT] Executed capability command: ${fullCommand}`);
                            // Format capability result
                            if (typeof capabilityResult === 'string') {
                                finalResponse += `\n\n**Command Output:**\n\`\`\`\n${capabilityResult}\n\`\`\``;
                            } else {
                                finalResponse += `\n\n**Command Output:**\n\`\`\`\n${JSON.stringify(capabilityResult, null, 2)}\n\`\`\``;
                            }
                            continue; // Skip to next command
                        }
                    }
                    
                    // Not a capability command, try parsing as shell command
                    const parsedCommand = await parseCommand(fullCommand);
                    const result = await executeCommand(parsedCommand, correlationId);
                    
                    // Append command output to response
                    if (result.stdout || result.stderr) {
                        const output = result.stdout || '';
                        const error = result.stderr || '';
                        if (output) {
                            finalResponse += `\n\n**Command Output:**\n\`\`\`\n${output}\n\`\`\``;
                        }
                        if (error && !output) {
                            finalResponse += `\n\n**Command Error:**\n${error}`;
                        }
                    } else if (result.success !== undefined && !result.success) {
                        finalResponse += `\n\n**Command Error:**\n${result.error || 'Command failed'}`;
                    }
                } catch (error) {
                    console.error(`[CHAT] Error executing command ${fullCommand}:`, error);
                    finalResponse += `\n\n**Error executing ${fullCommand}:**\n${error instanceof Error ? error.message : String(error)}`;
                }
            }
        }
        
        // Note: We previously thought stray HTML tags were in the AI response,
        // but they're actually generated by marked.js during rendering.
        // The real issue is truncated markdown tables that confuse the parser.
        
        // Include tabId as first line if provided
        const responseWithTabId = tabId ? `[TAB:${tabId}]\n${finalResponse}` : finalResponse;
        
        // Note: res.json() automatically handles JSON escaping of the response string
        // So newlines, tabs, etc. in the response will be properly escaped
        res.json({
            success: true,
            response: responseWithTabId,
            agent: AGENT_ID,
            timestamp: new Date().toISOString()
        });
        
        // If we have a correlationId, notify hub of completion
        if (correlationId) {
            try {
                await axios.post(`${HUB_URL}/api/executions/${correlationId}/complete`, {
                    result: {
                        response: response,
                        agent: AGENT_ID,
                        timestamp: new Date().toISOString()
                    }
                });
            } catch (err) {
                console.error(`Failed to notify hub of completion for ${correlationId}:`, err);
            }
        }
    } catch (error: any) {
        console.error('[CHAT] Error processing natural language:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to process natural language command',
            timestamp: new Date().toISOString()
        });
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
    // parseCommand is for shell commands only - AI processing happens via /api/chat
    // Basic parsing (original logic)
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

async function executeCommand(parsed: any, correlationId?: string): Promise<any> {
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

async function executeCommandAsync(parsed: any, requestId: string, correlationId?: string): Promise<void> {
    activeCommands.set(requestId, {
        requestId,
        status: 'running',
        startTime: new Date().toISOString()
    });
    
    try {
        const result = await executeCommand(parsed, correlationId);
        
        activeCommands.set(requestId, {
            requestId,
            status: 'completed',
            success: true,
            ...result,
            startTime: activeCommands.get(requestId).startTime,
            endTime: new Date().toISOString()
        });
        
        // If we have a correlationId, notify hub of completion
        if (correlationId) {
            try {
                await axios.post(`${HUB_URL}/api/executions/${correlationId}/complete`, {
                    result: {
                        ...result,
                        requestId,
                        agent: AGENT_ID,
                        timestamp: new Date().toISOString()
                    }
                });
            } catch (err) {
                console.error(`Failed to notify hub of completion for ${correlationId}:`, err);
            }
        }
        
        // Notify hub of completion (old method for backward compatibility)
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
        
        // If we have a correlationId, notify hub of failure
        if (correlationId) {
            try {
                await axios.post(`${HUB_URL}/api/executions/${correlationId}/fail`, {
                    error: error.message
                });
            } catch (err) {
                console.error(`Failed to notify hub of failure for ${correlationId}:`, err);
            }
        }
        
        // Notify hub of failure (old method for backward compatibility)
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

// Start server
startupLog(1, 'Starting Express server...');
startupLog(3, `Attempting to bind to 0.0.0.0:${PORT}`);

// Track startup milestones
const startupMilestones: Array<{name: string, time: number}> = [];
const addMilestone = (name: string) => {
    const elapsed = Date.now() - startTime;
    startupMilestones.push({ name, time: elapsed });
    startupLog(2, `Milestone: ${name} at ${elapsed}ms`);
};

// Add initial milestones
addMilestone('imports_complete');

// Clear our own port before starting
startupLog(1, 'Checking port availability...');
try {
    const { execSync } = require('child_process');
    const portInUse = execSync(`lsof -ti:${PORT} || true`, { encoding: 'utf8' }).trim();
    if (portInUse) {
        startupLog(1, `Port ${PORT} is in use by PID ${portInUse}, killing it...`);
        execSync(`kill -9 ${portInUse} || true`);
        // Give it a moment to release the port  
        execSync('sleep 1');
        startupLog(1, `Port ${PORT} cleared`);
    } else {
        startupLog(2, `Port ${PORT} is available`);
    }
} catch (err) {
    startupLog(1, `Port clearing check failed: ${err}, continuing anyway...`);
}

const server = app.listen(PORT, '0.0.0.0', async () => {
    addMilestone('server_listening');
    startupLog(1, `Server listening on port ${PORT}`);
    
    // Load capabilities
    await capabilityLoader.loadCapabilities();
    console.log('Capabilities loaded');
    
    console.log(`Enhanced HTTP Agent ${AGENT_ID} listening on port ${PORT}`);
    console.log(`Hub URL: ${HUB_URL}`);
    console.log('Features: Authentication, Service Discovery, Command Parsing, Event Notifications');
    
    // Test that our API is actually responding
    addMilestone('testing_api_readiness');
    let apiReady = false;
    for (let i = 0; i < 10; i++) {
        try {
            const testResponse = await axios.get(`http://localhost:${PORT}/health`);
            if (testResponse.status === 200) {
                apiReady = true;
                addMilestone('api_confirmed_ready');
                break;
            }
        } catch (err) {
            // Not ready yet
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    // Calculate total time and breakdown
    const totalTime = Date.now() - startTime;
    const breakdown = startupMilestones.map((m, i) => {
        const duration = i === 0 ? m.time : m.time - startupMilestones[i-1].time;
        return { ...m, duration };
    });
    
    // Log startup summary
    if (STARTUP_VERBOSITY >= 1) {
        console.log(`[STARTUP COMPLETE] Total startup time: ${totalTime}ms`);
        console.log('Breakdown:', breakdown);
    }
    
    // Send initial registration to hub with timing data
    startupLog(2, 'Notifying hub of agent online status with timing data...');
    try {
        await notifyHub('agent-ready', {
            capabilities: 'full',
            startupTime: totalTime,
            startupProfile: {
                totalMs: totalTime,
                milestones: breakdown,
                apiReady: apiReady,
                timestamp: new Date().toISOString()
            }
        });
        addMilestone('hub_notified');
        startupLog(2, 'Hub notification successful');
    } catch (error) {
        startupLog(1, `Hub notification failed: ${error}`);
        console.error('Failed to notify hub:', error);
    }
    
    // If we have a correlationId for callback, try to send it
    if (CORRELATION_ID_FOR_CALLBACK) {
        startupLog(2, `Sending correlation callback to hub for ${CORRELATION_ID_FOR_CALLBACK}`);
        try {
            await axios.post(`${HUB_URL}/api/executions/${CORRELATION_ID_FOR_CALLBACK}/complete`, {
                result: 'Agent started successfully',
                agentId: AGENT_ID,
                timestamp: new Date().toISOString()
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 5000
            });
            startupLog(2, 'Correlation callback successful');
            // Clear callback memory after successful send
            CORRELATION_ID_FOR_CALLBACK = undefined;
        } catch (error) {
            startupLog(1, `Correlation callback failed: ${error}`);
            // Keep it in memory for polling fallback
        }
    }
});

// Handle server errors
server.on('error', (error: any) => {
    startupLog(1, `Server error: ${error.message}`);
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use!`);
        process.exit(1);
    }
});

// Add more milestones as the app initializes
addMilestone('middleware_configured');
addMilestone('routes_registered');

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