#!/usr/bin/env node

import axios from 'axios';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

const HUB_URL = process.env.HUB_URL || 'http://localhost:3000';

async function main() {
  console.log('🚀 Proxmox AI Control - Update Manager\n');

  while (true) {
    console.log('\nOptions:');
    console.log('1. Check agent versions');
    console.log('2. Deploy new version');
    console.log('3. Update all agents');
    console.log('4. Update specific agents');
    console.log('5. Exit');

    const choice = await question('\nSelect option: ');

    switch (choice) {
      case '1':
        await checkVersions();
        break;
      case '2':
        await deployNewVersion();
        break;
      case '3':
        await updateAllAgents();
        break;
      case '4':
        await updateSpecificAgents();
        break;
      case '5':
        rl.close();
        process.exit(0);
      default:
        console.log('Invalid option');
    }
  }
}

async function checkVersions() {
  try {
    const response = await axios.get(`${HUB_URL}/api/agent/update-status`);
    const agents = response.data;

    console.log('\nAgent Versions:');
    console.log('================');
    
    // Group by version
    const versionGroups: { [key: string]: any[] } = {};
    agents.forEach((agent: any) => {
      const version = agent.currentVersion || 'unknown';
      if (!versionGroups[version]) {
        versionGroups[version] = [];
      }
      versionGroups[version].push(agent);
    });

    Object.entries(versionGroups).forEach(([version, agents]) => {
      console.log(`\nVersion ${version}:`);
      agents.forEach(agent => {
        const status = agent.status === 'online' ? '🟢' : '🔴';
        console.log(`  ${status} ${agent.hostname} (${agent.agentId})`);
      });
    });

  } catch (error) {
    console.error('Failed to check versions:', error);
  }
}

async function deployNewVersion() {
  const changelog = await question('\nEnter changelog for new version: ');
  
  if (!changelog) {
    console.log('Changelog is required');
    return;
  }

  try {
    console.log('Building and deploying new version...');
    const response = await axios.post(`${HUB_URL}/api/agent/deploy`, { changelog });
    console.log('✅', response.data.message);
  } catch (error: any) {
    console.error('❌ Failed to deploy:', error.response?.data?.error || error.message);
  }
}

async function updateAllAgents() {
  const force = await question('Force update? (y/N): ');
  
  try {
    console.log('Sending update command to all agents...');
    const response = await axios.post(`${HUB_URL}/api/agent/update`, {
      force: force.toLowerCase() === 'y'
    });
    console.log('✅', response.data.message);
  } catch (error) {
    console.error('Failed to update agents:', error);
  }
}

async function updateSpecificAgents() {
  const agentIds = await question('Enter agent IDs (comma-separated): ');
  const force = await question('Force update? (y/N): ');
  
  if (!agentIds) {
    console.log('No agents specified');
    return;
  }

  const ids = agentIds.split(',').map(id => id.trim());

  try {
    console.log(`Sending update command to ${ids.length} agents...`);
    const response = await axios.post(`${HUB_URL}/api/agent/update`, {
      agentIds: ids,
      force: force.toLowerCase() === 'y'
    });
    console.log('✅', response.data.message);
  } catch (error) {
    console.error('Failed to update agents:', error);
  }
}

// Run the CLI
main().catch(console.error);