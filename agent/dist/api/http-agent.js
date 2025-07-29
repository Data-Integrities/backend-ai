#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || '3080');
const AGENT_ID = process.env.AGENT_ID || 'unraid-agent';
app.use(express_1.default.json());
// Status endpoint
app.get('/api/status', (req, res) => {
    res.json({
        agentId: AGENT_ID,
        status: 'online',
        version: '1.0.0',
        platform: 'docker',
        timestamp: new Date().toISOString()
    });
});
// Capabilities endpoint
app.get('/api/capabilities', (req, res) => {
    res.json({
        agentId: AGENT_ID,
        type: 'unraid-docker',
        summary: 'Unraid Docker host with access to containers and host filesystem',
        capabilities: {
            docker: true,
            filesystem: true,
            systemd: false,
            proxmox: false
        },
        services: ['docker'],
        description: 'This agent runs on Unraid and can manage Docker containers, access the filesystem, and execute system commands.',
        examples: [
            'List Docker containers',
            'Check disk usage',
            'View system logs',
            'Manage files on /mnt shares'
        ]
    });
});
// Command execution endpoint
app.post('/api/execute', async (req, res) => {
    const { command } = req.body;
    if (!command) {
        return res.status(400).json({ error: 'Command required' });
    }
    try {
        console.log(`Executing command: ${command}`);
        const { stdout, stderr } = await execAsync(command);
        res.json({
            success: true,
            stdout,
            stderr,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error(`Command failed: ${error.message}`);
        res.json({
            success: false,
            error: error.message,
            stdout: error.stdout || '',
            stderr: error.stderr || '',
            timestamp: new Date().toISOString()
        });
    }
});
// Health check
app.get('/health', (req, res) => {
    res.send('OK');
});
app.listen(PORT, '0.0.0.0', () => {
    console.log(`HTTP Agent ${AGENT_ID} listening on port ${PORT}`);
    console.log('Ready to receive commands via HTTP polling');
});
// Handle shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');
    process.exit(0);
});
process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully');
    process.exit(0);
});
//# sourceMappingURL=http-agent.js.map