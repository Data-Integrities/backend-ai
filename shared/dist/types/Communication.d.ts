export interface Message {
    id: string;
    type: MessageType;
    timestamp: Date;
    payload: any;
    signature?: string;
}
export declare enum MessageType {
    COMMAND_REQUEST = "command_request",
    AGENT_DISCOVERY = "agent_discovery",
    HEALTH_CHECK = "health_check",
    CONFIG_UPDATE = "config_update",
    COMMAND_RESULT = "command_result",
    AGENT_REGISTER = "agent_register",
    AGENT_HEARTBEAT = "agent_heartbeat",
    EVENT_NOTIFICATION = "event_notification",
    AUTH_REQUEST = "auth_request",
    AUTH_RESPONSE = "auth_response",
    ERROR = "error",
    GET_README = "get_readme",
    README_RESPONSE = "readme_response",
    UPDATE_KNOWLEDGE = "update_knowledge",
    KNOWLEDGE_UPDATED = "knowledge_updated"
}
export interface AuthRequest {
    agentId: string;
    hostname: string;
    token?: string;
    publicKey?: string;
}
export interface AuthResponse {
    success: boolean;
    token?: string;
    expiresAt?: Date;
    error?: string;
}
export interface EventNotification {
    agentId: string;
    eventType: 'service_down' | 'high_cpu' | 'high_memory' | 'disk_full' | 'security_alert' | 'custom';
    severity: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    details?: Record<string, any>;
    timestamp: Date;
}
export interface HubConfig {
    hubId: string;
    apiEndpoint: string;
    publicKey: string;
    allowedAgents?: string[];
    commandTimeout: number;
    maxConcurrentCommands: number;
}
export interface AgentConfig {
    agentId: string;
    hubEndpoint: string;
    hostname: string;
    capabilities: string[];
    heartbeatInterval: number;
    commandTimeout: number;
    maxRetries: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
}
//# sourceMappingURL=Communication.d.ts.map