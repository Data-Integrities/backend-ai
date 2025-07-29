import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { Express } from 'express';
import { SimpleHttpAgents } from './SimpleHttpAgents';

const execAsync = promisify(exec);

const SSH_KEY_PATH = '/root/.ssh/id_ed25519';
const SSH_PUB_KEY_PATH = '/root/.ssh/id_ed25519.pub';

export class SSHManager {
  private publicKey: string | null = null;
  
  async initialize(): Promise<void> {
    try {
      // Check if SSH key exists
      await fs.access(SSH_KEY_PATH);
      console.log('[SSH] Existing SSH key found');
    } catch {
      // Generate new SSH key pair
      console.log('[SSH] Generating new SSH key pair...');
      await execAsync(`ssh-keygen -t ed25519 -f ${SSH_KEY_PATH} -N ""`);
      console.log('[SSH] SSH key pair generated');
    }
    
    // Read public key
    this.publicKey = await fs.readFile(SSH_PUB_KEY_PATH, 'utf-8');
    this.publicKey = this.publicKey.trim();
    console.log('[SSH] Public key loaded');
  }
  
  getPublicKey(): string | null {
    return this.publicKey;
  }
  
  async setupAgentSSH(agentIp: string, accessUser: string = 'root'): Promise<void> {
    if (!this.publicKey) {
      throw new Error('SSH key not initialized');
    }
    
    console.log(`[SSH] Setting up SSH access to ${agentIp}...`);
    
    // First, check if we already have access
    try {
      await execAsync(`ssh -o BatchMode=yes -o ConnectTimeout=5 ${accessUser}@${agentIp} "echo 'SSH test'"`, {
        env: { ...process.env, SSH_AUTH_SOCK: '' }
      });
      console.log(`[SSH] Already have SSH access to ${agentIp}`);
      return;
    } catch {
      // Need to set up access
      console.log(`[SSH] Need to configure SSH access to ${agentIp}`);
    }
    
    // Since we can't SSH directly, we'll need to provide instructions
    throw new Error(`Manual SSH setup required for ${agentIp}. Add this public key to ${accessUser}@${agentIp}:~/.ssh/authorized_keys:\n${this.publicKey}`);
  }
}

export function setupSSHEndpoints(app: Express, httpAgents: SimpleHttpAgents, sshManager: SSHManager) {
  // Get hub's SSH public key
  app.get('/api/ssh/public-key', (req, res) => {
    const publicKey = sshManager.getPublicKey();
    if (!publicKey) {
      return res.status(500).json({ error: 'SSH key not initialized' });
    }
    
    res.json({ 
      publicKey,
      instructions: 'Add this key to each agent host\'s ~/.ssh/authorized_keys file'
    });
  });
  
  // Setup SSH for a specific agent
  app.post('/api/ssh/setup/:agentName', async (req, res) => {
    const { agentName } = req.params;
    const agent = httpAgents.getAgent(agentName);
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    const agentConfig = httpAgents.getAgentConfig(agentName);
    const accessUser = agentConfig?.accessUser || 'root';
    
    try {
      await sshManager.setupAgentSSH(agent.ip, accessUser);
      res.json({ success: true, message: `SSH access configured for ${agentName}` });
    } catch (error: any) {
      res.status(400).json({ 
        success: false, 
        error: error.message,
        manual: error.message.includes('Manual SSH setup required')
      });
    }
  });
  
  // Batch setup SSH for all agents
  app.post('/api/ssh/setup-all', async (req, res) => {
    const agents = httpAgents.getAgents();
    const results = [];
    const publicKey = sshManager.getPublicKey();
    
    if (!publicKey) {
      return res.status(500).json({ error: 'SSH key not initialized' });
    }
    
    // Generate setup script
    const setupScript = agents.map(agent => {
      const agentConfig = httpAgents.getAgentConfig(agent.name);
      const accessUser = agentConfig?.accessUser || 'root';
      return `echo '${publicKey}' | ssh ${accessUser}@${agent.ip} "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"`;
    }).join('\n');
    
    res.json({
      publicKey,
      agents: agents.map(a => ({ name: a.name, ip: a.ip })),
      setupScript,
      instructions: 'Run these commands from a machine that already has SSH access to all agents'
    });
  });
  
  // Test SSH connectivity to all agents
  app.get('/api/ssh/test', async (req, res) => {
    const agents = httpAgents.getAgents();
    const results = [];
    
    for (const agent of agents) {
      const agentConfig = httpAgents.getAgentConfig(agent.name);
      const accessUser = agentConfig?.accessUser || 'root';
      
      try {
        await execAsync(`ssh -o BatchMode=yes -o ConnectTimeout=5 ${accessUser}@${agent.ip} "echo 'OK'"`, {
          env: { ...process.env, SSH_AUTH_SOCK: '' }
        });
        results.push({
          agent: agent.name,
          ip: agent.ip,
          sshAccess: true
        });
      } catch {
        results.push({
          agent: agent.name,
          ip: agent.ip,
          sshAccess: false
        });
      }
    }
    
    res.json({
      totalAgents: agents.length,
      sshConfigured: results.filter(r => r.sshAccess).length,
      results
    });
  });
}