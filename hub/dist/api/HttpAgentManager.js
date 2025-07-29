"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpAgentManager = void 0;
const fs_1 = require("fs");
const axios_1 = __importDefault(require("axios"));
class HttpAgentManager {
    constructor(configPath = './agents-config.json') {
        this.agents = new Map();
        this.pollInterval = null;
        this.pollIntervalMs = 60000; // 1 minute
        this.configPath = configPath;
    }
    async initialize() {
        await this.loadAgentsConfig();
        this.startPolling();
    }
    async loadAgentsConfig() {
        try {
            const configContent = await fs_1.promises.readFile(this.configPath, 'utf-8');
            const config = JSON.parse(configContent);
            // Clear existing agents
            this.agents.clear();
            // Load agents from config
            for (const agentConfig of config.agents) {
                const agentStatus = {
                    name: agentConfig['agent-name'],
                    ip: agentConfig.ip,
                    port: agentConfig.port || 3050,
                    aliases: agentConfig.aliases || [],
                    isOnline: false
                };
                this.agents.set(agentStatus.name, agentStatus);
            }
            console.log(`Loaded ${this.agents.size} agents from config`);
            // Do initial poll immediately
            await this.pollAgents();
        }
        catch (error) {
            console.error('Failed to load agents config:', error);
        }
    }
    startPolling() {
        // Poll immediately, then every minute
        this.pollInterval = setInterval(() => {
            this.pollAgents().catch(err => console.error('Error polling agents:', err));
        }, this.pollIntervalMs);
    }
    async pollAgents() {
        const pollPromises = Array.from(this.agents.values()).map(agent => this.checkAgentStatus(agent));
        await Promise.allSettled(pollPromises);
    }
    async checkAgentStatus(agent) {
        try {
            const response = await axios_1.default.get(`http://${agent.ip}:${agent.port}/api/status`, {
                timeout: 5000 // 5 second timeout
            });
            agent.isOnline = true;
            agent.lastSeen = new Date();
            // Extract additional info if provided
            if (response.data) {
                agent.version = response.data.version;
                agent.services = response.data.services;
            }
        }
        catch (error) {
            agent.isOnline = false;
            // Keep lastSeen from previous successful check
        }
    }
    getAgents() {
        return Array.from(this.agents.values());
    }
    getAgent(nameOrAlias) {
        // First try direct name match
        const directMatch = this.agents.get(nameOrAlias);
        if (directMatch)
            return directMatch;
        // Then try alias match
        for (const agent of this.agents.values()) {
            if (agent.aliases.some(alias => alias.toLowerCase() === nameOrAlias.toLowerCase())) {
                return agent;
            }
        }
        return undefined;
    }
    getOnlineAgents() {
        return this.getAgents().filter(agent => agent.isOnline);
    }
    async sendCommand(agentName, command) {
        const agent = this.getAgent(agentName);
        if (!agent) {
            throw new Error(`Agent ${agentName} not found`);
        }
        if (!agent.isOnline) {
            throw new Error(`Agent ${agentName} is offline`);
        }
        try {
            const response = await axios_1.default.post(`http://${agent.ip}:${agent.port}/api/command`, command, { timeout: 30000 } // 30 second timeout for commands
            );
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to send command to ${agentName}: ${error.message}`);
        }
    }
    async executeAgentOperation(agentName, operation) {
        const agent = this.getAgent(agentName);
        if (!agent) {
            throw new Error(`Agent ${agentName} not found`);
        }
        try {
            const response = await axios_1.default.post(`http://${agent.ip}:${agent.port}/api/agent/${operation}`, {}, { timeout: 10000 });
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to execute ${operation} on ${agentName}: ${error.message}`);
        }
    }
    stop() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }
}
exports.HttpAgentManager = HttpAgentManager;
//# sourceMappingURL=HttpAgentManager.js.map