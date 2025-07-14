import WebSocket from 'ws';
import * as cron from 'node-cron';
import { 
  Message,
  MessageType,
  CommandRequest,
  CommandResult,
  AgentStatus,
  AgentCapabilities,
  EventNotification,
  CommandCategory
} from '@proxmox-ai-control/shared';
import { ProxmoxAPIWrapper } from './ProxmoxAPIWrapper';
import { ProxmoxCommandExecutor } from './ProxmoxCommandExecutor';
import { ProxmoxCommandParser } from './ProxmoxCommandParser';
import { Logger } from './Logger';

const AGENT_VERSION = '1.0.0';

export class ProxmoxAgent {
  private agentId: string;
  private hubUrl: string;
  private ws?: WebSocket;
  private logger: Logger;
  private proxmoxAPI: ProxmoxAPIWrapper;
  private executor: ProxmoxCommandExecutor;
  private parser: ProxmoxCommandParser;
  private reconnectInterval: number = 5000;
  private heartbeatInterval?: NodeJS.Timeout;
  private monitoringInterval?: NodeJS.Timeout;
  private isConnected: boolean = false;
  private capabilities?: AgentCapabilities;

  constructor(
    agentId: string,
    hubUrl: string,
    proxmoxHost: string,
    proxmoxUser: string,
    proxmoxPassword: string
  ) {
    this.agentId = agentId;
    this.hubUrl = hubUrl;
    this.logger = new Logger(agentId);
    
    // Initialize Proxmox API
    this.proxmoxAPI = new ProxmoxAPIWrapper(
      proxmoxHost,
      proxmoxUser,
      proxmoxPassword,
      this.logger
    );
    
    this.executor = new ProxmoxCommandExecutor(this.proxmoxAPI, this.logger);
    this.parser = new ProxmoxCommandParser();
    
    this.initializeAgent();
  }

  private async initializeAgent(): Promise<void> {
    try {
      // Authenticate to Proxmox
      await this.proxmoxAPI.authenticate();
      this.logger.info('Successfully authenticated to Proxmox API');
      
      // Gather capabilities
      this.capabilities = await this.gatherCapabilities();
      
      // Start connection to hub
      this.connect();
      
      // Setup monitoring
      this.setupMonitoring();
      
      // Handle process signals
      this.setupSignalHandlers();
    } catch (error) {
      this.logger.error('Failed to initialize Proxmox agent', error);
      process.exit(1);
    }
  }

  private async gatherCapabilities(): Promise<AgentCapabilities> {
    const nodes = await this.proxmoxAPI.getNodes();
    const nodeNames = nodes.map(n => n.node);
    
    return {
      os: 'proxmox',
      osVersion: 'PVE 8.x',
      installedServices: ['proxmox-api', 'pve-cluster', 'pve-manager'],
      supportedCommands: [
        CommandCategory.SYSTEM,
        CommandCategory.CONTAINER
      ],
      customCapabilities: [
        'vm-management',
        'container-management',
        'migration',
        'backup',
        'cluster-management',
        `nodes: ${nodeNames.join(', ')}`,
        `version: ${AGENT_VERSION}`
      ]
    };
  }

  private connect(): void {
    this.logger.info(`Connecting to hub at ${this.hubUrl}`);
    
    this.ws = new WebSocket(this.hubUrl, {
      headers: {
        'X-Agent-ID': this.agentId,
        'X-Agent-Token': process.env.AGENT_TOKEN || '',
        'X-Agent-Version': AGENT_VERSION,
        'X-Agent-Type': 'proxmox'
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
      // Re-authenticate if needed (token might expire)
      await this.proxmoxAPI.authenticate();
      
      // Parse command
      const parsedCommand = await this.parser.parse(request.naturalLanguage);
      
      // Execute command
      const result = await this.executor.execute(parsedCommand, request.id);
      
      // Send result
      this.sendMessage({
        id: this.generateId(),
        type: MessageType.COMMAND_RESULT,
        timestamp: new Date(),
        payload: result
      });
      
    } catch (error) {
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
      hostname: 'proxmox-cluster',
      ip: process.env.PROXMOX_HOST || 'unknown',
      status: 'online',
      lastSeen: new Date(),
      version: AGENT_VERSION,
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
        try {
          const nodes = await this.proxmoxAPI.getNodes();
          const resources = await this.proxmoxAPI.getClusterResources();
          
          // Calculate cluster-wide usage
          const totalCPU = nodes.reduce((sum, n) => sum + (n.cpu * n.maxcpu), 0);
          const totalMaxCPU = nodes.reduce((sum, n) => sum + n.maxcpu, 0);
          const totalMem = nodes.reduce((sum, n) => sum + n.mem, 0);
          const totalMaxMem = nodes.reduce((sum, n) => sum + n.maxmem, 0);
          
          const load = {
            cpu: (totalCPU / totalMaxCPU) * 100,
            memory: (totalMem / totalMaxMem) * 100,
            nodes: nodes.length,
            vms: resources.filter(r => r.type === 'qemu' || r.type === 'lxc').length
          };
          
          this.sendMessage({
            id: this.generateId(),
            type: MessageType.AGENT_HEARTBEAT,
            timestamp: new Date(),
            payload: {
              agentId: this.agentId,
              load,
              version: AGENT_VERSION
            }
          });
        } catch (error) {
          this.logger.error('Error in heartbeat', error);
        }
      }
    }, 30000); // Every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  private setupMonitoring(): void {
    // Monitor VM/Container status changes
    cron.schedule('*/2 * * * *', async () => {
      try {
        const vms = await this.proxmoxAPI.getAllVMs();
        
        // Check for stopped VMs that should be running (tagged with 'autostart')
        const autostartVMs = vms.filter(vm => 
          vm.tags?.includes('autostart') && 
          vm.status === 'stopped'
        );
        
        if (autostartVMs.length > 0) {
          this.sendEventNotification({
            eventType: 'custom',
            severity: 'warning',
            message: `${autostartVMs.length} autostart VMs are stopped`,
            details: {
              vms: autostartVMs.map(vm => `${vm.name} (${vm.vmid})`)
            }
          });
        }
        
        // Check for high resource usage
        const nodes = await this.proxmoxAPI.getNodes();
        for (const node of nodes) {
          if (node.cpu > 0.8) {
            this.sendEventNotification({
              eventType: 'high_cpu',
              severity: 'warning',
              message: `High CPU usage on node ${node.node}: ${Math.round(node.cpu * 100)}%`,
              details: { node: node.node, cpu: node.cpu }
            });
          }
          
          if ((node.mem / node.maxmem) > 0.85) {
            this.sendEventNotification({
              eventType: 'high_memory',
              severity: 'warning',
              message: `High memory usage on node ${node.node}: ${Math.round(node.mem / node.maxmem * 100)}%`,
              details: { node: node.node, memory: node.mem, maxMemory: node.maxmem }
            });
          }
        }
      } catch (error) {
        this.logger.error('Error in monitoring', error);
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
    const nodes = await this.proxmoxAPI.getNodes();
    const resources = await this.proxmoxAPI.getClusterResources();
    
    const status: AgentStatus = {
      agentId: this.agentId,
      hostname: 'proxmox-cluster',
      ip: process.env.PROXMOX_HOST || 'unknown',
      status: 'online',
      lastSeen: new Date(),
      version: AGENT_VERSION,
      capabilities: this.capabilities!,
      currentLoad: {
        nodes: nodes.length,
        vms: resources.filter(r => r.type === 'qemu' || r.type === 'lxc').length,
        runningVMs: resources.filter(r => 
          (r.type === 'qemu' || r.type === 'lxc') && r.status === 'running'
        ).length
      }
    };

    this.sendMessage({
      id: this.generateId(),
      type: MessageType.AGENT_HEARTBEAT,
      timestamp: new Date(),
      payload: status
    });
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupSignalHandlers(): void {
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  private shutdown(): void {
    this.logger.info('Shutting down Proxmox agent...');
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
    }
    process.exit(0);
  }
}