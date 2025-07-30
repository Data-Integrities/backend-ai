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
const child_process_1 = require("child_process");
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
            // Decrypt any encrypted values
            this.config = this.decryptConfig(this.config);
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
    decryptConfig(config) {
        if (typeof config === 'string' && config.startsWith('EV:')) {
            return this.decryptValue(config);
        }
        else if (Array.isArray(config)) {
            return config.map(item => this.decryptConfig(item));
        }
        else if (config !== null && typeof config === 'object') {
            const decrypted = {};
            for (const key in config) {
                decrypted[key] = this.decryptConfig(config[key]);
            }
            return decrypted;
        }
        return config;
    }
    decryptValue(value) {
        if (!value.startsWith('EV:')) {
            return value;
        }
        try {
            const encrypted = value.substring(3);
            const command = `echo "${encrypted}" | openssl enc -d -aes-256-cbc -a -salt -pass pass:backend-ai-2024`;
            const decrypted = (0, child_process_1.execSync)(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
            // Debug logging for API key decryption
            if (decrypted) {
                console.log(`Successfully decrypted value starting with ${value.substring(0, 10)}...`);
                console.log(`Decrypted length: ${decrypted.length}, starts with: ${decrypted.substring(0, 20)}...`);
            }
            return decrypted;
        }
        catch (error) {
            console.error('Failed to decrypt value:', error);
            return value;
        }
    }
}
exports.ConfigLoader = ConfigLoader;
ConfigLoader.instance = null;
//# sourceMappingURL=ConfigLoader.js.map