#!/usr/bin/env node

// STARTUP DEBUG VERSION - Logs every major step with timestamps

const startTime = Date.now();
const log = (msg: string) => {
    const elapsed = Date.now() - startTime;
    console.log(`[DEBUG ${elapsed}ms] ${msg}`);
};

log('Process started');

// Early startup check - are we being blocked?
log('Checking environment...');
log(`  Node version: ${process.version}`);
log(`  Working directory: ${process.cwd()}`);
log(`  Environment PORT: ${process.env.PORT}`);

import express from 'express';
log('Express imported');

import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
log('Basic utilities imported');

import * as si from 'systeminformation';
log('Systeminformation imported');

import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import path from 'path';
log('All imports complete');

// Load environment
dotenv.config();
log('Environment loaded');
log(`  PORT: ${process.env.PORT}`);
log(`  AGENT_ID: ${process.env.AGENT_ID}`);
log(`  HUB_URL: ${process.env.HUB_URL}`);

const execAsync = promisify(exec);
const app = express();
const PORT = parseInt(process.env.PORT || '3080');
const AGENT_ID = process.env.AGENT_ID || `agent-${require('os').hostname()}`;
const HUB_URL = process.env.HUB_URL || 'http://192.168.1.30';

log('Creating Express app...');
app.use(express.json());
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
    } catch (error: any) {
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
    axios.post(`${HUB_URL}/api/notifications`, {
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
server.on('error', (error: any) => {
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