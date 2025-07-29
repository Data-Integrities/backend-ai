#!/usr/bin/env node

import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';

const execAsync = promisify(exec);
const app = express();
const PORT = 3081; // Same port as agent managers

app.use(express.json());

// Hub directory
const HUB_DIR = '/opt/backend-ai/hub';
const SERVICE_NAME = 'ai-hub.service';
const RELEASES_DIR = '/opt/backend-ai/releases';

// Ensure releases directory exists
async function ensureReleasesDir() {
    try {
        await fs.mkdir(RELEASES_DIR, { recursive: true });
    } catch (error) {
        console.error('Failed to create releases directory:', error);
    }
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const version = req.params.version;
        const versionDir = path.join(RELEASES_DIR, version);
        try {
            await fs.mkdir(versionDir, { recursive: true });
            cb(null, versionDir);
        } catch (error) {
            cb(error as Error, versionDir);
        }
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage });

// Status endpoint
app.get('/status', async (req, res) => {
    try {
        // Check if hub process is running
        const { stdout } = await execAsync(`systemctl is-active ${SERVICE_NAME}`);
        const isRunning = stdout.trim() === 'active';
        
        // Get manager version from hub's package.json
        const packageJson = require('../../package.json');
        
        res.json({ 
            running: isRunning,
            managerVersion: packageJson.version,
            workingDirectory: process.cwd()
        });
    } catch (error) {
        // Service not running
        res.json({ 
            running: false,
            managerVersion: 'unknown',
            workingDirectory: process.cwd()
        });
    }
});

// Start hub
app.post('/start', async (req, res) => {
    try {
        await execAsync(`systemctl start ${SERVICE_NAME}`);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Stop hub
app.post('/stop', async (req, res) => {
    try {
        await execAsync(`systemctl stop ${SERVICE_NAME}`);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Restart hub
app.post('/restart', async (req, res) => {
    try {
        await execAsync(`systemctl restart ${SERVICE_NAME}`);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Update hub
app.post('/update', async (req, res) => {
    try {
        const { version } = req.body;
        
        if (!version) {
            return res.status(400).json({ 
                success: false, 
                error: 'Version required' 
            });
        }
        
        console.log(`Starting hub update to version ${version}...`);
        
        // Create update script
        const updateScript = `#!/bin/bash
set -e

echo "Downloading hub version ${version}..."
cd /tmp

# Download from hub manager
curl -sL \\
  "http://localhost:3081/releases/${version}/hub-${version}.tar.gz" \\
  -o hub-update.tar.gz || exit 1

# Verify download
if [ ! -f hub-update.tar.gz ] || [ ! -s hub-update.tar.gz ]; then
    echo "Download failed or file is empty"
    exit 1
fi

echo "Updating hub in ${HUB_DIR}..."
cd "${HUB_DIR}"

# Backup current version
if [ -d dist ]; then
    mv dist dist.backup.$(date +%Y%m%d_%H%M%S)
fi

# Extract update
tar -xzf /tmp/hub-update.tar.gz || exit 1

# Clean up
rm /tmp/hub-update.tar.gz

echo "Update complete. Restarting hub..."
systemctl restart ${SERVICE_NAME}
`;

        // Write update script
        await fs.writeFile('/tmp/hub-update.sh', updateScript, { mode: 0o755 });
        
        // Execute update script
        execAsync('/tmp/hub-update.sh').catch(console.error);
        
        res.json({ 
            success: true,
            message: `Hub update to version ${version} started`
        });
        
    } catch (error: any) {
        console.error('Update error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get hub version
app.get('/version', async (req, res) => {
    try {
        const packagePath = path.join(HUB_DIR, 'package.json');
        const packageContent = await fs.readFile(packagePath, 'utf-8');
        const packageJson = JSON.parse(packageContent);
        
        res.json({
            version: packageJson.version,
            name: packageJson.name
        });
    } catch (error: any) {
        res.status(500).json({ 
            error: 'Failed to get version',
            message: error.message 
        });
    }
});

// Get logs
app.get('/logs', async (req, res) => {
    try {
        const lines = parseInt(req.query.lines as string) || 100;
        const { stdout } = await execAsync(
            `journalctl -u ${SERVICE_NAME} -n ${lines} --no-pager`
        );
        
        res.json({
            service: SERVICE_NAME,
            lines: lines,
            logs: stdout
        });
    } catch (error: any) {
        res.status(500).json({ 
            error: 'Failed to get logs',
            message: error.message 
        });
    }
});

// Upload release endpoint
app.post('/releases/:version/upload', upload.fields([
    { name: 'hub', maxCount: 1 },
    { name: 'agent', maxCount: 1 }
]), async (req, res) => {
    try {
        const { version } = req.params;
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        
        const uploaded = [];
        if (files.hub) {
            uploaded.push(`hub-${version}.tar.gz`);
        }
        if (files.agent) {
            uploaded.push(`agent-${version}.tar.gz`);
        }
        
        res.json({ 
            success: true, 
            version,
            uploaded,
            message: `Release ${version} uploaded successfully`
        });
    } catch (error: any) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Download release endpoint
app.get('/releases/:version/:file', async (req, res) => {
    try {
        const { version, file } = req.params;
        const filePath = path.join(RELEASES_DIR, version, file);
        
        // Check if file exists
        await fs.access(filePath);
        
        // Send file
        res.sendFile(filePath);
    } catch (error: any) {
        res.status(404).json({ 
            success: false, 
            error: 'File not found' 
        });
    }
});

// List releases endpoint
app.get('/releases', async (req, res) => {
    try {
        const versions = await fs.readdir(RELEASES_DIR);
        const releases = [];
        
        for (const version of versions) {
            const versionDir = path.join(RELEASES_DIR, version);
            const files = await fs.readdir(versionDir);
            releases.push({ version, files });
        }
        
        res.json({ releases });
    } catch (error: any) {
        res.json({ releases: [] });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.send('OK');
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
    await ensureReleasesDir();
    console.log(`Hub Manager listening on port ${PORT}`);
    console.log('Available endpoints:');
    console.log('  GET  /status  - Check hub status');
    console.log('  POST /start   - Start hub');
    console.log('  POST /stop    - Stop hub');
    console.log('  POST /restart - Restart hub');
    console.log('  POST /update  - Update hub to new version');
    console.log('  GET  /version - Get hub version');
    console.log('  GET  /logs    - Get hub logs');
    console.log('  POST /releases/:version/upload - Upload release files');
    console.log('  GET  /releases/:version/:file  - Download release file');
    console.log('  GET  /releases - List all releases');
});