#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import { SimpleHttpAgents } from './SimpleHttpAgents';
import { AICommandProcessor } from './AICommandProcessor';
import { setupEnhancedEndpoints } from './notification-endpoints';
import { setupManagerControlEndpoints } from './manager-control';
import { SSHManager, setupSSHEndpoints } from './ssh-manager';
import { setupCorrelationEndpoints } from './correlation-endpoints';
import { correlationTracker } from './correlation-tracker';
import { setupChatEndpoints } from './chat-endpoints';
import { setupMultiAgentEndpoints } from './multi-agent-endpoints';
import { setupTabEndpoints, getTabRegistry } from './tab-registry';
import { setupBrowserRequestEndpoints } from './browser-request-endpoints';
import { setupCommandQueueEndpoints } from './command-queue-endpoints';
import { CommandRequest, CommandRisk, ConfigLoader, LogManager } from '@proxmox-ai-control/shared';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Load configuration
const configLoader = ConfigLoader.getInstance();
const config = configLoader.getConfig();

const app = express();
const PORT = config.hub.port;

// Initialize logging with local directory
(async () => {
    try {
        const retentionDays = config?.defaults?.logging?.retentionDays || 5;
        const logManager = new LogManager(
            __dirname,
            'hub.log',
            retentionDays
        );
        const logPath = await logManager.initialize();
        console.log(`Hub logging initialized at: ${logPath}`);
        
        // Redirect stdout and stderr to the log file if not in TTY mode
        if (!process.stdout.isTTY) {
            const logStream = fs.createWriteStream(logPath, { flags: 'a' });
            process.stdout.write = process.stderr.write = logStream.write.bind(logStream);
        }
    } catch (error) {
        console.error('Failed to initialize local logging:', error);
    }
})();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize components
// Get the decrypted API key from config
const anthropicApiKey = (config as any).anthropic?.apiKey || process.env.ANTHROPIC_API_KEY || '';
if (!anthropicApiKey) {
  console.error('[HUB] WARNING: No Anthropic API key found in config or environment');
}
const aiProcessor = new AICommandProcessor(anthropicApiKey);
const httpAgents = new SimpleHttpAgents();
const sshManager = new SSHManager();

// Load HTTP agents configuration
httpAgents.loadConfig();

// Initialize SSH manager
sshManager.initialize().catch(err => {
  console.error('[SSH] Failed to initialize SSH manager:', err);
});

// Listen for manager operation completions to trigger immediate status updates
correlationTracker.on('manager-operation-complete', async (execution: any) => {
  if (execution.agent) {
    console.log(`[STATUS] Manager operation completed for ${execution.agent}, triggering immediate status check`);
    // Small delay to ensure service state has settled
    setTimeout(async () => {
      await httpAgents.checkSingleAgentStatus(execution.agent);
    }, 1000);
  }
});

// Serve static files from gui directory with no-cache for development
app.use(express.static(path.join(__dirname, '../../gui'), {
  setHeaders: (res, path) => {
    // Disable caching for HTML files
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Root route - force config reload when accessing web UI
app.get('/', async (req, res) => {
  await httpAgents.reloadConfig();
  console.log('Reloaded agent config for web UI access');
  // Set no-cache headers for the root HTML file
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, '../../gui/index.html'));
});

// Setup enhanced endpoints for agent notifications
setupEnhancedEndpoints(app, httpAgents);

// Setup manager control endpoints
setupManagerControlEndpoints(app, httpAgents);

// Setup correlation tracking endpoints
setupCorrelationEndpoints(app);
setupCommandQueueEndpoints(app);

// Setup SSH management endpoints
setupSSHEndpoints(app, httpAgents, sshManager);

// Setup chat logging endpoints
setupChatEndpoints(app);

// Setup multi-agent endpoints
setupMultiAgentEndpoints(app, httpAgents);

// Setup tab registry endpoints
setupTabEndpoints(app);

// Setup browser request queue endpoints
setupBrowserRequestEndpoints(app);

// API Routes

// Get all connected agents
app.get('/api/agents', async (req, res) => {
  const agents = httpAgents.getAgentsForApi();
  
  // Load version config
  let expectedVersion = '2.0.3'; // Default
  try {
    const versionConfig = require('../../VERSION_CONFIG.json');
    expectedVersion = versionConfig.agentVersion;
  } catch (e) {
    console.warn('Could not load VERSION_CONFIG.json, using default version');
  }
  
  // Add version comparison to response
  const enhancedAgents = {
    ...agents,
    expectedAgentVersion: expectedVersion,
    agents: agents.agents.map((agent: any) => ({
      ...agent,
      versionStatus: agent.version === expectedVersion ? 'up-to-date' : 'needs-update',
      expectedVersion: expectedVersion
    }))
  };
  
  res.json(enhancedAgents);
});

// Get specific agent status
app.get('/api/agents/:agentId', (req, res) => {
  const agent = httpAgents.getAgent(req.params.agentId);
  if (agent) {
    res.json(agent);
  } else {
    res.status(404).json({ error: 'Agent not found' });
  }
});

// Execute a natural language command
app.post('/api/command', async (req, res) => {
  try {
    const { command, targetAgents, requireConfirmation, tabId } = req.body;
    
    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }

    console.log(`Processing command: ${command}`);

    // Get available agents from HTTP polling
    const httpAgentStatus = httpAgents.getAgentsForApi();
    const availableAgents = httpAgentStatus.agents
      .filter((a: any) => a.isOnline)
      .map((a: any) => ({
        agentId: a.name,
        hostname: a.name,
        summary: a.capabilities?.summary || `${a.name} agent`,
        type: a.capabilities?.type || 'generic'
      }));
    
    if (availableAgents.length === 0) {
      return res.status(503).json({ error: 'No agents available' });
    }

    // Process command with AI
    const request = await aiProcessor.processNaturalLanguageCommand(
      command,
      availableAgents
    );

    // Override target agents if specified
    if (targetAgents && targetAgents.length > 0) {
      request.targetAgents = targetAgents;
    }

    // Check if no specific agents were identified - handle locally if so
    if (!request.targetAgents || request.targetAgents.length === 0) {
      console.log(`No specific agents detected in command: "${command}". Handling locally.`);
      
      // Handle the command locally using hub's Anthropic connection
      try {
        // Import Anthropic client
        const Anthropic = require('@anthropic-ai/sdk');
        const anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY || ''
        });

        // Create a system prompt for local handling
        const systemPrompt = `You are Claude Code, an AI assistant managing the Backend AI infrastructure hub.
You have access to information about all connected agents and can answer questions about the system.

Current system status:
- Total agents: ${availableAgents.length}
- Online agents: ${availableAgents.map((a: any) => `${a.agentId} (${a.summary})`).join(', ')}

When asked about agent status or general system queries, provide helpful information based on the available data.
For commands that need to be executed on specific machines, explain that the user should specify which machine to target.`;

        const response = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 2000,
          temperature: 0.7,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: command
            }
          ]
        });

        const content = response.content[0];
        if (content.type === 'text') {
          // Return the response as if it came from the hub itself
          return res.json({
            success: true,
            requestId: request.id,
            message: 'Command handled locally by hub',
            targetAgents: ['hub'],
            results: [{
              agentId: 'hub',
              success: true,
              output: content.text,
              timestamp: new Date().toISOString(),
              correlationId: correlationTracker.generateCorrelationId()
            }]
          });
        }
      } catch (error: any) {
        console.error('Error handling command locally:', error);
        return res.status(500).json({ 
          error: `Failed to process command locally: ${error.message}`
        });
      }
    }

    // Send command to specific HTTP agents
    const results = [];
    const targetAgentNames = request.targetAgents || [];
    
    for (const agentName of targetAgentNames) {
      try {
        // Generate correlationId for this command
        const correlationId = correlationTracker.generateCorrelationId();
        correlationTracker.startExecution(correlationId, command, agentName, 'command');
        
        // Use chat endpoint for natural language processing
        const result = await httpAgents.sendChatCommand(agentName, command, { correlationId, tabId });
        results.push({
          agentId: agentName,
          success: result.success,
          output: result.response || result.stdout || result.error,
          timestamp: result.timestamp,
          correlationId
        });
      } catch (error: any) {
        results.push({
          agentId: agentName,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    res.json({
      success: true,
      requestId: request.id,
      message: 'Command sent to agents',
      targetAgents: targetAgentNames,
      results
    });

  } catch (error) {
    console.error('Error processing command:', error);
    
    // Extract full error details
    let errorMessage = 'Failed to process command';
    let errorDetails = '';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = `${error.name}: ${error.message}\n\nStack trace:\n${error.stack}`;
    } else {
      errorDetails = JSON.stringify(error, null, 2);
    }
    
    res.status(500).json({ 
      error: `Failed to process command: ${errorMessage}`,
      errorDetails: errorDetails
    });
  }
});

// Get logs endpoint
app.get('/api/logs', async (req, res) => {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const lines = parseInt(req.query.lines as string) || 100;
    const service = req.query.service as string || 'hub';
    
    let command: string;
    if (service === 'hub') {
      // Get hub's own logs
      command = `journalctl -u ai-hub.service -n ${lines} --no-pager`;
    } else {
      // Get specific service logs
      command = `journalctl -u ${service} -n ${lines} --no-pager`;
    }
    
    const result = await execAsync(command);
    res.json({
      service: service,
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


// Health check
app.get('/health', (req, res) => {
  const httpAgentStatus = httpAgents.getAgentsForApi();
  res.json({
    status: 'healthy',
    agents: httpAgentStatus.totalAgents,
    onlineAgents: httpAgentStatus.onlineAgents,
    uptime: process.uptime()
  });
});

// Hub status endpoint (similar to agent status)
app.get('/api/status', async (req, res) => {
  const packageJson = require('../../package.json');
  const versionConfig = require('../../VERSION_CONFIG.json');
  const httpAgentStatus = httpAgents.getAgentsForApi();
  
  res.json({
    hubId: 'backend-ai-hub',
    status: 'online',
    version: packageJson.version,
    expectedAgentVersion: versionConfig.agentVersion,
    workingDirectory: process.cwd(),
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    agents: {
      total: httpAgentStatus.totalAgents,
      online: httpAgentStatus.onlineAgents,
      offline: httpAgentStatus.totalAgents - httpAgentStatus.onlineAgents
    },
    versionConfig: {
      agentVersion: versionConfig.agentVersion,
      minimumAgentVersion: versionConfig.minimumAgentVersion,
      lastUpdated: versionConfig.lastUpdated
    }
  });
});

// Version check endpoint - returns agents that need updates
app.get('/api/version-check', async (req, res) => {
  const versionConfig = require('../../VERSION_CONFIG.json');
  const agents = httpAgents.getAgentsForApi().agents;
  
  const versionReport = {
    expectedVersion: versionConfig.agentVersion,
    minimumVersion: versionConfig.minimumAgentVersion,
    timestamp: new Date().toISOString(),
    agents: {
      upToDate: [] as any[],
      needsUpdate: [] as any[],
      offline: [] as any[],
      belowMinimum: [] as any[]
    }
  };
  
  // Check each agent's version
  for (const agent of agents) {
    if (!agent.isOnline) {
      versionReport.agents.offline.push({
        name: agent.name,
        lastSeen: agent.lastSeen || 'never'
      });
      continue;
    }
    
    const agentInfo = {
      name: agent.name,
      currentVersion: agent.version || 'unknown',
      ip: agent.ip,
      workingDirectory: agent.workingDirectory
    };
    
    if (agent.version === versionConfig.agentVersion) {
      versionReport.agents.upToDate.push(agentInfo);
    } else {
      versionReport.agents.needsUpdate.push({
        ...agentInfo,
        updateTo: versionConfig.agentVersion
      });
      
      // Check if below minimum version
      if (agent.version && agent.version < versionConfig.minimumAgentVersion) {
        versionReport.agents.belowMinimum.push(agentInfo);
      }
    }
  }
  
  // Add summary
  const summary = {
    totalAgents: agents.length,
    upToDate: versionReport.agents.upToDate.length,
    needsUpdate: versionReport.agents.needsUpdate.length,
    offline: versionReport.agents.offline.length,
    critical: versionReport.agents.belowMinimum.length
  };
  
  res.json({ ...versionReport, summary });
});

// Hub auto-update endpoint
app.post('/api/autoupdate', async (req, res) => {
  try {
    const { ver } = req.query;
    const { authToken } = req.body; // Optional FileBrowser auth token
    
    if (!ver) {
      return res.status(400).json({ error: 'Version parameter required' });
    }
    
    // Configuration
    const NAS_URL = 'http://192.168.1.10:8888';
    const updateUrl = `${NAS_URL}/api/raw/${ver}/hub-${ver}.tar.gz`;
    
    console.log(`Starting hub auto-update to version ${ver}...`);
    
    // Create update script with authentication
    const updateScript = `#!/bin/bash
# Hub Auto-Update Script
cd /tmp
echo "Downloading hub update version ${ver}..."

# Download with authentication if token provided
${authToken ? `curl -sL -H "X-Auth: ${authToken}" "${updateUrl}" -o hub-update.tar.gz || exit 1` : 
              `curl -sL "${updateUrl}" -o hub-update.tar.gz || exit 1`}

# Verify download
if [ ! -f hub-update.tar.gz ] || [ ! -s hub-update.tar.gz ]; then
    echo "Download failed or file is empty"
    exit 1
fi

# Hub directory
HUB_DIR="/opt/backend-ai/hub"

echo "Updating hub in $HUB_DIR..."
cd "$HUB_DIR"

# Backup current version
if [ -d dist ]; then
    mv dist dist.backup.$(date +%Y%m%d_%H%M%S)
fi

# Preserve .env file if it exists
if [ -f .env ]; then
    cp .env .env.backup
fi

# Extract update
tar -xzf /tmp/hub-update.tar.gz || exit 1

# Restore .env if it was backed up
if [ -f .env.backup ]; then
    mv .env.backup .env
fi

# Clean up
rm /tmp/hub-update.tar.gz

echo "Update complete. Hub will restart..."
`;

    // Write and execute update script
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    await execAsync(`echo '${updateScript}' > /tmp/hub-update.sh && chmod +x /tmp/hub-update.sh`);
    
    // Execute update in background and restart
    res.json({ 
      success: true, 
      message: `Hub auto-update to version ${ver} started. Hub will restart shortly.`,
      version: ver,
      updateUrl: updateUrl
    });
    
    // Give time for response to be sent
    setTimeout(async () => {
      try {
        await execAsync('/tmp/hub-update.sh');
        console.log('Update complete, restarting hub...');
        process.exit(0); // Systemd will restart the hub
      } catch (error) {
        console.error('Update failed:', error);
      }
    }, 1000);
    
  } catch (error: any) {
    res.status(500).json({ error: 'Hub auto-update failed', message: error.message });
  }
});

// Get cached agent capabilities
app.get('/api/capabilities/:agentName', (req, res) => {
  const { agentName } = req.params;
  const capabilities = httpAgents.getCapabilitySync().getAgentCapabilities(agentName);
  
  if (!capabilities) {
    return res.status(404).json({ error: 'Agent capabilities not found' });
  }
  
  res.json(capabilities);
});

// Get specific capability README
app.get('/api/capabilities/:agentName/*', async (req, res) => {
  const { agentName } = req.params;
  const capabilityPath = (req.params as any)[0];
  
  const readme = await httpAgents.getCapabilitySync().getCapabilityReadme(agentName, capabilityPath);
  
  if (!readme) {
    return res.status(404).json({ error: 'Capability README not found' });
  }
  
  res.type('text/markdown').send(readme);
});


// Agent lifecycle control endpoints
app.post('/api/agents/:agentName/start', async (req, res) => {
  const { agentName } = req.params;
  const { correlationId } = req.body;
  const agent = httpAgents.getAgent(agentName);
  
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  if (!correlationId) {
    return res.status(400).json({ error: 'correlationId is required' });
  }
  
  console.log(`\n[HUB] Start command received for ${agentName} with correlationId: ${correlationId}`);
  
  // Track execution
  correlationTracker.startExecution(correlationId, 'start-agent', agentName, 'start-agent');
  httpAgents.setPendingCorrelationId(agentName, correlationId);
  
  try {
    // Call agent manager on port 3081 with correlationId
    correlationTracker.addLog(correlationId, `Calling manager API at http://${agent.ip}:3081/start`);
    const response = await axios.post(`http://${agent.ip}:3081/start`, {
      correlationId
    });
    console.log(`[HUB] Manager responded for ${agentName}`);
    correlationTracker.addLog(correlationId, `Manager responded: ${response.data.success ? 'Success' : 'Failed'}`);
    if (response.data.output) {
      correlationTracker.addLog(correlationId, `Manager output: ${response.data.output}`);
    }
    res.json({ agent: agentName, correlationId, ...response.data });
  } catch (error: any) {
    console.error(`[HUB] Failed to start ${agentName}:`, error.message);
    correlationTracker.addLog(correlationId, `Error calling manager: ${error.message}`);
    correlationTracker.failExecution(correlationId, error.message);
    res.status(500).json({ 
      agent: agentName, 
      correlationId,
      error: 'Failed to start agent',
      message: error.message 
    });
  }
});

app.post('/api/agents/:agentName/stop', async (req, res) => {
  const { agentName } = req.params;
  const { correlationId } = req.body;
  const agent = httpAgents.getAgent(agentName);
  
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  if (!correlationId) {
    return res.status(400).json({ error: 'correlationId is required' });
  }
  
  console.log(`\n[HUB] Stop command received for ${agentName} with correlationId: ${correlationId}`);
  
  // Track execution
  correlationTracker.startExecution(correlationId, 'stop-agent', agentName, 'stop-agent');
  httpAgents.setPendingCorrelationId(agentName, correlationId);
  
  try {
    // Call agent manager on port 3081 with correlationId
    correlationTracker.addLog(correlationId, `Calling manager API at http://${agent.ip}:3081/stop`);
    const response = await axios.post(`http://${agent.ip}:3081/stop`, {
      correlationId
    });
    correlationTracker.addLog(correlationId, `Manager responded: ${response.data.success ? 'Success' : 'Failed'}`);
    if (response.data.output) {
      correlationTracker.addLog(correlationId, `Manager output: ${response.data.output}`);
    }
    res.json({ agent: agentName, correlationId, ...response.data });
  } catch (error: any) {
    correlationTracker.addLog(correlationId, `Error calling manager: ${error.message}`);
    correlationTracker.failExecution(correlationId, error.message);
    res.status(500).json({ 
      agent: agentName, 
      correlationId,
      error: 'Failed to stop agent',
      message: error.message 
    });
  }
});

app.get('/api/agents/:agentName/manager-status', async (req, res) => {
  const { agentName } = req.params;
  const agent = httpAgents.getAgent(agentName);
  
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  try {
    // Check both manager and agent status
    const managerResponse = await axios.get(`http://${agent.ip}:3081/status`);
    res.json({ 
      agent: agentName,
      manager: 'online',
      agentRunning: managerResponse.data.running 
    });
  } catch (error: any) {
    res.json({ 
      agent: agentName,
      manager: 'offline',
      agentRunning: agent.isOnline,
      note: 'Manager not installed, using direct status' 
    });
  }
});

// SSE endpoint for execution status updates
app.get('/api/executions/stream', (req, res) => {
  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  // Listen for execution updates from correlationTracker
  const updateHandler = (execution: any) => {
    res.write(`data: ${JSON.stringify(execution)}\n\n`);
  };

  // Add both event handlers
  correlationTracker.on('executionUpdate', updateHandler);
  correlationTracker.on('execution-update', updateHandler);

  // Handle client disconnect
  req.on('close', () => {
    correlationTracker.removeListener('executionUpdate', updateHandler);
    correlationTracker.removeListener('execution-update', updateHandler);
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
🚀 ${config.system.name} Hub Started
============================================
Version: ${config.system.version}
API Server: http://${config.hub.ip}:${PORT}
Agent Polling: Active (30s interval)

Available Endpoints:
- GET  /              - Web UI
- GET  /api/agents    - List all agents
- POST /api/command   - Execute natural language command
- POST /api/command/v2 - Enhanced command API
- GET  /api/health    - Hub health status
- POST /api/notifications - Receive agent notifications

Pure HTTP/REST architecture.
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  httpAgents.stop();
  process.exit(0);
});
