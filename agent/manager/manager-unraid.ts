#!/usr/bin/env node

// Unraid-specific Agent Manager
// Uses direct process management instead of systemctl

import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { LogManager, ConfigLoader } from '@proxmox-ai-control/shared';

const execAsync = promisify(exec);
const app = express();
app.use(express.json());

const PORT = 3081;
const AGENT_DIR = '/opt/ai-agent/agent';
const AGENT_PIDFILE = '/var/run/ai-agent.pid';
const NODE_BIN = '/usr/local/bin/node';
const HUB_URL = 'http://192.168.1.30';

// Initialize logging
let MANAGER_LOG_PATH = '/var/log/ai-agent-manager.log';
let AGENT_LOG_PATH = '/var/log/ai-agent.log';

(async () => {
    try {
        // Load config to get retention days
        const configLoader = ConfigLoader.getInstance();
        const config = configLoader.getConfig();
        const retentionDays = config?.defaults?.logging?.retentionDays || 5;
        
        // Initialize manager log
        const managerLogManager = new LogManager(
            __dirname,
            'manager.log',
            retentionDays
        );
        MANAGER_LOG_PATH = await managerLogManager.initialize();
        console.log(`Manager logging to: ${MANAGER_LOG_PATH}`);
        
        // Initialize agent log path
        const agentLogManager = new LogManager(
            path.join(__dirname, '..'),
            'agent.log',
            retentionDays
        );
        AGENT_LOG_PATH = await agentLogManager.initialize();
        console.log(`Agent will log to: ${AGENT_LOG_PATH}`);
    } catch (error) {
        console.error('Failed to initialize logging, using defaults:', error);
    }
})();

// Get manager version
async function getManagerVersion() {
    try {
        // Try multiple locations for package.json
        const locations = [
            path.join(__dirname, '../../package.json'),
            path.join(__dirname, '../package.json'),
            '/opt/ai-agent/agent/package.json'
        ];
        
        for (const location of locations) {
            try {
                const packageJson = JSON.parse(
                    await fs.readFile(location, 'utf-8')
                );
                return packageJson.version || 'unknown';
            } catch {
                // Try next location
            }
        }
        
        // If all fail, return unknown
        return 'unknown';
    } catch {
        return 'unknown';
    }
}

// Check if agent is running
async function isAgentRunning(): Promise<boolean> {
    try {
        // First check pidfile
        if (await fs.access(AGENT_PIDFILE).then(() => true).catch(() => false)) {
            const pid = (await fs.readFile(AGENT_PIDFILE, 'utf-8')).trim();
            // Check if process exists
            await execAsync(`ps -p ${pid}`);
            return true;
        }
    } catch {
        // Pidfile check failed, try process search
    }
    
    // Check by process name
    try {
        const { stdout } = await execAsync(`pgrep -f "node.*ai-agent/agent/dist/api/index.js"`);
        return stdout.trim().length > 0;
    } catch {
        return false;
    }
}

// Status endpoint
app.get('/status', async (req, res) => {
    const isRunning = await isAgentRunning();
    const managerVersion = await getManagerVersion();
    
    res.json({ 
        running: isRunning,
        managerVersion: managerVersion,
        workingDirectory: process.cwd()
    });
});

// Start agent
app.post('/start', async (req, res) => {
    const correlationId = req.body?.correlationId || `umgr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[${correlationId}] Starting agent on Unraid...`);
    
    try {
        // Check if already running
        if (await isAgentRunning()) {
            console.log(`[${correlationId}] Agent already running`);
            notifyHubCompletion(correlationId, { success: true, message: 'Agent already running' });
            return res.json({ success: true, message: 'Agent already running', correlationId });
        }
        
        // Start the agent with pidfile
        const startCommand = `cd ${AGENT_DIR} && nohup ${NODE_BIN} dist/api/index.js > ${AGENT_LOG_PATH} 2>&1 & echo $! > ${AGENT_PIDFILE}`;
        await execAsync(startCommand);
        console.log(`[${correlationId}] Start command executed`);
        
        // Give it a moment to start
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Verify it started
        if (await isAgentRunning()) {
            console.log(`[${correlationId}] Agent started successfully`);
            notifyHubCompletion(correlationId, { success: true, message: 'Agent started successfully' });
            res.json({ success: true, message: 'Agent started successfully', correlationId });
        } else {
            throw new Error('Agent failed to start');
        }
    } catch (error: any) {
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
    const correlationId = req.body?.correlationId || `umgr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[${correlationId}] Stopping agent on Unraid...`);
    
    try {
        let stopped = false;
        
        // Try pidfile first
        try {
            const pid = (await fs.readFile(AGENT_PIDFILE, 'utf-8')).trim();
            console.log(`[${correlationId}] Found PID ${pid}, sending SIGTERM`);
            await execAsync(`kill ${pid}`);
            
            // Wait for graceful shutdown
            for (let i = 0; i < 10; i++) {
                try {
                    await execAsync(`ps -p ${pid}`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch {
                    // Process is gone
                    console.log(`[${correlationId}] Process stopped gracefully`);
                    stopped = true;
                    break;
                }
            }
            
            // Force kill if needed
            if (!stopped) {
                console.log(`[${correlationId}] Force killing process`);
                await execAsync(`kill -9 ${pid}`).catch(() => {});
            }
            
            await fs.unlink(AGENT_PIDFILE).catch(() => {});
        } catch {
            // Pidfile approach failed, try by name
            console.log(`[${correlationId}] Pidfile approach failed, trying pkill`);
        }
        
        // Kill by process name
        if (!stopped) {
            await execAsync(`pkill -f "node.*ai-agent/agent/dist/api/index.js" || true`);
        }
        
        console.log(`[${correlationId}] Agent stopped successfully`);
        notifyHubCompletion(correlationId, { success: true });
        res.json({ success: true, correlationId });
    } catch (error: any) {
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
    const correlationId = req.body?.correlationId || `umgr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[${correlationId}] Restarting agent on Unraid...`);
    
    try {
        // Stop
        console.log(`[${correlationId}] Stopping current instance`);
        await execAsync(`pkill -f "node.*ai-agent/agent/dist/api/index.js" || true`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Start
        console.log(`[${correlationId}] Starting new instance`);
        const startCommand = `cd ${AGENT_DIR} && nohup ${NODE_BIN} dist/api/index.js > ${AGENT_LOG_PATH} 2>&1 & echo $! > ${AGENT_PIDFILE}`;
        await execAsync(startCommand);
        
        console.log(`[${correlationId}] Agent restarted successfully`);
        notifyHubCompletion(correlationId, { success: true });
        res.json({ success: true, correlationId });
    } catch (error: any) {
        console.error(`[${correlationId}] Failed to restart agent:`, error.message);
        notifyHubCompletion(correlationId, { success: false, error: error.message });
        res.status(500).json({ 
            success: false, 
            error: error.message,
            correlationId 
        });
    }
});

// Helper function to notify hub of command completion
async function notifyHubCompletion(correlationId: string, result: any) {
    if (!correlationId || correlationId.startsWith('umgr_')) {
        // Don't notify for locally generated IDs
        return;
    }
    
    try {
        const endpoint = result.success ? 'complete' : 'fail';
        await axios.post(
            `${HUB_URL}/api/executions/${correlationId}/${endpoint}`,
            result.success ? { result } : { error: result.error },
            { timeout: 5000 }
        );
        console.log(`[${correlationId}] Notified hub of ${endpoint}`);
    } catch (error) {
        console.error(`[${correlationId}] Failed to notify hub:`, error);
    }
}

// View logs endpoint
app.get('/logs', async (req, res) => {
    try {
        const lines = parseInt(req.query.lines as string) || 100;
        const { stdout } = await execAsync(`tail -n ${lines} ${AGENT_LOG_PATH}`);
        res.json({
            logs: stdout,
            lines: lines,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        res.status(500).json({ 
            error: 'Failed to fetch logs',
            message: error.message 
        });
    }
});

// Clear our own port before starting
console.log('Checking port availability...');
try {
    const { execSync } = require('child_process');
    console.log(`Running: lsof -ti:${PORT} || true`);
    const portInUse = execSync(`lsof -ti:${PORT} || true`, { encoding: 'utf8' }).trim();
    
    if (portInUse) {
        console.log(`Port ${PORT} is in use by PID ${portInUse}, checking process details...`);
        
        // Get more info about the process
        try {
            const processInfo = execSync(`ps -p ${portInUse} -o comm=,args=`, { encoding: 'utf8' }).trim();
            console.log(`Process using port: ${processInfo}`);
        } catch {
            console.log('Could not get process details');
        }
        
        console.log(`Attempting to kill PID ${portInUse}...`);
        try {
            execSync(`kill -9 ${portInUse}`);
            console.log(`Kill command executed for PID ${portInUse}`);
            execSync('sleep 1');
            
            // Verify the port is now free
            const stillInUse = execSync(`lsof -ti:${PORT} || true`, { encoding: 'utf8' }).trim();
            if (stillInUse) {
                console.error(`WARNING: Port ${PORT} is still in use by PID ${stillInUse} after kill attempt`);
            } else {
                console.log(`Port ${PORT} successfully cleared`);
            }
        } catch (killErr) {
            console.error(`Failed to kill process: ${killErr}`);
            console.error('Continuing anyway - may fail to bind to port');
        }
    } else {
        console.log(`Port ${PORT} is available`);
    }
} catch (err) {
    console.log(`Port check failed: ${err}, continuing anyway...`);
    console.log('This might be because lsof is not available on this system');
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Unraid Agent Manager listening on port ${PORT}`);
    console.log('Available endpoints:');
    console.log('  GET  /status  - Check agent status');
    console.log('  POST /start   - Start agent');
    console.log('  POST /stop    - Stop agent');
    console.log('  POST /restart - Restart agent');
    console.log('  GET  /logs    - View agent logs');
});

// Handle shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down');
    process.exit(0);
});