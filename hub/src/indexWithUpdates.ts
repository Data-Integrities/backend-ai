#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import * as path from 'path';
import { WebSocketServer } from './WebSocketServer';
import { AgentManager } from './AgentManager';
import { AICommandProcessor } from './AICommandProcessor';
import { UpdateService } from './UpdateService';
import { CommandRequest, CommandRisk } from '@proxmox-ai-control/shared';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000');
const WS_PORT = parseInt(process.env.WS_PORT || '3001');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize components
const agentManager = new AgentManager();
const aiProcessor = new AICommandProcessor(process.env.ANTHROPIC_API_KEY || '');
const wsServer = new WebSocketServer(WS_PORT, agentManager);
const updateService = new UpdateService(agentManager);

// API Routes

// Get all connected agents
app.get('/api/agents', (req, res) => {
  const agents = agentManager.getAgentStats();
  res.json(agents);
});

// Get specific agent status
app.get('/api/agents/:agentId', (req, res) => {
  const agent = agentManager.getAgent(req.params.agentId);
  if (agent) {
    res.json(agent.status);
  } else {
    res.status(404).json({ error: 'Agent not found' });
  }
});

// Execute a natural language command
app.post('/api/command', async (req, res) => {
  try {
    const { command, targetAgents, requireConfirmation } = req.body;
    
    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }

    console.log(`Processing command: ${command}`);

    // Get available agents
    const availableAgents = agentManager.getOnlineAgents();
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

    // Check if confirmation is required
    if (request.risk === CommandRisk.HIGH || request.risk === CommandRisk.CRITICAL || requireConfirmation) {
      return res.json({
        requiresConfirmation: true,
        request,
        interpretation: `This command will: ${request.naturalLanguage}`,
        risk: request.risk,
        targetAgents: request.targetAgents
      });
    }

    // Send command to agents
    await agentManager.sendCommand(request);

    res.json({
      success: true,
      requestId: request.id,
      message: 'Command sent to agents',
      targetAgents: request.targetAgents
    });

  } catch (error) {
    console.error('Error processing command:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to process command' 
    });
  }
});

// Confirm and execute a command
app.post('/api/command/confirm', async (req, res) => {
  try {
    const { request } = req.body;
    
    if (!request) {
      return res.status(400).json({ error: 'Request is required' });
    }

    // Send command to agents
    await agentManager.sendCommand(request as CommandRequest);

    res.json({
      success: true,
      requestId: request.id,
      message: 'Command confirmed and sent to agents'
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to execute command' });
  }
});

// Get command results
app.get('/api/command/:requestId/results', async (req, res) => {
  const results = agentManager.getCommandResults(req.params.requestId);
  
  if (results.length === 0) {
    return res.status(404).json({ error: 'No results found' });
  }

  // Analyze results with AI
  const analysis = await aiProcessor.analyzeResults(
    { id: req.params.requestId } as CommandRequest,
    results
  );

  res.json({
    requestId: req.params.requestId,
    results,
    analysis,
    summary: {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    }
  });
});

// Get command suggestions
app.post('/api/suggestions', async (req, res) => {
  try {
    const { situation } = req.body;
    const agents = agentManager.getOnlineAgents();
    
    const suggestions = await aiProcessor.suggestCommands(situation, agents);
    
    res.json({ suggestions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

// UPDATE ENDPOINTS

// Get agent version info
app.get('/api/agent/version', (req, res) => {
  const agentVersion = req.headers['x-agent-version'] as string;
  const agentOS = req.headers['x-agent-os'] as string || 'linux';
  
  const latestVersion = updateService.handleVersionCheck(agentVersion || '0.0.0', agentOS);
  
  if (latestVersion) {
    res.json(latestVersion);
  } else {
    res.status(204).send(); // No update available
  }
});

// Download agent update
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join('./agent-versions', filename);
  
  res.download(filepath, (err) => {
    if (err) {
      res.status(404).json({ error: 'File not found' });
    }
  });
});

// Deploy new agent version
app.post('/api/agent/deploy', async (req, res) => {
  try {
    const { changelog } = req.body;
    
    if (!changelog) {
      return res.status(400).json({ error: 'Changelog is required' });
    }
    
    const result = await updateService.deployUpdate(changelog);
    res.json({ success: true, message: result });
    
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to deploy update' 
    });
  }
});

// Update specific agents
app.post('/api/agent/update', async (req, res) => {
  try {
    const { agentIds, force } = req.body;
    
    if (agentIds && agentIds.length > 0) {
      await updateService.updateSpecificAgents(agentIds, force);
    } else {
      await updateService.updateAllAgents(undefined, force);
    }
    
    res.json({ 
      success: true, 
      message: `Update command sent to ${agentIds?.length || 'all'} agents` 
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to send update command' });
  }
});

// Get update status
app.get('/api/agent/update-status', (req, res) => {
  const agents = agentManager.getAllAgents();
  const updateStatus = agents.map(agent => ({
    agentId: agent.agentId,
    hostname: agent.hostname,
    currentVersion: agent.version,
    status: agent.status,
    lastSeen: agent.lastSeen
  }));
  
  res.json(updateStatus);
});

// Install agent script endpoint
app.get('/install-agent.sh', (req, res) => {
  const script = `#!/bin/bash
# AI Agent Quick Install Script
# Usage: curl -sSL http://hub-server:3000/install-agent.sh | sudo HUB_URL=ws://hub-server:3001 bash

set -e

# Download and extract agent
echo "Downloading AI agent..."
curl -sSL "http://${req.hostname}:${PORT}/download/agent-linux-latest.tar.gz" | tar -xz -C /opt/ai-agent

# Run the full installation script
cd /opt/ai-agent
./install-agent.sh
`;
  
  res.type('text/plain').send(script);
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    agents: agentManager.getOnlineAgents().length,
    uptime: process.uptime()
  });
});

// Event listeners
agentManager.on('agent:connected', (agent) => {
  console.log(`Agent connected: ${agent.agentId} (${agent.hostname}) v${agent.version}`);
});

agentManager.on('agent:disconnected', (agent) => {
  console.log(`Agent disconnected: ${agent.agentId} (${agent.hostname})`);
});

agentManager.on('command:result', ({ requestId, result }) => {
  console.log(`Command result for ${requestId} from ${result.agentId}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
});

agentManager.on('agent:event', ({ agentId, event }) => {
  console.log(`Event from ${agentId}: ${event.severity} - ${event.message}`);
  
  // Handle update notifications
  if (event.details?.newVersion) {
    console.log(`Agent ${agentId} has update available: ${event.details.currentVersion} -> ${event.details.newVersion}`);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`
🚀 Proxmox AI Control Hub Started
====================================
API Server: http://localhost:${PORT}
WebSocket:  ws://localhost:${WS_PORT}
Agents:     ${agentManager.getOnlineAgents().length} connected

Available Endpoints:
- GET  /api/agents                - List all agents
- POST /api/command               - Execute natural language command
- GET  /api/command/:id/results   - Get command results
- POST /api/suggestions           - Get command suggestions

Update Endpoints:
- POST /api/agent/deploy          - Deploy new agent version
- POST /api/agent/update          - Update specific agents
- GET  /api/agent/update-status   - Check agent versions

Example Commands:
- "Check if nginx is running on web-server"
- "Show error logs from the API server"
- "Restart MySQL on database-server"
- "What domains is nginx routing?"
- "Update all agents"
- "Force update agent on web-server"
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  wsServer.stop();
  process.exit(0);
});