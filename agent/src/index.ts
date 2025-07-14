#!/usr/bin/env node

import * as dotenv from 'dotenv';
import { Agent } from './Agent';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

// Generate agent ID if not provided
const getAgentId = (): string => {
  const envId = process.env.AGENT_ID;
  if (envId) return envId;

  // Try to get hostname
  const hostname = process.env.HOSTNAME || require('os').hostname();
  
  // Try to read from file
  const idFile = '/etc/ai-agent/agent-id';
  try {
    if (fs.existsSync(idFile)) {
      return fs.readFileSync(idFile, 'utf-8').trim();
    }
  } catch (error) {
    // Ignore
  }

  // Generate based on hostname and timestamp
  return `agent-${hostname}-${Date.now()}`;
};

// Get hub URL
const getHubUrl = (): string => {
  return process.env.HUB_URL || 'ws://localhost:3000';
};

// Main function
async function main() {
  const agentId = getAgentId();
  const hubUrl = getHubUrl();

  console.log(`Starting AI Agent...`);
  console.log(`Agent ID: ${agentId}`);
  console.log(`Hub URL: ${hubUrl}`);

  // Save agent ID for future runs
  try {
    const configDir = '/etc/ai-agent';
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(path.join(configDir, 'agent-id'), agentId);
  } catch (error) {
    console.warn('Could not save agent ID:', error);
  }

  // Create and start agent
  const agent = new Agent(agentId, hubUrl);

  // Keep process running
  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    process.exit(0);
  });
}

// Run the agent
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});