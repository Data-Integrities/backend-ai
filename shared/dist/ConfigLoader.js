"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigLoader = void 0;
const fs = __importStar(require("fs"));
class ConfigLoader {
    constructor() {
        this.config = null;
        this.agentName = null;
        // Try environment variable first, then default location
        this.configPath = process.env.CONFIG_PATH || '/opt/backend-ai-config.json';
        this.agentName = process.env.AGENT_NAME || null;
    }
    static getInstance() {
        if (!ConfigLoader.instance) {
            ConfigLoader.instance = new ConfigLoader();
        }
        return ConfigLoader.instance;
    }
    loadConfig() {
        if (this.config) {
            return this.config;
        }
        try {
            const configData = fs.readFileSync(this.configPath, 'utf-8');
            this.config = JSON.parse(configData);
            return this.config;
        }
        catch (error) {
            console.error(`Failed to load config from ${this.configPath}:`, error);
            throw new Error(`Configuration file not found or invalid: ${this.configPath}`);
        }
    }
    getConfig() {
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
    getHubUrl() {
        const config = this.getConfig();
        return `http://${config.hub.ip}:${config.hub.port}`;
    }
    getNasUrl() {
        const config = this.getConfig();
        return `http://${config.nas.ip}:${config.nas.port}`;
    }
    getAgentPort() {
        const agent = this.getMyAgent();
        return agent.overrides?.agent?.port || this.getConfig().defaults.agent.port;
    }
    getManagerPort() {
        const agent = this.getMyAgent();
        return agent.overrides?.manager?.port || this.getConfig().defaults.manager.port;
    }
    getServiceName(type) {
        const config = this.getConfig();
        return config.defaults[type].serviceName;
    }
    // For hub - get all agents
    getAllAgents() {
        return this.getConfig().agents;
    }
    // For hub - get agent by name
    getAgent(name) {
        return this.getConfig().agents.find(a => a.name === name);
    }
}
exports.ConfigLoader = ConfigLoader;
ConfigLoader.instance = null;
//# sourceMappingURL=ConfigLoader.js.map