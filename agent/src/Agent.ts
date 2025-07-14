import WebSocket from 'ws';
import * as si from 'systeminformation';
import * as cron from 'node-cron';
import { 
  Message,
  MessageType,
  CommandRequest,
  CommandResult,
  AgentStatus,
  AgentCapabilities,
  EventNotification,
  ParsedCommand,
  CommandCategory
} from '@proxmox-ai-control/shared';
import { CommandExecutor } from './CommandExecutor';
import { Logger } from './Logger';
import { CommandParser } from './CommandParser';

export class Agent {
  private agentId: string;
  private hubUrl: string;
  private ws?: WebSocket;
  private logger: Logger;
  private executor: CommandExecutor;
  private parser: CommandParser;
  private reconnectInterval: number = 5000;
  private heartbeatInterval?: NodeJS.Timeout;
  private isConnected: boolean = false;
  private capabilities?: AgentCapabilities;

  constructor(agentId: string, hubUrl: string) {
    this.agentId = agentId;
    this.hubUrl = hubUrl;
    this.logger = new Logger(agentId);
    this.executor = new CommandExecutor(this.logger);
    this.parser = new CommandParser();
    
    this.initializeAgent();
  }

  private async initializeAgent(): Promise<void> {
    // Gather system capabilities
    this.capabilities = await this.gatherCapabilities();
    
    // Start connection to hub
    this.connect();
    
    // Setup monitoring
    this.setupMonitoring();
    
    // Handle process signals
    this.setupSignalHandlers();
  }

  private async gatherCapabilities(): Promise<AgentCapabilities> {
    const osInfo = await si.osInfo();
    const services = await this.getInstalledServices();
    
    return {
      os: osInfo.platform,
      osVersion: osInfo.release,
      installedServices: services,
      supportedCommands: [
        CommandCategory.SERVICE,
        CommandCategory.CONFIG,
        CommandCategory.DEBUG,
        CommandCategory.SYSTEM,
        CommandCategory.NETWORK,
        CommandCategory.FILE,
        CommandCategory.PROCESS
      ]
    };
  }

  private async getInstalledServices(): Promise<string[]> {
    const services: string[] = [];
    
    // Check common services
    const commonServices = ['nginx', 'apache2', 'mysql', 'postgresql', 'redis', 'docker', 'ssh'];
    for (const service of commonServices) {
      try {
        const serviceInfo = await si.services(service);
        if (serviceInfo && serviceInfo.length > 0) {
          services.push(service);
        }
      } catch (error) {
        // Service not found
      }
    }
    
    return services;
  }

  private connect(): void {
    this.logger.info(`Connecting to hub at ${this.hubUrl}`);
    
    this.ws = new WebSocket(this.hubUrl, {
      headers: {
        'X-Agent-ID': this.agentId,
        'X-Agent-Token': process.env.AGENT_TOKEN || ''
      }
    });

    this.ws.on('open', () => {
      this.isConnected = true;
      this.logger.info('Connected to hub');
      this.sendRegistration();
      this.startHeartbeat();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.handleMessage(data.toString());
    });

    this.ws.on('error', (error: Error) => {
      this.logger.error('WebSocket error', error);
    });

    this.ws.on('close', () => {
      this.isConnected = false;
      this.logger.warn('Disconnected from hub');
      this.stopHeartbeat();
      
      // Reconnect after delay
      setTimeout(() => {
        if (!this.isConnected) {
          this.connect();
        }
      }, this.reconnectInterval);
    });
  }

  private async handleMessage(data: string): Promise<void> {
    try {
      const message: Message = JSON.parse(data);
      
      switch (message.type) {
        case MessageType.COMMAND_REQUEST:
          await this.handleCommandRequest(message.payload as CommandRequest);
          break;
        case MessageType.HEALTH_CHECK:
          await this.sendHealthStatus();
          break;
        case MessageType.CONFIG_UPDATE:
          await this.handleConfigUpdate(message.payload);
          break;
        default:
          this.logger.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      this.logger.error('Error handling message', error);
    }
  }

  private async handleCommandRequest(request: CommandRequest): Promise<void> {
    this.logger.info(`Received command: ${request.naturalLanguage}`);
    
    try {
      // Parse natural language to command
      const parsedCommand = await this.parser.parse(request.naturalLanguage);
      
      // Execute command
      const result = await this.executor.execute(parsedCommand, request.id);
      
      // Send result back to hub
      this.sendMessage({
        id: this.generateId(),
        type: MessageType.COMMAND_RESULT,
        timestamp: new Date(),
        payload: result
      });
      
    } catch (error) {
      // Send error result
      const errorResult: CommandResult = {
        requestId: request.id,
        agentId: this.agentId,
        success: false,
        timestamp: new Date(),
        executionTime: 0,
        error: error instanceof Error ? error.message : String(error)
      };
      
      this.sendMessage({
        id: this.generateId(),
        type: MessageType.COMMAND_RESULT,
        timestamp: new Date(),
        payload: errorResult
      });
    }
  }

  private sendRegistration(): void {
    const status: AgentStatus = {
      agentId: this.agentId,
      hostname: process.env.HOSTNAME || 'unknown',
      ip: this.getLocalIP(),
      status: 'online',
      lastSeen: new Date(),
      version: '1.0.0',
      capabilities: this.capabilities!
    };

    this.sendMessage({
      id: this.generateId(),
      type: MessageType.AGENT_REGISTER,
      timestamp: new Date(),
      payload: status
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      if (this.isConnected) {
        const load = await this.getCurrentLoad();
        
        this.sendMessage({
          id: this.generateId(),
          type: MessageType.AGENT_HEARTBEAT,
          timestamp: new Date(),
          payload: {
            agentId: this.agentId,
            load
          }
        });
      }
    }, 30000); // Every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  private async getCurrentLoad(): Promise<any> {
    const [cpu, mem, disk] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize()
    ]);

    return {
      cpu: cpu.currentLoad,
      memory: (mem.used / mem.total) * 100,
      disk: disk[0] ? (disk[0].used / disk[0].size) * 100 : 0
    };
  }

  private setupMonitoring(): void {
    // Monitor CPU usage
    cron.schedule('*/5 * * * *', async () => {
      const load = await si.currentLoad();
      if (load.currentLoad > 80) {
        this.sendEventNotification({
          eventType: 'high_cpu',
          severity: 'warning',
          message: `High CPU usage detected: ${load.currentLoad.toFixed(2)}%`,
          details: { cpu: load }
        });
      }
    });

    // Monitor memory usage
    cron.schedule('*/5 * * * *', async () => {
      const mem = await si.mem();
      const usagePercent = (mem.used / mem.total) * 100;
      if (usagePercent > 85) {
        this.sendEventNotification({
          eventType: 'high_memory',
          severity: 'warning',
          message: `High memory usage detected: ${usagePercent.toFixed(2)}%`,
          details: { memory: mem }
        });
      }
    });

    // Monitor disk usage
    cron.schedule('*/15 * * * *', async () => {
      const disks = await si.fsSize();
      for (const disk of disks) {
        const usagePercent = (disk.used / disk.size) * 100;
        if (usagePercent > 90) {
          this.sendEventNotification({
            eventType: 'disk_full',
            severity: 'critical',
            message: `Disk nearly full on ${disk.mount}: ${usagePercent.toFixed(2)}%`,
            details: { disk }
          });
        }
      }
    });
  }

  private sendEventNotification(event: Omit<EventNotification, 'agentId' | 'timestamp'>): void {
    const notification: EventNotification = {
      ...event,
      agentId: this.agentId,
      timestamp: new Date()
    };

    this.sendMessage({
      id: this.generateId(),
      type: MessageType.EVENT_NOTIFICATION,
      timestamp: new Date(),
      payload: notification
    });
  }

  private sendMessage(message: Message): void {
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private async sendHealthStatus(): Promise<void> {
    const status: AgentStatus = {
      agentId: this.agentId,
      hostname: process.env.HOSTNAME || 'unknown',
      ip: this.getLocalIP(),
      status: 'online',
      lastSeen: new Date(),
      version: '1.0.0',
      capabilities: this.capabilities!,
      currentLoad: await this.getCurrentLoad()
    };

    this.sendMessage({
      id: this.generateId(),
      type: MessageType.AGENT_HEARTBEAT,
      timestamp: new Date(),
      payload: status
    });
  }

  private handleConfigUpdate(config: any): void {
    this.logger.info('Received config update', config);
    // TODO: Implement config update logic
  }

  private getLocalIP(): string {
    const nets = require('os').networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
    return '127.0.0.1';
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupSignalHandlers(): void {
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  private shutdown(): void {
    this.logger.info('Shutting down agent...');
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
    }
    process.exit(0);
  }
}