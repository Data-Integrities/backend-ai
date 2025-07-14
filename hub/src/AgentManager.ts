import WebSocket from 'ws';
import { 
  AgentStatus, 
  CommandRequest, 
  CommandResult,
  Message,
  MessageType,
  EventNotification
} from '@proxmox-ai-control/shared';
import { EventEmitter } from 'events';

export interface AgentConnection {
  agentId: string;
  ws: WebSocket;
  status: AgentStatus;
  lastSeen: Date;
  commandQueue: CommandRequest[];
}

export class AgentManager extends EventEmitter {
  private agents: Map<string, AgentConnection> = new Map();
  private commandResults: Map<string, CommandResult[]> = new Map();

  constructor() {
    super();
    this.startCleanupInterval();
  }

  addAgent(agentId: string, ws: WebSocket, status: AgentStatus): void {
    const connection: AgentConnection = {
      agentId,
      ws,
      status,
      lastSeen: new Date(),
      commandQueue: []
    };

    this.agents.set(agentId, connection);
    this.emit('agent:connected', status);
    
    console.log(`Agent connected: ${agentId} (${status.hostname})`);
  }

  removeAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.delete(agentId);
      this.emit('agent:disconnected', agent.status);
      console.log(`Agent disconnected: ${agentId}`);
    }
  }

  updateAgentStatus(agentId: string, status: Partial<AgentStatus>): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = { ...agent.status, ...status };
      agent.lastSeen = new Date();
    }
  }

  getAgent(agentId: string): AgentConnection | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): AgentStatus[] {
    return Array.from(this.agents.values()).map(a => a.status);
  }

  getOnlineAgents(): AgentStatus[] {
    return this.getAllAgents().filter(a => a.status === 'online');
  }

  async sendCommand(command: CommandRequest): Promise<void> {
    const targetAgents = command.targetAgents || this.getAllAgents().map(a => a.agentId);
    
    for (const agentId of targetAgents) {
      const agent = this.agents.get(agentId);
      if (agent && agent.ws.readyState === WebSocket.OPEN) {
        const message: Message = {
          id: this.generateMessageId(),
          type: MessageType.COMMAND_REQUEST,
          timestamp: new Date(),
          payload: command
        };

        agent.ws.send(JSON.stringify(message));
        agent.commandQueue.push(command);
        
        console.log(`Command sent to ${agentId}: ${command.naturalLanguage}`);
      } else {
        console.warn(`Agent ${agentId} not available for command`);
        
        // Create error result for unavailable agent
        const errorResult: CommandResult = {
          requestId: command.id,
          agentId: agentId,
          success: false,
          timestamp: new Date(),
          executionTime: 0,
          error: 'Agent not connected'
        };
        
        this.addCommandResult(command.id, errorResult);
      }
    }
  }

  addCommandResult(requestId: string, result: CommandResult): void {
    if (!this.commandResults.has(requestId)) {
      this.commandResults.set(requestId, []);
    }
    
    this.commandResults.get(requestId)!.push(result);
    this.emit('command:result', { requestId, result });
  }

  getCommandResults(requestId: string): CommandResult[] {
    return this.commandResults.get(requestId) || [];
  }

  handleEventNotification(agentId: string, event: EventNotification): void {
    console.log(`Event from ${agentId}: ${event.eventType} - ${event.message}`);
    this.emit('agent:event', { agentId, event });
  }

  broadcastMessage(message: Message, excludeAgent?: string): void {
    const messageStr = JSON.stringify(message);
    
    this.agents.forEach((agent, agentId) => {
      if (agentId !== excludeAgent && agent.ws.readyState === WebSocket.OPEN) {
        agent.ws.send(messageStr);
      }
    });
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      const timeout = 60000; // 1 minute
      
      this.agents.forEach((agent, agentId) => {
        if (now - agent.lastSeen.getTime() > timeout) {
          console.warn(`Agent ${agentId} timed out`);
          this.removeAgent(agentId);
        }
      });
      
      // Clean up old command results (older than 1 hour)
      const resultTimeout = 3600000;
      this.commandResults.forEach((results, requestId) => {
        if (results.length > 0) {
          const oldestResult = results[0];
          if (now - oldestResult.timestamp.getTime() > resultTimeout) {
            this.commandResults.delete(requestId);
          }
        }
      });
    }, 30000); // Run every 30 seconds
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getAgentStats(): any {
    const stats = {
      totalAgents: this.agents.size,
      onlineAgents: this.getOnlineAgents().length,
      agents: Array.from(this.agents.values()).map(agent => ({
        id: agent.agentId,
        hostname: agent.status.hostname,
        ip: agent.status.ip,
        status: agent.status.status,
        lastSeen: agent.lastSeen,
        capabilities: agent.status.capabilities,
        currentLoad: agent.status.currentLoad,
        pendingCommands: agent.commandQueue.length
      }))
    };
    
    return stats;
  }
}