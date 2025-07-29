import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import { CapabilitySyncManager } from './capability-sync';
import { ConfigLoader, AgentStatus } from '@proxmox-ai-control/shared';

interface AgentConfig {
  'agent-name': string;
  ip: string;
  port?: number;
  aliases: string[];
}

interface AgentInfo {
  name: string;
  ip: string;
  port: number;
  aliases: string[];
  isOnline: boolean;
  lastSeen?: string;  // Changed from Date to string for ISO format
  version?: string;
  agentVersion?: string;  // Added for compatibility
  managerVersion?: string;
  workingDirectory?: string;
  systemInfo?: any;  // Added for system information
  capabilities?: any;
  capabilitiesFetched?: Date;
  correlationId?: string;
  pendingCorrelationId?: string;
}

export class SimpleHttpAgents {
  private agents: Map<string, AgentInfo> = new Map();
  private pollInterval: NodeJS.Timeout | null = null;
  private capabilitySync: CapabilitySyncManager;
  private configLoader: ConfigLoader;
  private correlationCallbacks: Map<string, (agent: AgentInfo) => void> = new Map();

  constructor() {
    this.capabilitySync = new CapabilitySyncManager();
    this.configLoader = ConfigLoader.getInstance();
  }

  async loadConfig(): Promise<void> {
    try {
      // Load config from ConfigLoader
      const config = this.configLoader.getConfig();
      
      // Build agents map from config
      this.agents.clear();
      for (const agent of config.agents) {
        this.agents.set(agent.name, {
          name: agent.name,
          ip: agent.ip,
          port: config.defaults.agent.port,
          aliases: agent.aliases,
          isOnline: false
        });
      }
      
      await this.capabilitySync.loadCachedCapabilities();
      this.startPolling();
    } catch (error) {
      console.error('Failed to load agents config:', error);
    }
  }

  private async reloadConfigIfChanged(): Promise<boolean> {
    try {
      // Reload config from ConfigLoader
      const config = this.configLoader.getConfig();
      
      // Build new agents map
      const newAgents = new Map<string, AgentInfo>();
      
      for (const agent of config.agents) {
        const existingAgent = this.agents.get(agent.name);
        newAgents.set(agent.name, {
          name: agent.name,
          ip: agent.ip,
          port: config.defaults.agent.port,
          aliases: agent.aliases,
          // Preserve online status if agent already existed
          isOnline: existingAgent?.isOnline || false,
          lastSeen: existingAgent?.lastSeen,
          version: existingAgent?.version,
          managerVersion: existingAgent?.managerVersion,
          workingDirectory: existingAgent?.workingDirectory,
          capabilities: existingAgent?.capabilities,
          capabilitiesFetched: existingAgent?.capabilitiesFetched,
          correlationId: existingAgent?.correlationId,
          pendingCorrelationId: existingAgent?.pendingCorrelationId
        });
      }
      
      // Replace agents map
      this.agents = newAgents;
      
      console.log(`Reloaded config: ${this.agents.size} agents`);
      return true;
    } catch (error) {
      console.error('Failed to reload agents config:', error);
      return false;
    }
  }

  private startPolling(): void {
    // Poll immediately
    this.pollAgents();
    
    // Then every 30 seconds (matching the hub's polling interval)
    this.pollInterval = setInterval(() => {
      this.pollAgents();
    }, 30000);
  }

  private async pollAgents(): Promise<void> {
    // Reload config if it has changed
    await this.reloadConfigIfChanged();
    
    // Poll all agents
    for (const agent of this.agents.values()) {
      try {
        const response = await axios.get(`http://${agent.ip}:${agent.port}/api/status`, {
          timeout: 5000,
          headers: {}
        });
        agent.isOnline = true;
        agent.lastSeen = new Date().toISOString();
        // Store version and working directory if available
        if (response.data) {
          if (response.data.version) {
            agent.version = response.data.version;
          }
          if (response.data.workingDirectory) {
            agent.workingDirectory = response.data.workingDirectory;
          }
          
          // Check if agent is reporting a correlationId
          if (response.data.correlationId && agent.pendingCorrelationId === response.data.correlationId) {
            console.log(`[CORRELATION] Agent ${agent.name} started with correlationId: ${response.data.correlationId}`);
            agent.correlationId = response.data.correlationId;
            agent.pendingCorrelationId = undefined;
            
            // Notify correlation tracker that polling detected the change
            const { correlationTracker } = require('./correlation-tracker');
            correlationTracker.addLog(response.data.correlationId, `[POLLING] Detected ${agent.name} is online via polling`);
            correlationTracker.recordPollingDetection(response.data.correlationId);
            
            // Call any registered callbacks
            const callback = this.correlationCallbacks.get(response.data.correlationId);
            if (callback) {
              callback(agent);
              this.correlationCallbacks.delete(response.data.correlationId);
            }
          }
        }
        
        // Fetch capabilities if not cached or older than 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        if (!agent.capabilitiesFetched || agent.capabilitiesFetched < fiveMinutesAgo) {
          try {
            const capResponse = await axios.get(`http://${agent.ip}:${agent.port}/api/capabilities`, {
              timeout: 5000,
              headers: {}
            });
            agent.capabilities = capResponse.data;
            agent.capabilitiesFetched = new Date();
            console.log(`Fetched capabilities for ${agent.name}:`, agent.capabilities.summary);
            
            // Sync README-based capabilities
            const updated = await this.capabilitySync.syncAgentCapabilities(
              agent.name, 
              `http://${agent.ip}:${agent.port}`,
              undefined
            );
            if (updated) {
              console.log(`Synced capabilities for ${agent.name}`);
            }
          } catch (error) {
            console.log(`No capabilities endpoint for ${agent.name} (this is ok for older agents)`);
          }
        }
      } catch {
        // Check if agent is going offline with a pending correlationId (stop operation)
        if (agent.isOnline && agent.pendingCorrelationId) {
          console.log(`[CORRELATION] Agent ${agent.name} went offline with correlationId: ${agent.pendingCorrelationId}`);
          
          // Notify correlation tracker that polling detected the agent offline
          const { correlationTracker } = require('./correlation-tracker');
          correlationTracker.addLog(agent.pendingCorrelationId, `[POLLING] Detected ${agent.name} is offline via polling`);
          correlationTracker.recordPollingDetection(agent.pendingCorrelationId);
          
          // Clear the pending correlationId
          agent.pendingCorrelationId = undefined;
        }
        
        agent.isOnline = false;
      }
      
      // Check manager status independently of agent status
      try {
        const managerUrl = `http://${agent.ip}:3081/status`;
        console.log(`[Manager Check] Polling manager at ${managerUrl}`);
        const managerResponse = await axios.get(managerUrl, {
          timeout: 2000,
          headers: {}
        });
        if (managerResponse.data && managerResponse.data.managerVersion) {
          const previousManagerVersion = agent.managerVersion;
          agent.managerVersion = managerResponse.data.managerVersion;
          console.log(`[Manager Check] ${agent.name} manager version: ${agent.managerVersion}`);
          
          // Check if this is a manager that just came online with a pending start operation
          if (!previousManagerVersion && agent.managerVersion && agent.pendingCorrelationId) {
            console.log(`[CORRELATION] Manager ${agent.name} detected online with pending correlationId: ${agent.pendingCorrelationId}`);
            
            // Import correlation tracker and complete the operation
            const { correlationTracker } = require('./correlation-tracker');
            correlationTracker.addLog(agent.pendingCorrelationId, `[POLLING] Detected ${agent.name} manager is online via polling`);
            correlationTracker.recordPollingDetection(agent.pendingCorrelationId);
            correlationTracker.completeExecution(agent.pendingCorrelationId, { 
              result: 'Manager started successfully (detected by polling)',
              managerVersion: agent.managerVersion 
            });
            
            // Clear the pending correlationId
            agent.pendingCorrelationId = undefined;
          }
        } else {
          console.log(`[Manager Check] ${agent.name} manager response missing version:`, managerResponse.data);
        }
      } catch (error: any) {
        // Manager might not be available or updated yet
        console.log(`[Manager Check] Failed to get manager status for ${agent.name}:`, error.message);
        const previousManagerVersion = agent.managerVersion;
        agent.managerVersion = undefined;
        
        // Check if manager went offline with a pending stop operation
        if (previousManagerVersion && !agent.managerVersion && agent.pendingCorrelationId) {
          console.log(`[CORRELATION] Manager ${agent.name} detected offline with pending correlationId: ${agent.pendingCorrelationId}`);
          
          // Import correlation tracker and complete the operation
          const { correlationTracker } = require('./correlation-tracker');
          correlationTracker.addLog(agent.pendingCorrelationId, `[POLLING] Detected ${agent.name} manager is offline via polling`);
          correlationTracker.recordPollingDetection(agent.pendingCorrelationId);
          correlationTracker.completeExecution(agent.pendingCorrelationId, { 
            result: 'Manager stopped successfully (detected by polling)'
          });
          
          // Clear the pending correlationId
          agent.pendingCorrelationId = undefined;
        }
      }
    }
  }

  getAgentsForApi(): any {
    const agents = Array.from(this.agents.values());
    return {
      totalAgents: agents.length,
      onlineAgents: agents.filter(a => a.isOnline).length,
      agents: agents
    };
  }

  async reloadConfig(): Promise<void> {
    await this.reloadConfigIfChanged();
  }

  async sendCommand(agentName: string, command: string, options?: { correlationId?: string; async?: boolean; requestId?: string }): Promise<any> {
    const agent = this.agents.get(agentName);
    if (!agent || !agent.isOnline) {
      throw new Error(`Agent ${agentName} not found or offline`);
    }

    try {
      const response = await axios.post(`http://${agent.ip}:${agent.port}/api/execute`, {
        command,
        ...options
      }, {
        timeout: 30000 // 30 second timeout
      });
      return response.data;
    } catch (error) {
      console.error(`Failed to send command to ${agentName}:`, error);
      throw error;
    }
  }

  async sendChatCommand(agentName: string, command: string, options?: { correlationId?: string; skipConfirmation?: boolean; tabId?: string }): Promise<any> {
    const agent = this.agents.get(agentName);
    if (!agent || !agent.isOnline) {
      throw new Error(`Agent ${agentName} not found or offline`);
    }

    try {
      const response = await axios.post(`http://${agent.ip}:${agent.port}/api/chat`, {
        command,
        ...options
      }, {
        timeout: 30000 // 30 second timeout
      });
      return response.data;
    } catch (error: any) {
      console.error(`Failed to send chat command to ${agentName}:`, error);
      
      // Extract meaningful error message without raw response data
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        throw new Error(`Agent ${agentName} returned error: ${error.response.status} - ${error.response.statusText}`);
      } else if (error.request) {
        // The request was made but no response was received
        throw new Error(`No response from agent ${agentName}: ${error.message}`);
      } else {
        // Something happened in setting up the request
        throw new Error(`Failed to send command to ${agentName}: ${error.message}`);
      }
    }
  }

  getAgent(name: string): AgentInfo | undefined {
    return this.agents.get(name);
  }

  getAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  getAgentConfig(name: string): any | undefined {
    const config = this.configLoader.getConfig();
    return config.agents.find((agent: any) => agent.name === name);
  }

  getServiceManagers(): any {
    const config = this.configLoader.getConfig();
    return config.serviceManagers || {};
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }
  
  // Check status of a single agent
  async checkSingleAgentStatus(agentName: string): Promise<void> {
    const agent = this.agents.get(agentName);
    if (!agent) {
      console.log(`[POLL] Agent ${agentName} not found`);
      return;
    }
    
    console.log(`[POLL] Checking status of ${agentName} on demand`);
    
    try {
      // Check agent status
      const response = await axios.get(`http://${agent.ip}:${agent.port}/api/status`, {
        timeout: 5000,
        headers: {}
      });
      
      agent.isOnline = true;
      agent.lastSeen = new Date().toISOString();
      
      if (response.data) {
        // Store basic status information
        agent.agentVersion = response.data.version || '';
        agent.systemInfo = response.data.systemInfo || {};
      }
    } catch {
      agent.isOnline = false;
    }
    
    // Check manager status
    try {
      const managerResponse = await axios.get(`http://${agent.ip}:3081/status`, {
        timeout: 2000,
        headers: {}
      });
      if (managerResponse.data && managerResponse.data.managerVersion) {
        agent.managerVersion = managerResponse.data.managerVersion;
      }
    } catch {
      agent.managerVersion = '';
    }
    
    console.log(`[POLL] ${agentName} status: Agent=${agent.isOnline ? 'online' : 'offline'}, Manager=${agent.managerVersion ? 'online' : 'offline'}`);
  }

  getCapabilitySync(): CapabilitySyncManager {
    return this.capabilitySync;
  }

  setPendingCorrelationId(agentName: string, correlationId: string, callback?: (agent: AgentInfo) => void): void {
    const agent = this.agents.get(agentName);
    if (agent) {
      agent.pendingCorrelationId = correlationId;
      console.log(`[CORRELATION] Set pending correlationId ${correlationId} for agent ${agentName}`);
      
      if (callback) {
        this.correlationCallbacks.set(correlationId, callback);
      }
    }
  }

  clearPendingCorrelationId(agentName: string): void {
    const agent = this.agents.get(agentName);
    if (agent && agent.pendingCorrelationId) {
      this.correlationCallbacks.delete(agent.pendingCorrelationId);
      agent.pendingCorrelationId = undefined;
    }
  }

  getAgentByCorrelationId(correlationId: string): AgentInfo | undefined {
    for (const agent of this.agents.values()) {
      if (agent.correlationId === correlationId || agent.pendingCorrelationId === correlationId) {
        return agent;
      }
    }
    return undefined;
  }
}