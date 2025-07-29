import * as fs from 'fs';
import * as path from 'path';

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
      nodePath: string;
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

export class ConfigLoader {
  private static instance: ConfigLoader | null = null;
  private config: BackendAIConfig | null = null;
  private configPath: string;
  private agentName: string | null = null;

  private constructor() {
    // Try environment variable first, then default location
    this.configPath = process.env.CONFIG_PATH || '/opt/backend-ai-config.json';
    this.agentName = process.env.AGENT_NAME || null;
  }

  static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  loadConfig(): BackendAIConfig {
    if (this.config) {
      return this.config;
    }

    try {
      const configData = fs.readFileSync(this.configPath, 'utf-8');
      this.config = JSON.parse(configData);
      return this.config!;
    } catch (error) {
      console.error(`Failed to load config from ${this.configPath}:`, error);
      throw new Error(`Configuration file not found or invalid: ${this.configPath}`);
    }
  }

  getConfig(): BackendAIConfig {
    if (!this.config) {
      this.loadConfig();
    }
    if (!this.config) {
      throw new Error('Failed to load configuration');
    }
    return this.config;
  }

  getMyAgent() {
    const config = this.getConfig();
    
    if (!this.agentName) {
      throw new Error('AGENT_NAME environment variable not set');
    }

    const agent = config.agents.find(a => a.name === this.agentName);
    if (!agent) {
      throw new Error(`Agent ${this.agentName} not found in configuration`);
    }

    return agent;
  }

  getMyServiceManager() {
    const agent = this.getMyAgent();
    const config = this.getConfig();
    return config.serviceManagers[agent.serviceManager];
  }

  getHubUrl(): string {
    const config = this.getConfig();
    return `http://${config.hub.ip}:${config.hub.port}`;
  }

  getNasUrl(): string {
    const config = this.getConfig();
    return `http://${config.nas.ip}:${config.nas.port}`;
  }

  getAgentPort(): number {
    const agent = this.getMyAgent();
    return agent.overrides?.agent?.port || this.getConfig().defaults.agent.port;
  }

  getManagerPort(): number {
    const agent = this.getMyAgent();
    return agent.overrides?.manager?.port || this.getConfig().defaults.manager.port;
  }


  getServiceName(type: 'agent' | 'manager'): string {
    const config = this.getConfig();
    return config.defaults[type].serviceName;
  }

  // For hub - get all agents
  getAllAgents() {
    return this.getConfig().agents;
  }

  // For hub - get agent by name
  getAgent(name: string) {
    return this.getConfig().agents.find(a => a.name === name);
  }
}