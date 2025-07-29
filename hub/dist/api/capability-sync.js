"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CapabilitySyncManager = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
class CapabilitySyncManager {
    constructor() {
        this.capabilities = new Map();
        const baseDir = process.env.HUB_DIR || '/opt/backend-ai/hub';
        this.cacheDir = path_1.default.join(baseDir, 'cache', 'agent-capabilities');
    }
    async ensureCacheDir() {
        await promises_1.default.mkdir(this.cacheDir, { recursive: true });
    }
    async syncAgentCapabilities(agentName, agentUrl, authToken) {
        try {
            // Get capabilities with content
            const headers = {};
            const response = await axios_1.default.get(`${agentUrl}/api/capabilities?includeContent=true`, {
                headers,
                timeout: 5000
            });
            const { modules, capabilitiesHash, capabilitiesLastUpdated } = response.data;
            // Check if we need to update
            const cached = this.capabilities.get(agentName);
            if (cached && cached.hash === capabilitiesHash) {
                return false; // No update needed
            }
            // Update cache
            const agentCapabilities = {
                agentName,
                capabilities: modules || [],
                hash: capabilitiesHash || 'none',
                lastSynced: new Date().toISOString()
            };
            this.capabilities.set(agentName, agentCapabilities);
            // Save to disk
            await this.saveAgentCapabilities(agentName, agentCapabilities);
            // Also save individual README files for quick access
            const agentDir = path_1.default.join(this.cacheDir, agentName);
            await promises_1.default.mkdir(agentDir, { recursive: true });
            // Save main README
            const mainReadme = this.generateAgentReadme(agentName, modules || []);
            await promises_1.default.writeFile(path_1.default.join(agentDir, 'README.md'), mainReadme);
            // Save capability READMEs
            for (const capability of modules || []) {
                if (capability.readmeContent) {
                    const capPath = path_1.default.join(agentDir, capability.readmePath);
                    await promises_1.default.mkdir(path_1.default.dirname(capPath), { recursive: true });
                    await promises_1.default.writeFile(capPath, capability.readmeContent);
                }
            }
            return true; // Updated
        }
        catch (error) {
            console.error(`Failed to sync capabilities for ${agentName}:`, error.message);
            return false;
        }
    }
    generateAgentReadme(agentName, capabilities) {
        let content = `# ${agentName} Agent Capabilities\n\n`;
        if (capabilities.length === 0) {
            content += '_No additional capabilities installed._\n';
        }
        else {
            content += 'This agent has the following capabilities installed:\n\n';
            for (const cap of capabilities) {
                content += `## [${cap.name}](./${cap.readmePath})\n`;
                content += `${cap.description}\n\n`;
            }
        }
        content += `\n_Last synced: ${new Date().toISOString()}_\n`;
        return content;
    }
    async saveAgentCapabilities(agentName, capabilities) {
        await this.ensureCacheDir();
        const filePath = path_1.default.join(this.cacheDir, `${agentName}.json`);
        await promises_1.default.writeFile(filePath, JSON.stringify(capabilities, null, 2));
    }
    async loadCachedCapabilities() {
        await this.ensureCacheDir();
        try {
            const files = await promises_1.default.readdir(this.cacheDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path_1.default.join(this.cacheDir, file);
                    const content = await promises_1.default.readFile(filePath, 'utf-8');
                    const capabilities = JSON.parse(content);
                    this.capabilities.set(capabilities.agentName, capabilities);
                }
            }
        }
        catch (error) {
            console.error('Failed to load cached capabilities:', error);
        }
    }
    getAgentCapabilities(agentName) {
        return this.capabilities.get(agentName);
    }
    getAllCapabilities() {
        return Array.from(this.capabilities.values());
    }
    async getCapabilityReadme(agentName, capabilityPath) {
        const filePath = path_1.default.join(this.cacheDir, agentName, capabilityPath);
        try {
            return await promises_1.default.readFile(filePath, 'utf-8');
        }
        catch {
            return null;
        }
    }
}
exports.CapabilitySyncManager = CapabilitySyncManager;
//# sourceMappingURL=capability-sync.js.map