"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CapabilitiesManager = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
class CapabilitiesManager {
    constructor() {
        this.cacheData = null;
        // Determine capabilities directory based on environment
        const baseDir = process.env.AGENT_DIR || (process.platform === 'linux' && !process.env.container ?
            '/opt/ai-agent/agent' :
            process.cwd());
        this.capabilitiesDir = path_1.default.join(baseDir, 'capabilities');
    }
    async ensureCapabilitiesDir() {
        try {
            await promises_1.default.mkdir(this.capabilitiesDir, { recursive: true });
            // Create default README if it doesn't exist
            const mainReadme = path_1.default.join(this.capabilitiesDir, 'README.md');
            try {
                await promises_1.default.access(mainReadme);
            }
            catch {
                const hostname = require('os').hostname();
                const defaultContent = `# ${hostname} Agent Capabilities\n\nThis agent has the following capabilities installed:\n\n_No additional capabilities installed yet._\n`;
                await promises_1.default.writeFile(mainReadme, defaultContent);
            }
        }
        catch (error) {
            console.error('Failed to ensure capabilities directory:', error);
        }
    }
    async getCapabilities(includeContent = false) {
        await this.ensureCapabilitiesDir();
        const capabilities = [];
        try {
            // Read main README
            const mainReadmePath = path_1.default.join(this.capabilitiesDir, 'README.md');
            const mainContent = await promises_1.default.readFile(mainReadmePath, 'utf-8');
            // Parse main README for capability links
            const linkRegex = /\[([^\]]+)\]\(\.\/([^\/]+)\/README\.md\)\s*\n([^\n]+)/g;
            let match;
            while ((match = linkRegex.exec(mainContent)) !== null) {
                const [, name, folder, description] = match;
                const capPath = path_1.default.join(this.capabilitiesDir, folder, 'README.md');
                const capability = {
                    name,
                    description,
                    readmePath: `${folder}/README.md`
                };
                if (includeContent) {
                    try {
                        capability.readmeContent = await promises_1.default.readFile(capPath, 'utf-8');
                    }
                    catch {
                        capability.readmeContent = '_README not found_';
                    }
                }
                capabilities.push(capability);
            }
            // Calculate hash of all capabilities
            const hashContent = JSON.stringify(capabilities.map(c => ({
                name: c.name,
                path: c.readmePath
            })));
            const hash = crypto_1.default.createHash('md5').update(hashContent).digest('hex');
            this.cacheData = {
                capabilities,
                hash,
                lastUpdated: new Date().toISOString()
            };
            return this.cacheData;
        }
        catch (error) {
            console.error('Failed to read capabilities:', error);
            return {
                capabilities: [],
                hash: 'error',
                lastUpdated: new Date().toISOString()
            };
        }
    }
    async getCapabilityReadme(capabilityPath) {
        const fullPath = path_1.default.join(this.capabilitiesDir, capabilityPath);
        try {
            return await promises_1.default.readFile(fullPath, 'utf-8');
        }
        catch (error) {
            throw new Error(`Capability README not found: ${capabilityPath}`);
        }
    }
    async addCapability(name, folder, description, readmeContent) {
        await this.ensureCapabilitiesDir();
        // Create capability folder
        const capDir = path_1.default.join(this.capabilitiesDir, folder);
        await promises_1.default.mkdir(capDir, { recursive: true });
        // Write capability README
        await promises_1.default.writeFile(path_1.default.join(capDir, 'README.md'), readmeContent);
        // Update main README
        const mainReadmePath = path_1.default.join(this.capabilitiesDir, 'README.md');
        let mainContent = await promises_1.default.readFile(mainReadmePath, 'utf-8');
        // Remove placeholder if exists
        mainContent = mainContent.replace('_No additional capabilities installed yet._', '');
        // Add new capability link
        const newEntry = `\n## [${name}](./${folder}/README.md)\n${description}\n`;
        mainContent += newEntry;
        await promises_1.default.writeFile(mainReadmePath, mainContent);
        // Clear cache
        this.cacheData = null;
    }
}
exports.CapabilitiesManager = CapabilitiesManager;
//# sourceMappingURL=capabilities-manager.js.map