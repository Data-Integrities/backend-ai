export interface BackendAIConfig {
    system: {
        name: string;
        version: string;
        description: string;
    };
    hub: {
        ip: string;
        port: number;
        name: string;
        description: string;
        nodePath: string;
        paths: {
            installation: string;
        };
        api: {
            basePath: string;
            guiPath: string;
            pollingInterval: number;
            commandTimeout: number;
        };
    };
    nas: {
        description: string;
        ip: string;
        port: number;
        updatePath: string;
        authEndpoint: string;
    };
    defaults: {
        agent: {
            port: number;
            installPath: string;
            serviceName: string;
        };
        manager: {
            port: number;
            installPath: string;
            serviceName: string;
        };
        network: {
            httpTimeout: number;
            sshTimeout: number;
            retryAttempts: number;
        };
        logging?: {
            retentionDays: number;
            useLocalDirectory: boolean;
        };
    };
    serviceManagers: {
        [key: string]: {
            description: string;
            commands: {
                start: string;
                stop: string;
                restart: string;
                status: string;
                enable?: string;
                disable?: string;
            };
            logCommand: string;
        };
    };
    agents: Array<{
        name: string;
        ip: string;
        description: string;
        serviceManager: string;
        systemType: string;
        accessUser: string;
        nodePath: string;
        aliases: string[];
        capabilities: {
            [key: string]: boolean;
        };
        overrides?: {
            agent?: Partial<BackendAIConfig['defaults']['agent']>;
            manager?: Partial<BackendAIConfig['defaults']['manager']>;
        };
    }>;
}
export declare class ConfigLoader {
    private static instance;
    private config;
    private configPath;
    private agentName;
    private constructor();
    static getInstance(): ConfigLoader;
    loadConfig(): BackendAIConfig;
    getConfig(): BackendAIConfig;
    getMyAgent(): {
        name: string;
        ip: string;
        description: string;
        serviceManager: string;
        systemType: string;
        accessUser: string;
        nodePath: string;
        aliases: string[];
        capabilities: {
            [key: string]: boolean;
        };
        overrides?: {
            agent?: Partial<BackendAIConfig["defaults"]["agent"]>;
            manager?: Partial<BackendAIConfig["defaults"]["manager"]>;
        };
    };
    getMyServiceManager(): {
        description: string;
        commands: {
            start: string;
            stop: string;
            restart: string;
            status: string;
            enable?: string;
            disable?: string;
        };
        logCommand: string;
    };
    getHubUrl(): string;
    getNasUrl(): string;
    getAgentPort(): number;
    getManagerPort(): number;
    getServiceName(type: 'agent' | 'manager'): string;
    getAllAgents(): {
        name: string;
        ip: string;
        description: string;
        serviceManager: string;
        systemType: string;
        accessUser: string;
        nodePath: string;
        aliases: string[];
        capabilities: {
            [key: string]: boolean;
        };
        overrides?: {
            agent?: Partial<BackendAIConfig["defaults"]["agent"]>;
            manager?: Partial<BackendAIConfig["defaults"]["manager"]>;
        };
    }[];
    getAgent(name: string): {
        name: string;
        ip: string;
        description: string;
        serviceManager: string;
        systemType: string;
        accessUser: string;
        nodePath: string;
        aliases: string[];
        capabilities: {
            [key: string]: boolean;
        };
        overrides?: {
            agent?: Partial<BackendAIConfig["defaults"]["agent"]>;
            manager?: Partial<BackendAIConfig["defaults"]["manager"]>;
        };
    } | undefined;
    private decryptConfig;
    private decryptValue;
}
//# sourceMappingURL=ConfigLoader.d.ts.map