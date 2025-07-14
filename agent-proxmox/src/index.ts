#!/usr/bin/env node

import * as dotenv from 'dotenv';
import { ProxmoxAgent } from './ProxmoxAgent';

// Load environment variables
dotenv.config();

async function main() {
  const agentId = process.env.AGENT_ID || `proxmox-agent-${Date.now()}`;
  const hubUrl = process.env.HUB_URL || 'ws://localhost:3001';
  const proxmoxHost = process.env.PROXMOX_HOST;
  const proxmoxUser = process.env.PROXMOX_USER || 'root@pam';
  const proxmoxPassword = process.env.PROXMOX_PASSWORD;

  // Validate required environment variables
  if (!proxmoxHost || !proxmoxPassword) {
    console.error('Missing required environment variables:');
    console.error('- PROXMOX_HOST: Proxmox server hostname/IP');
    console.error('- PROXMOX_PASSWORD: Proxmox user password');
    console.error('Optional:');
    console.error('- PROXMOX_USER: Proxmox username (default: root@pam)');
    console.error('- HUB_URL: AI Control Hub URL (default: ws://localhost:3001)');
    console.error('- AGENT_ID: Unique agent identifier');
    process.exit(1);
  }

  console.log(`Starting Proxmox AI Agent...`);
  console.log(`Agent ID: ${agentId}`);
  console.log(`Hub URL: ${hubUrl}`);
  console.log(`Proxmox Host: ${proxmoxHost}`);
  console.log(`Proxmox User: ${proxmoxUser}`);

  try {
    // Create and start agent
    const agent = new ProxmoxAgent(
      agentId,
      hubUrl,
      proxmoxHost,
      proxmoxUser,
      proxmoxPassword
    );

    // Keep process running
    process.on('SIGINT', () => {
      console.log('Received SIGINT, shutting down gracefully...');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('Received SIGTERM, shutting down gracefully...');
      process.exit(0);
    });

    console.log('Proxmox AI Agent started successfully!');
    console.log('Press Ctrl+C to stop the agent');

  } catch (error) {
    console.error('Failed to start Proxmox agent:', error);
    process.exit(1);
  }
}

// Run the agent
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});