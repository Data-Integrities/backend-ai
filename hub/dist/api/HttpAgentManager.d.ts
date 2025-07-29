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
export declare class HttpAgentManager {
    private agents;
    private configPath;
    private pollInterval;
    private pollIntervalMs;
    constructor(configPath?: string);
    initialize(): Promise<void>;
    loadAgentsConfig(): Promise<void>;
    private startPolling;
    private pollAgents;
    private checkAgentStatus;
    getAgents(): AgentStatus[];
    getAgent(nameOrAlias: string): AgentStatus | undefined;
    getOnlineAgents(): AgentStatus[];
    sendCommand(agentName: string, command: any): Promise<any>;
    executeAgentOperation(agentName: string, operation: string): Promise<any>;
    stop(): void;
}
//# sourceMappingURL=HttpAgentManager.d.ts.map