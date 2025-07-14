#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer } from './WebSocketServer';
import { AgentManager } from './AgentManager';
import { AICommandProcessor } from './AICommandProcessor';
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
  console.log(`Agent connected: ${agent.agentId} (${agent.hostname})`);
});

agentManager.on('agent:disconnected', (agent) => {
  console.log(`Agent disconnected: ${agent.agentId} (${agent.hostname})`);
});

agentManager.on('command:result', ({ requestId, result }) => {
  console.log(`Command result for ${requestId} from ${result.agentId}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
});

agentManager.on('agent:event', ({ agentId, event }) => {
  console.log(`Event from ${agentId}: ${event.severity} - ${event.message}`);
  // TODO: Handle critical events (send notifications, auto-remediate, etc.)
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
- GET  /api/agents           - List all agents
- POST /api/command          - Execute natural language command
- GET  /api/command/:id/results - Get command results
- POST /api/suggestions      - Get command suggestions

Example Commands:
- "Check if nginx is running on web-server"
- "Show error logs from the API server"
- "Restart MySQL on database-server"
- "What domains is nginx routing?"
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  wsServer.stop();
  process.exit(0);
});