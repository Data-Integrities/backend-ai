import { WebSocketServer as WSServer } from 'ws';
import { 
  Message, 
  MessageType, 
  AgentStatus,
  CommandResult,
  EventNotification,
  AuthRequest,
  AuthResponse
} from '@proxmox-ai-control/shared';
import { AgentManager } from './AgentManager';
import jwt from 'jsonwebtoken';

export class WebSocketServer {
  private wss: WSServer;
  private agentManager: AgentManager;
  private jwtSecret: string;

  constructor(port: number, agentManager: AgentManager) {
    this.agentManager = agentManager;
    this.jwtSecret = process.env.JWT_SECRET || 'default-secret-change-me';
    
    this.wss = new WSServer({ port });
    this.setupWebSocketServer();
    
    console.log(`WebSocket server listening on port ${port}`);
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws, req) => {
      console.log('New WebSocket connection attempt');
      
      let agentId: string | null = null;
      let authenticated = false;

      // Get agent ID from headers
      const headerAgentId = req.headers['x-agent-id'] as string;
      const headerToken = req.headers['x-agent-token'] as string;

      ws.on('message', (data: Buffer) => {
        try {
          const message: Message = JSON.parse(data.toString());
          
          // Handle authentication first
          if (!authenticated && message.type === MessageType.AGENT_REGISTER) {
            const authPayload = message.payload as AgentStatus;
            agentId = authPayload.agentId;
            
            // Simple authentication - in production, verify token
            if (this.authenticateAgent(agentId, headerToken)) {
              authenticated = true;
              this.agentManager.addAgent(agentId, ws, authPayload);
              
              // Send auth success
              const authResponse: Message = {
                id: this.generateMessageId(),
                type: MessageType.AUTH_RESPONSE,
                timestamp: new Date(),
                payload: {
                  success: true,
                  token: this.generateAgentToken(agentId)
                } as AuthResponse
              };
              ws.send(JSON.stringify(authResponse));
            } else {
              // Send auth failure
              const authResponse: Message = {
                id: this.generateMessageId(),
                type: MessageType.AUTH_RESPONSE,
                timestamp: new Date(),
                payload: {
                  success: false,
                  error: 'Authentication failed'
                } as AuthResponse
              };
              ws.send(JSON.stringify(authResponse));
              ws.close(1008, 'Authentication failed');
            }
            return;
          }

          // Require authentication for all other messages
          if (!authenticated || !agentId) {
            ws.close(1008, 'Not authenticated');
            return;
          }

          // Handle other message types
          switch (message.type) {
            case MessageType.COMMAND_RESULT:
              const result = message.payload as CommandResult;
              this.agentManager.addCommandResult(result.requestId, result);
              break;

            case MessageType.AGENT_HEARTBEAT:
              this.agentManager.updateAgentStatus(agentId, {
                lastSeen: new Date(),
                currentLoad: message.payload.load
              });
              break;

            case MessageType.EVENT_NOTIFICATION:
              const event = message.payload as EventNotification;
              this.agentManager.handleEventNotification(agentId, event);
              break;

            default:
              console.warn(`Unknown message type from ${agentId}: ${message.type}`);
          }
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        if (agentId) {
          this.agentManager.removeAgent(agentId);
        }
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for agent ${agentId}:`, error);
      });

      // Send initial discovery message
      const discoveryMessage: Message = {
        id: this.generateMessageId(),
        type: MessageType.AGENT_DISCOVERY,
        timestamp: new Date(),
        payload: {
          hubVersion: '1.0.0',
          capabilities: ['command', 'monitoring', 'config']
        }
      };
      ws.send(JSON.stringify(discoveryMessage));
    });
  }

  private authenticateAgent(agentId: string, token?: string): boolean {
    // Simple authentication - in production, implement proper auth
    if (process.env.REQUIRE_AUTH === 'false') {
      return true;
    }

    if (!token) {
      return false;
    }

    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      return decoded.agentId === agentId;
    } catch {
      // For initial setup, allow agents without tokens
      const allowedAgents = process.env.ALLOWED_AGENTS?.split(',') || [];
      return allowedAgents.includes(agentId);
    }
  }

  private generateAgentToken(agentId: string): string {
    return jwt.sign({ agentId }, this.jwtSecret, { expiresIn: '7d' });
  }

  private generateMessageId(): string {
    return `hub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  broadcast(message: Message): void {
    this.agentManager.broadcastMessage(message);
  }

  stop(): void {
    this.wss.close();
  }
}