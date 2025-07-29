export interface AgentCapability {
    name: string;
    description: string;
    readmePath: string;
    readmeContent?: string;
}
export interface AgentCapabilities {
    agentName: string;
    capabilities: AgentCapability[];
    hash: string;
    lastSynced: string;
}
export declare class CapabilitySyncManager {
    private cacheDir;
    private capabilities;
    constructor();
    ensureCacheDir(): Promise<void>;
    syncAgentCapabilities(agentName: string, agentUrl: string, authToken?: string): Promise<boolean>;
    private generateAgentReadme;
    saveAgentCapabilities(agentName: string, capabilities: AgentCapabilities): Promise<void>;
    loadCachedCapabilities(): Promise<void>;
    getAgentCapabilities(agentName: string): AgentCapabilities | undefined;
    getAllCapabilities(): AgentCapabilities[];
    getCapabilityReadme(agentName: string, capabilityPath: string): Promise<string | null>;
}
//# sourceMappingURL=capability-sync.d.ts.map