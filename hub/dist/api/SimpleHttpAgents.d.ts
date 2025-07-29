import { CapabilitySyncManager } from './capability-sync';
interface AgentInfo {
    name: string;
    ip: string;
    port: number;
    aliases: string[];
    isOnline: boolean;
    lastSeen?: string;
    version?: string;
    agentVersion?: string;
    managerVersion?: string;
    workingDirectory?: string;
    systemInfo?: any;
    capabilities?: any;
    capabilitiesFetched?: Date;
    correlationId?: string;
    pendingCorrelationId?: string;
}
export declare class SimpleHttpAgents {
    private agents;
    private pollInterval;
    private capabilitySync;
    private configLoader;
    private correlationCallbacks;
    constructor();
    loadConfig(): Promise<void>;
    private reloadConfigIfChanged;
    private startPolling;
    private pollAgents;
    getAgentsForApi(): any;
    reloadConfig(): Promise<void>;
    sendCommand(agentName: string, command: string, options?: {
        correlationId?: string;
        async?: boolean;
        requestId?: string;
    }): Promise<any>;
    sendChatCommand(agentName: string, command: string, options?: {
        correlationId?: string;
        skipConfirmation?: boolean;
        tabId?: string;
    }): Promise<any>;
    getAgent(name: string): AgentInfo | undefined;
    getAgents(): AgentInfo[];
    getAgentConfig(name: string): any | undefined;
    getServiceManagers(): any;
    stop(): void;
    checkSingleAgentStatus(agentName: string): Promise<void>;
    getCapabilitySync(): CapabilitySyncManager;
    setPendingCorrelationId(agentName: string, correlationId: string, callback?: (agent: AgentInfo) => void): void;
    clearPendingCorrelationId(agentName: string): void;
    getAgentByCorrelationId(correlationId: string): AgentInfo | undefined;
}
export {};
//# sourceMappingURL=SimpleHttpAgents.d.ts.map