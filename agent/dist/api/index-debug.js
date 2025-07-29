#!/usr/bin/env node
"use strict";
// STARTUP DEBUG VERSION - Logs every major step with timestamps
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
const startTime = Date.now();
const log = (msg) => {
    const elapsed = Date.now() - startTime;
    console.log(`[DEBUG ${elapsed}ms] ${msg}`);
};
log('Process started');
// Early startup check - are we being blocked?
log('Checking environment...');
log(`  Node version: ${process.version}`);
log(`  Working directory: ${process.cwd()}`);
log(`  Environment PORT: ${process.env.PORT}`);
const express_1 = __importDefault(require("express"));
log('Express imported');
const child_process_1 = require("child_process");
const util_1 = require("util");
const dotenv_1 = __importDefault(require("dotenv"));
log('Basic utilities imported');
const si = __importStar(require("systeminformation"));
log('Systeminformation imported');
const axios_1 = __importDefault(require("axios"));
log('All imports complete');
// Load environment
dotenv_1.default.config();
log('Environment loaded');
log(`  PORT: ${process.env.PORT}`);
log(`  AGENT_ID: ${process.env.AGENT_ID}`);
log(`  HUB_URL: ${process.env.HUB_URL}`);
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || '3080');
const AGENT_ID = process.env.AGENT_ID || `agent-${require('os').hostname()}`;
const HUB_URL = process.env.HUB_URL || 'http://192.168.1.30';
log('Creating Express app...');
app.use(express_1.default.json());
log('Express middleware configured');
// Minimal routes for debugging
app.get('/health', (req, res) => {
    log('Health check requested');
    res.send('OK');
});
app.get('/api/status', async (req, res) => {
    log('Status requested');
    try {
        const osInfo = await si.osInfo();
        const packageJson = require('../../package.json');
        res.json({
            agentId: AGENT_ID,
            status: 'online',
            version: packageJson.version,
            startupTime: Date.now() - startTime,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        log(`Status error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});
// Start server with detailed logging
log('Starting server...');
const server = app.listen(PORT, '0.0.0.0', () => {
    log(`Server listening on port ${PORT}`);
    log('Attempting hub notification...');
    // Notify hub
    axios_1.default.post(`${HUB_URL}/api/notifications`, {
        type: 'agent-online',
        agentId: AGENT_ID,
        timestamp: new Date().toISOString(),
        capabilities: 'debug'
    }, {
        headers: { 'Content-Type': 'application/json' }
    })
        .then(() => {
        log('Hub notification successful');
    })
        .catch((error) => {
        log(`Hub notification failed: ${error.message}`);
    });
});
// Log server errors
server.on('error', (error) => {
    log(`Server error: ${error.message}`);
    if (error.code === 'EADDRINUSE') {
        log(`Port ${PORT} is already in use!`);
    }
});
// Keep logging every 5 seconds to show we're alive
setInterval(() => {
    log(`Still running... (uptime: ${Math.round((Date.now() - startTime) / 1000)}s)`);
}, 5000);
log('Startup script complete');
//# sourceMappingURL=index-debug.js.map