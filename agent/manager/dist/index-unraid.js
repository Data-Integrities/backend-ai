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
const path = __importStar(require("path"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const app = (0, express_1.default)();
const PORT = 3081;
// Get version from package.json
let MANAGER_VERSION = 'unknown';
try {
    const packageJson = require('../../package.json');
    MANAGER_VERSION = packageJson.version || 'unknown';
}
catch {
    // Version will remain 'unknown'
}
app.use(express_1.default.json());
// Agent directory
const AGENT_DIR = '/opt/ai-agent/agent';
const HUB_URL = 'http://192.168.1.30';
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
    try {
        // Use the Unraid start script
        await execAsync(`/opt/ai-agent/agent/start-unraid.sh`);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// Stop agent for Unraid
app.post('/stop', async (req, res) => {
    try {
        // Kill the agent process
        await execAsync(`pkill -f "node.*ai-agent/agent/dist/api/index.js" || true`);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// Restart agent for Unraid
app.post('/restart', async (req, res) => {
    try {
        // Kill and restart using the script
        await execAsync(`pkill -f "node.*ai-agent/agent/dist/api/index.js" || true`);
        await execAsync(`sleep 1`);
        await execAsync(`/opt/ai-agent/agent/start-unraid.sh`);
        res.json({ success: true });
    }
    catch (error) {
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
