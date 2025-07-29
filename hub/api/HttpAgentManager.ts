import { promises as fs } from 'fs';
import path from 'path';
import axios from 'axios';

export interface AgentConfig {
  'agent-name': string;
  ip: string;
  port: number;
  aliases: string[];
}

export interface AgentStatus {
  name: string;
  ip: string;
  port: number;
  aliases: string[];
  isOnline: boolean;
  lastSeen?: Date;
  version?: string;
  services?: string[];
}

export class HttpAgentManager {
  private agents: Map<string, AgentStatus> = new Map();
  private configPath: string;
  private pollInterval: NodeJS.Timeout | null = null;
  private pollIntervalMs = 60000; // 1 minute

  constructor(configPath: string = './agents-config.json') {
    this.configPath = configPath;
  }

  async initialize(): Promise<void> {
    await this.loadAgentsConfig();
    this.startPolling();
  }

  async loadAgentsConfig(): Promise<void> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configContent);
      
      // Clear existing agents
      this.agents.clear();
      
      // Load agents from config
      for (const agentConfig of config.agents) {
        const agentStatus: AgentStatus = {
          name: agentConfig['agent-name'],
          ip: agentConfig.ip,
          port: agentConfig.port || 3050,
          aliases: agentConfig.aliases || [],
          isOnline: false
        };
        
        this.agents.set(agentStatus.name, agentStatus);
      }
      
      console.log(`Loaded ${this.agents.size} agents from config`);
      
      // Do initial poll immediately
      await this.pollAgents();
    } catch (error) {
      console.error('Failed to load agents config:', error);
    }
  }

  private startPolling(): void {
    // Poll immediately, then every minute
    this.pollInterval = setInterval(() => {
      this.pollAgents().catch(err => 
        console.error('Error polling agents:', err)
      );
    }, this.pollIntervalMs);
  }

  private async pollAgents(): Promise<void> {
    const pollPromises = Array.from(this.agents.values()).map(agent => 
      this.checkAgentStatus(agent)
    );
    
    await Promise.allSettled(pollPromises);
  }

  private async checkAgentStatus(agent: AgentStatus): Promise<void> {
    try {
      const response = await axios.get(`http://${agent.ip}:${agent.port}/api/status`, {
        timeout: 5000 // 5 second timeout
      });
      
      agent.isOnline = true;
      agent.lastSeen = new Date();
      
      // Extract additional info if provided
      if (response.data) {
        agent.version = response.data.version;
        agent.services = response.data.services;
      }
    } catch (error) {
      agent.isOnline = false;
      // Keep lastSeen from previous successful check
    }
  }

  getAgents(): AgentStatus[] {
    return Array.from(this.agents.values());
  }

  getAgent(nameOrAlias: string): AgentStatus | undefined {
    // First try direct name match
    const directMatch = this.agents.get(nameOrAlias);
    if (directMatch) return directMatch;
    
    // Then try alias match
    for (const agent of this.agents.values()) {
      if (agent.aliases.some(alias => 
        alias.toLowerCase() === nameOrAlias.toLowerCase()
      )) {
        return agent;
      }
    }
    
    return undefined;
  }

  getOnlineAgents(): AgentStatus[] {
    return this.getAgents().filter(agent => agent.isOnline);
  }

  async sendCommand(agentName: string, command: any): Promise<any> {
    const agent = this.getAgent(agentName);
    if (!agent) {
      throw new Error(`Agent ${agentName} not found`);
    }
    
    if (!agent.isOnline) {
      throw new Error(`Agent ${agentName} is offline`);
    }
    
    try {
      const response = await axios.post(
        `http://${agent.ip}:${agent.port}/api/command`,
        command,
        { timeout: 30000 } // 30 second timeout for commands
      );
      
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to send command to ${agentName}: ${error.message}`);
    }
  }

  async executeAgentOperation(agentName: string, operation: string): Promise<any> {
    const agent = this.getAgent(agentName);
    if (!agent) {
      throw new Error(`Agent ${agentName} not found`);
    }
    
    try {
      const response = await axios.post(
        `http://${agent.ip}:${agent.port}/api/agent/${operation}`,
        {},
        { timeout: 10000 }
      );
      
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to execute ${operation} on ${agentName}: ${error.message}`);
    }
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}