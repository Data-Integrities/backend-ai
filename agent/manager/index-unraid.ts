#!/usr/bin/env node

import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);
const app = express();
const PORT = 3081;
// Get version from package.json
let MANAGER_VERSION = 'unknown';
try {
    const packageJson = require('../../package.json');
    MANAGER_VERSION = packageJson.version || 'unknown';
} catch {
    // Version will remain 'unknown'
}

app.use(express.json());

// Agent directory
const AGENT_DIR = '/opt/ai-agent/agent';
const HUB_URL = 'http://192.168.1.30';

// Status endpoint for Unraid
app.get('/status', async (req: express.Request, res: express.Response) => {
    let isRunning = false;
    
    try {
        // Check if agent process is running using pgrep
        const { stdout } = await execAsync(`pgrep -f "node.*ai-agent/agent/dist/api/index.js"`);
        isRunning = stdout.trim().length > 0;
    } catch (error) {
        // pgrep returns non-zero if no process found
        isRunning = false;
    }
    
    res.json({ 
        running: isRunning,
        managerVersion: MANAGER_VERSION,
        workingDirectory: process.cwd()
    });
});

// Start agent for Unraid
app.post('/start', async (req: express.Request, res: express.Response) => {
    try {
        // Use the Unraid start script
        await execAsync(`/opt/ai-agent/agent/start-unraid.sh`);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Stop agent for Unraid
app.post('/stop', async (req: express.Request, res: express.Response) => {
    try {
        // Kill the agent process
        await execAsync(`pkill -f "node.*ai-agent/agent/dist/api/index.js" || true`);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Restart agent for Unraid
app.post('/restart', async (req: express.Request, res: express.Response) => {
    try {
        // Kill and restart using the script
        await execAsync(`pkill -f "node.*ai-agent/agent/dist/api/index.js" || true`);
        await execAsync(`sleep 1`);
        await execAsync(`/opt/ai-agent/agent/start-unraid.sh`);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get logs (no journalctl on Unraid)
app.get('/logs', async (req: express.Request, res: express.Response) => {
    try {
        const { stdout } = await execAsync(`tail -100 /var/log/backend-ai-agent.log 2>/dev/null || echo "No logs available"`);
        res.type('text/plain').send(stdout);
    } catch (error: any) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get agent version
app.get('/version', async (req: express.Request, res: express.Response) => {
    try {
        const agentPackageJson = require(path.join(AGENT_DIR, 'package.json'));
        res.json({ 
            agentVersion: agentPackageJson.version,
            agentName: agentPackageJson.name,
            managerVersion: MANAGER_VERSION,
            managerName: '@backend-ai/agent-manager'
        });
    } catch (error: any) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Agent manager (Unraid) listening on port ${PORT}`);
    console.log('Available endpoints:');
    console.log('  GET  /status  - Check agent status');
    console.log('  POST /start   - Start agent');
    console.log('  POST /stop    - Stop agent');
    console.log('  POST /restart - Restart agent');
    console.log('  GET  /version - Get agent version');
    console.log('  GET  /logs    - Get agent logs');
});