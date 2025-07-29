import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export interface CapabilityInfo {
    name: string;
    description: string;
    readmePath: string;
    readmeContent?: string;
}

export interface CapabilitiesData {
    capabilities: CapabilityInfo[];
    hash: string;
    lastUpdated: string;
}

export class CapabilitiesManager {
    private capabilitiesDir: string;
    private cacheData: CapabilitiesData | null = null;

    constructor() {
        // Determine capabilities directory based on environment
        const baseDir = process.env.AGENT_DIR || (
            process.platform === 'linux' && !process.env.container ? 
            '/opt/ai-agent/agent' : 
            process.cwd()
        );
        this.capabilitiesDir = path.join(baseDir, 'capabilities');
    }

    async ensureCapabilitiesDir(): Promise<void> {
        try {
            await fs.mkdir(this.capabilitiesDir, { recursive: true });
            
            // Create default README if it doesn't exist
            const mainReadme = path.join(this.capabilitiesDir, 'README.md');
            try {
                await fs.access(mainReadme);
            } catch {
                const hostname = require('os').hostname();
                const defaultContent = `# ${hostname} Agent Capabilities\n\nThis agent has the following capabilities installed:\n\n_No additional capabilities installed yet._\n`;
                await fs.writeFile(mainReadme, defaultContent);
            }
        } catch (error) {
            console.error('Failed to ensure capabilities directory:', error);
        }
    }

    async getCapabilities(includeContent: boolean = false): Promise<CapabilitiesData> {
        await this.ensureCapabilitiesDir();

        const capabilities: CapabilityInfo[] = [];
        
        try {
            // Read main README
            const mainReadmePath = path.join(this.capabilitiesDir, 'README.md');
            const mainContent = await fs.readFile(mainReadmePath, 'utf-8');
            
            // Parse main README for capability links
            const linkRegex = /\[([^\]]+)\]\(\.\/([^\/]+)\/README\.md\)\s*\n([^\n]+)/g;
            let match;
            
            while ((match = linkRegex.exec(mainContent)) !== null) {
                const [, name, folder, description] = match;
                const capPath = path.join(this.capabilitiesDir, folder, 'README.md');
                
                const capability: CapabilityInfo = {
                    name,
                    description,
                    readmePath: `${folder}/README.md`
                };
                
                if (includeContent) {
                    try {
                        capability.readmeContent = await fs.readFile(capPath, 'utf-8');
                    } catch {
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
            const hash = crypto.createHash('md5').update(hashContent).digest('hex');
            
            this.cacheData = {
                capabilities,
                hash,
                lastUpdated: new Date().toISOString()
            };
            
            return this.cacheData;
            
        } catch (error) {
            console.error('Failed to read capabilities:', error);
            return {
                capabilities: [],
                hash: 'error',
                lastUpdated: new Date().toISOString()
            };
        }
    }

    async getCapabilityReadme(capabilityPath: string): Promise<string> {
        const fullPath = path.join(this.capabilitiesDir, capabilityPath);
        try {
            return await fs.readFile(fullPath, 'utf-8');
        } catch (error) {
            throw new Error(`Capability README not found: ${capabilityPath}`);
        }
    }

    async addCapability(name: string, folder: string, description: string, readmeContent: string): Promise<void> {
        await this.ensureCapabilitiesDir();
        
        // Create capability folder
        const capDir = path.join(this.capabilitiesDir, folder);
        await fs.mkdir(capDir, { recursive: true });
        
        // Write capability README
        await fs.writeFile(path.join(capDir, 'README.md'), readmeContent);
        
        // Update main README
        const mainReadmePath = path.join(this.capabilitiesDir, 'README.md');
        let mainContent = await fs.readFile(mainReadmePath, 'utf-8');
        
        // Remove placeholder if exists
        mainContent = mainContent.replace('_No additional capabilities installed yet._', '');
        
        // Add new capability link
        const newEntry = `\n## [${name}](./${folder}/README.md)\n${description}\n`;
        mainContent += newEntry;
        
        await fs.writeFile(mainReadmePath, mainContent);
        
        // Clear cache
        this.cacheData = null;
    }
}