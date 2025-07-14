import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import crypto from 'crypto';
import { Logger } from './Logger';

const execAsync = promisify(exec);

export interface UpdateInfo {
  version: string;
  releaseDate: Date;
  downloadUrl: string;
  checksum: string;
  changelog: string;
  requiresRestart: boolean;
  minimumAgentVersion?: string;
}

export class UpdateManager {
  private logger: Logger;
  private currentVersion: string;
  private updateDir: string = '/opt/ai-agent/updates';
  private installDir: string = '/opt/ai-agent';
  private hubUrl: string;

  constructor(logger: Logger, currentVersion: string, hubUrl: string) {
    this.logger = logger;
    this.currentVersion = currentVersion;
    this.hubUrl = hubUrl;
    this.ensureUpdateDirectory();
  }

  private async ensureUpdateDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.updateDir, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create update directory', error);
    }
  }

  async checkForUpdate(): Promise<UpdateInfo | null> {
    try {
      const response = await axios.get(`${this.hubUrl}/api/agent/version`, {
        headers: {
          'X-Agent-Version': this.currentVersion,
          'X-Agent-OS': process.platform
        }
      });

      const updateInfo: UpdateInfo = response.data;
      
      if (this.isNewerVersion(updateInfo.version, this.currentVersion)) {
        this.logger.info(`Update available: ${this.currentVersion} -> ${updateInfo.version}`);
        return updateInfo;
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to check for updates', error);
      return null;
    }
  }

  async downloadUpdate(updateInfo: UpdateInfo): Promise<string> {
    const filename = `agent-update-${updateInfo.version}.tar.gz`;
    const downloadPath = path.join(this.updateDir, filename);
    
    this.logger.info(`Downloading update from ${updateInfo.downloadUrl}`);

    try {
      const response = await axios({
        method: 'GET',
        url: updateInfo.downloadUrl,
        responseType: 'stream'
      });

      const writer = require('fs').createWriteStream(downloadPath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // Verify checksum
      const fileChecksum = await this.calculateChecksum(downloadPath);
      if (fileChecksum !== updateInfo.checksum) {
        throw new Error('Checksum verification failed');
      }

      this.logger.info('Update downloaded and verified successfully');
      return downloadPath;

    } catch (error) {
      await fs.unlink(downloadPath).catch(() => {});
      throw new Error(`Failed to download update: ${error}`);
    }
  }

  async applyUpdate(updatePath: string, updateInfo: UpdateInfo): Promise<void> {
    this.logger.info('Applying update...');
    
    const backupDir = path.join(this.updateDir, `backup-${this.currentVersion}`);
    
    try {
      // 1. Create backup of current installation
      await this.createBackup(backupDir);
      
      // 2. Extract update to temporary directory
      const tempDir = path.join(this.updateDir, 'temp');
      await fs.mkdir(tempDir, { recursive: true });
      
      await execAsync(`tar -xzf ${updatePath} -C ${tempDir}`);
      
      // 3. Stop the agent service (will be restarted by systemd)
      await execAsync('systemctl stop ai-agent').catch(() => {
        this.logger.warn('Could not stop service - may not be running under systemd');
      });
      
      // 4. Copy new files
      await execAsync(`cp -r ${tempDir}/* ${this.installDir}/`);
      
      // 5. Update version file
      await fs.writeFile(
        path.join(this.installDir, 'version.json'),
        JSON.stringify({ version: updateInfo.version, updatedAt: new Date() })
      );
      
      // 6. Run any post-update scripts
      const postUpdateScript = path.join(this.installDir, 'scripts/post-update.sh');
      try {
        await fs.access(postUpdateScript);
        await execAsync(`bash ${postUpdateScript}`);
      } catch {
        // No post-update script
      }
      
      // 7. Clean up
      await fs.rm(tempDir, { recursive: true });
      await fs.unlink(updatePath);
      
      this.logger.info(`Update to version ${updateInfo.version} completed successfully`);
      
      // 8. Restart if required
      if (updateInfo.requiresRestart) {
        this.logger.info('Restarting agent...');
        process.exit(0); // systemd will restart us
      }
      
    } catch (error) {
      this.logger.error('Update failed, attempting rollback', error);
      await this.rollback(backupDir);
      throw error;
    }
  }

  private async createBackup(backupDir: string): Promise<void> {
    this.logger.info('Creating backup of current installation');
    await fs.mkdir(backupDir, { recursive: true });
    await execAsync(`cp -r ${this.installDir}/* ${backupDir}/`);
  }

  private async rollback(backupDir: string): Promise<void> {
    try {
      this.logger.info('Rolling back to previous version');
      await execAsync(`cp -r ${backupDir}/* ${this.installDir}/`);
      await fs.rm(backupDir, { recursive: true });
      this.logger.info('Rollback completed');
    } catch (error) {
      this.logger.error('Rollback failed!', error);
    }
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

  async handleUpdateCommand(force: boolean = false): Promise<string> {
    try {
      const updateInfo = await this.checkForUpdate();
      
      if (!updateInfo) {
        return `Agent is up to date (version ${this.currentVersion})`;
      }
      
      if (!force) {
        return `Update available: ${updateInfo.version}\nChangelog:\n${updateInfo.changelog}\n\nUse 'force update' to apply`;
      }
      
      const updatePath = await this.downloadUpdate(updateInfo);
      await this.applyUpdate(updatePath, updateInfo);
      
      return `Update to ${updateInfo.version} completed successfully`;
      
    } catch (error) {
      return `Update failed: ${error}`;
    }
  }
}