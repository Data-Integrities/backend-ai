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
const child_process_1 = require("child_process");
const util_1 = require("util");
const axios_1 = __importDefault(require("axios"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const shared_1 = require("@proxmox-ai-control/shared");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const app = (0, express_1.default)();
const PORT = 3081;
// Get version from configuration
const configLoader = shared_1.ConfigLoader.getInstance();
const config = configLoader.getConfig();
const MANAGER_VERSION = config.system.version || 'unknown';
const myAgent = configLoader.getMyAgent();
const HUB_URL = configLoader.getHubUrl();
app.use(express_1.default.json());
// Agent directory
const AGENT_DIR = '/opt/ai-agent/agent';
// Status endpoint for Unraid
app.get('/status', async (req, res) => {
    let isRunning = false;
    try {
        // Check if agent process is running using pgrep
        const { stdout } = await execAsync(`pgrep -f "node.*ai-agent/agent/dist/api/index.js"`);
        isRunning = stdout.trim().length > 0;
    }
    catch (error) {
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
app.post('/start', async (req, res) => {
    const correlationId = req.body?.correlationId;
    console.log(`[MANAGER] Starting agent${correlationId ? ` [${correlationId}]` : ''}`);
    try {
        // Use the rc.d script to start the agent with correlationId as parameter
        const command = correlationId
            ? `/etc/rc.d/rc.ai-agent start ${correlationId}`
            : '/etc/rc.d/rc.ai-agent start';
        const { stdout, stderr } = await execAsync(command);
        console.log(`[MANAGER] Start command output: ${stdout}`);
        if (stderr) {
            console.error(`[MANAGER] Start command stderr: ${stderr}`);
        }
        res.json({
            success: true,
            output: stdout.trim()
        });
    }
    catch (error) {
        console.error(`[MANAGER] Error starting agent: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// Stop agent for Unraid
app.post('/stop', async (req, res) => {
    const correlationId = req.body?.correlationId;
    console.log(`[MANAGER] Stopping agent${correlationId ? ` [${correlationId}]` : ''}`);
    try {
        // Use the rc.d script to stop the agent properly
        const { stdout, stderr } = await execAsync('/etc/rc.d/rc.ai-agent stop');
        console.log(`[MANAGER] Stop command output: ${stdout}`);
        if (stderr) {
            console.error(`[MANAGER] Stop command stderr: ${stderr}`);
        }
        // Wait for agent to actually stop by polling its status endpoint
        if (correlationId) {
            console.log(`[MANAGER] Waiting for agent to stop responding [${correlationId}]`);
            let attempts = 0;
            const maxAttempts = 10;
            while (attempts < maxAttempts) {
                try {
                    await axios_1.default.get('http://localhost:3080/api/status', { timeout: 1000 });
                    console.log(`[MANAGER] Agent still responding, waiting... (attempt ${attempts + 1})`);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    attempts++;
                }
                catch (error) {
                    // Agent stopped responding - send notification to hub
                    console.log(`[MANAGER] Agent stopped responding, sending notification [${correlationId}]`);
                    try {
                        await axios_1.default.post(`${HUB_URL}/api/notifications`, {
                            type: 'agent-offline',
                            agentId: process.env.AGENT_NAME || 'unraid',
                            correlationId: correlationId,
                            timestamp: new Date().toISOString()
                        }, { timeout: 2000 });
                        console.log(`[MANAGER] Sent offline notification to hub [${correlationId}]`);
                    }
                    catch (hubError) {
                        console.error(`[MANAGER] Failed to notify hub: ${hubError.message}`);
                    }
                    break;
                }
            }
            if (attempts >= maxAttempts) {
                console.warn(`[MANAGER] Agent still responding after ${maxAttempts} attempts`);
            }
        }
        res.json({
            success: true,
            output: stdout.trim()
        });
    }
    catch (error) {
        console.error(`[MANAGER] Error stopping agent: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// Restart agent for Unraid
app.post('/restart', async (req, res) => {
    const correlationId = req.body?.correlationId;
    console.log(`[MANAGER] Restarting agent${correlationId ? ` [${correlationId}]` : ''}`);
    try {
        // Use the rc.d script to restart the agent properly
        const { stdout, stderr } = await execAsync('/etc/rc.d/rc.ai-agent restart');
        console.log(`[MANAGER] Restart command output: ${stdout}`);
        if (stderr) {
            console.error(`[MANAGER] Restart command stderr: ${stderr}`);
        }
        // Write correlationId to file if provided
        if (correlationId) {
            await fs.writeFile(path.join(AGENT_DIR, '.correlationId'), correlationId, 'utf-8');
        }
        res.json({
            success: true,
            output: stdout.trim()
        });
    }
    catch (error) {
        console.error(`[MANAGER] Error restarting agent: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// Get logs (no journalctl on Unraid)
app.get('/logs', async (req, res) => {
    try {
        const { stdout } = await execAsync(`tail -100 /var/log/backend-ai-agent.log 2>/dev/null || echo "No logs available"`);
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
        const agentPackageJson = require(path.join(AGENT_DIR, 'package.json'));
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
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Agent manager (Unraid) listening on port ${PORT}`);
    console.log('Available endpoints:');
    console.log('  GET  /status  - Check agent status');
    console.log('  POST /start   - Start agent');
    console.log('  POST /stop    - Stop agent');
    console.log('  POST /restart - Restart agent');
    console.log('  GET  /version - Get agent version');
    console.log('  GET  /logs    - Get agent logs');
    // Check if we were started with a correlationId
    const correlationId = process.env.CORRELATION_ID;
    if (correlationId) {
        console.log(`Manager started with correlationId: ${correlationId}`);
        // Send callback to hub that manager has started successfully
        try {
            await axios_1.default.post(`${HUB_URL}/api/executions/${correlationId}/complete`, {
                result: `Manager started successfully on ${myAgent.name}`,
                agentId: myAgent.name,
                detectedBy: 'manager-startup'
            }, { timeout: 5000 });
            console.log(`Notified hub of manager startup completion`);
        }
        catch (error) {
            console.error(`Failed to notify hub of manager startup:`, error);
        }
    }
});
