import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';

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

export class CapabilitySyncManager {
    private cacheDir: string;
    private capabilities: Map<string, AgentCapabilities> = new Map();

    constructor() {
        const baseDir = process.env.HUB_DIR || '/opt/backend-ai/hub';
        this.cacheDir = path.join(baseDir, 'cache', 'agent-capabilities');
    }

    async ensureCacheDir(): Promise<void> {
        await fs.mkdir(this.cacheDir, { recursive: true });
    }

    async syncAgentCapabilities(agentName: string, agentUrl: string, authToken?: string): Promise<boolean> {
        try {
            // Get capabilities with content
            const headers = {};
            const response = await axios.get(`${agentUrl}/api/capabilities?includeContent=true`, {
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
            const agentCapabilities: AgentCapabilities = {
                agentName,
                capabilities: modules || [],
                hash: capabilitiesHash || 'none',
                lastSynced: new Date().toISOString()
            };

            this.capabilities.set(agentName, agentCapabilities);

            // Save to disk
            await this.saveAgentCapabilities(agentName, agentCapabilities);

            // Also save individual README files for quick access
            const agentDir = path.join(this.cacheDir, agentName);
            await fs.mkdir(agentDir, { recursive: true });

            // Save main README
            const mainReadme = this.generateAgentReadme(agentName, modules || []);
            await fs.writeFile(path.join(agentDir, 'README.md'), mainReadme);

            // Save capability READMEs
            for (const capability of modules || []) {
                if (capability.readmeContent) {
                    const capPath = path.join(agentDir, capability.readmePath);
                    await fs.mkdir(path.dirname(capPath), { recursive: true });
                    await fs.writeFile(capPath, capability.readmeContent);
                }
            }

            return true; // Updated
        } catch (error: any) {
            console.error(`Failed to sync capabilities for ${agentName}:`, error.message);
            return false;
        }
    }

    private generateAgentReadme(agentName: string, capabilities: AgentCapability[]): string {
        let content = `# ${agentName} Agent Capabilities\n\n`;
        
        if (capabilities.length === 0) {
            content += '_No additional capabilities installed._\n';
        } else {
            content += 'This agent has the following capabilities installed:\n\n';
            for (const cap of capabilities) {
                content += `## [${cap.name}](./${cap.readmePath})\n`;
                content += `${cap.description}\n\n`;
            }
        }

        content += `\n_Last synced: ${new Date().toISOString()}_\n`;
        return content;
    }

    async saveAgentCapabilities(agentName: string, capabilities: AgentCapabilities): Promise<void> {
        await this.ensureCacheDir();
        const filePath = path.join(this.cacheDir, `${agentName}.json`);
        await fs.writeFile(filePath, JSON.stringify(capabilities, null, 2));
    }

    async loadCachedCapabilities(): Promise<void> {
        await this.ensureCacheDir();
        
        try {
            const files = await fs.readdir(this.cacheDir);
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this.cacheDir, file);
                    const content = await fs.readFile(filePath, 'utf-8');
                    const capabilities = JSON.parse(content) as AgentCapabilities;
                    this.capabilities.set(capabilities.agentName, capabilities);
                }
            }
        } catch (error) {
            console.error('Failed to load cached capabilities:', error);
        }
    }

    getAgentCapabilities(agentName: string): AgentCapabilities | undefined {
        return this.capabilities.get(agentName);
    }

    getAllCapabilities(): AgentCapabilities[] {
        return Array.from(this.capabilities.values());
    }

    async getCapabilityReadme(agentName: string, capabilityPath: string): Promise<string | null> {
        const filePath = path.join(this.cacheDir, agentName, capabilityPath);
        try {
            return await fs.readFile(filePath, 'utf-8');
        } catch {
            return null;
        }
    }
}