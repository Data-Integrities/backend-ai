import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import { AgentManager } from './AgentManager';
import { 
  Message, 
  MessageType,
  CommandRequest,
  CommandCategory,
  CommandRisk
} from '@proxmox-ai-control/shared';

const execAsync = promisify(exec);

export interface AgentVersion {
  version: string;
  releaseDate: Date;
  changelog: string;
  downloadUrl: string;
  checksum: string;
  platforms: string[];
  minimumAgentVersion?: string;
}

export class UpdateService {
  private agentManager: AgentManager;
  private versionsDir: string = './agent-versions';
  private currentVersions: Map<string, AgentVersion> = new Map();

  constructor(agentManager: AgentManager) {
    this.agentManager = agentManager;
    this.initializeVersions();
  }

  private async initializeVersions(): Promise<void> {
    try {
      await fs.mkdir(this.versionsDir, { recursive: true });
      await this.loadVersions();
    } catch (error) {
      console.error('Failed to initialize versions:', error);
    }
  }

  private async loadVersions(): Promise<void> {
    try {
      const versionFile = path.join(this.versionsDir, 'versions.json');
      const data = await fs.readFile(versionFile, 'utf-8');
      const versions = JSON.parse(data);
      
      for (const [platform, version] of Object.entries(versions)) {
        this.currentVersions.set(platform, version as AgentVersion);
      }
    } catch (error) {
      // Default versions
      this.currentVersions.set('linux', {
        version: '1.0.0',
        releaseDate: new Date(),
        changelog: 'Initial release',
        downloadUrl: '/download/agent-linux-1.0.0.tar.gz',
        checksum: '',
        platforms: ['linux']
      });
    }
  }

  async getLatestVersion(platform: string = 'linux'): AgentVersion | null {
    return this.currentVersions.get(platform) || null;
  }

  async buildNewVersion(
    version: string,
    changelog: string,
    platforms: string[] = ['linux']
  ): Promise<void> {
    console.log(`Building new agent version ${version}...`);
    
    const buildDir = path.join(this.versionsDir, 'build');
    await fs.mkdir(buildDir, { recursive: true });

    for (const platform of platforms) {
      try {
        // Build agent for platform
        const agentDir = platform === 'linux' ? '../agent' : `../agent-${platform}`;
        
        // Copy source files
        await execAsync(`cp -r ${agentDir}/* ${buildDir}/`);
        
        // Update version in package.json
        const packagePath = path.join(buildDir, 'package.json');
        const packageData = JSON.parse(await fs.readFile(packagePath, 'utf-8'));
        packageData.version = version;
        await fs.writeFile(packagePath, JSON.stringify(packageData, null, 2));
        
        // Build TypeScript
        await execAsync('npm run build', { cwd: buildDir });
        
        // Create distribution package
        const distName = `agent-${platform}-${version}.tar.gz`;
        const distPath = path.join(this.versionsDir, distName);
        
        await execAsync(`tar -czf ${distPath} -C ${buildDir} .`);
        
        // Calculate checksum
        const checksum = await this.calculateChecksum(distPath);
        
        // Update version info
        const versionInfo: AgentVersion = {
          version,
          releaseDate: new Date(),
          changelog,
          downloadUrl: `/download/${distName}`,
          checksum,
          platforms: [platform]
        };
        
        this.currentVersions.set(platform, versionInfo);
        
        console.log(`Built ${distName} with checksum ${checksum}`);
        
      } catch (error) {
        console.error(`Failed to build for ${platform}:`, error);
      }
    }
    
    // Save versions
    await this.saveVersions();
    
    // Clean up build directory
    await fs.rm(buildDir, { recursive: true });
  }

  private async saveVersions(): Promise<void> {
    const versions: any = {};
    for (const [platform, version] of this.currentVersions) {
      versions[platform] = version;
    }
    
    const versionFile = path.join(this.versionsDir, 'versions.json');
    await fs.writeFile(versionFile, JSON.stringify(versions, null, 2));
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    const stream = require('fs').createReadStream(filePath);
    
    return new Promise((resolve, reject) => {
      stream.on('data', (data: Buffer) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async updateAllAgents(version?: string, force: boolean = false): Promise<void> {
    const agents = this.agentManager.getOnlineAgents();
    
    if (agents.length === 0) {
      console.log('No agents online to update');
      return;
    }
    
    console.log(`Updating ${agents.length} agents...`);
    
    const updateCommand: CommandRequest = {
      id: `update-${Date.now()}`,
      timestamp: new Date(),
      naturalLanguage: force ? 'force update agent' : 'check for agent updates',
      sourceHub: 'update-service',
      category: CommandCategory.SYSTEM,
      risk: CommandRisk.MEDIUM,
      requireConfirmation: false
    };
    
    await this.agentManager.sendCommand(updateCommand);
  }

  async updateSpecificAgents(agentIds: string[], force: boolean = false): Promise<void> {
    const updateCommand: CommandRequest = {
      id: `update-${Date.now()}`,
      timestamp: new Date(),
      naturalLanguage: force ? 'force update agent' : 'check for agent updates',
      sourceHub: 'update-service',
      targetAgents: agentIds,
      category: CommandCategory.SYSTEM,
      risk: CommandRisk.MEDIUM,
      requireConfirmation: false
    };
    
    await this.agentManager.sendCommand(updateCommand);
  }

  // API endpoint handler
  handleVersionCheck(agentVersion: string, platform: string): AgentVersion | null {
    const latestVersion = this.currentVersions.get(platform);
    
    if (!latestVersion) {
      return null;
    }
    
    // Only return if newer version available
    if (this.isNewerVersion(latestVersion.version, agentVersion)) {
      return latestVersion;
    }
    
    return null;
  }

  private isNewerVersion(newVersion: string, currentVersion: string): boolean {
    const parseVersion = (v: string) => v.split('.').map(n => parseInt(n));
    const newParts = parseVersion(newVersion);
    const currentParts = parseVersion(currentVersion);
    
    for (let i = 0; i < Math.max(newParts.length, currentParts.length); i++) {
      const newPart = newParts[i] || 0;
      const currentPart = currentParts[i] || 0;
      
      if (newPart > currentPart) return true;
      if (newPart < currentPart) return false;
    }
    
    return false;
  }

  async deployUpdate(changelog: string): Promise<string> {
    try {
      // Get current version
      const currentVersion = this.currentVersions.get('linux')?.version || '1.0.0';
      const versionParts = currentVersion.split('.');
      versionParts[2] = (parseInt(versionParts[2]) + 1).toString();
      const newVersion = versionParts.join('.');
      
      // Build new version
      await this.buildNewVersion(newVersion, changelog);
      
      // Deploy to all agents
      await this.updateAllAgents(newVersion, true);
      
      return `Deployed version ${newVersion} to all agents`;
    } catch (error) {
      throw new Error(`Failed to deploy update: ${error}`);
    }
  }
}