import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { 
  ParsedCommand, 
  CommandResult, 
  CommandCategory,
  CommandRisk,
  ServiceCommand,
  ConfigCommand,
  DebugCommand,
  SystemCommand
} from '@proxmox-ai-control/shared';
import { Logger } from './Logger';

const execAsync = promisify(exec);

export class CommandExecutor {
  private logger: Logger;
  private commandHistory: CommandResult[] = [];
  private backupDir: string = '/var/backups/ai-agent';

  constructor(logger: Logger) {
    this.logger = logger;
    this.ensureBackupDirectory();
  }

  private async ensureBackupDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create backup directory', error);
    }
  }

  async execute(command: ParsedCommand, requestId: string): Promise<CommandResult> {
    const startTime = Date.now();
    
    try {
      // Validate command risk level
      if (command.risk === CommandRisk.CRITICAL) {
        this.logger.warn(`Executing CRITICAL risk command: ${command.action}`);
      }

      // Run pre-checks if defined
      if (command.validation?.preChecks) {
        await this.runChecks(command.validation.preChecks);
      }

      // Execute based on category
      let output: string;
      switch (command.category) {
        case CommandCategory.SERVICE:
          output = await this.executeServiceCommand(command);
          break;
        case CommandCategory.CONFIG:
          output = await this.executeConfigCommand(command);
          break;
        case CommandCategory.DEBUG:
          output = await this.executeDebugCommand(command);
          break;
        case CommandCategory.SYSTEM:
          output = await this.executeSystemCommand(command);
          break;
        case CommandCategory.NETWORK:
          output = await this.executeNetworkCommand(command);
          break;
        default:
          output = await this.executeShellCommands(command.shellCommands || []);
      }

      // Run post-checks if defined
      if (command.validation?.postChecks) {
        await this.runChecks(command.validation.postChecks);
      }

      const result: CommandResult = {
        requestId,
        agentId: process.env.AGENT_ID || 'unknown',
        success: true,
        timestamp: new Date(),
        executionTime: Date.now() - startTime,
        output
      };

      this.commandHistory.push(result);
      return result;

    } catch (error) {
      const errorResult: CommandResult = {
        requestId,
        agentId: process.env.AGENT_ID || 'unknown',
        success: false,
        timestamp: new Date(),
        executionTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };

      // Attempt rollback if available
      if (command.validation?.rollbackCommands) {
        try {
          await this.executeShellCommands(command.validation.rollbackCommands);
          errorResult.metadata = { rollback: 'successful' };
        } catch (rollbackError) {
          errorResult.metadata = { rollback: 'failed', rollbackError: String(rollbackError) };
        }
      }

      this.commandHistory.push(errorResult);
      return errorResult;
    }
  }

  private async executeServiceCommand(command: ParsedCommand): Promise<string> {
    const serviceCmd = command.parameters as ServiceCommand;
    const serviceName = serviceCmd.service;
    const action = serviceCmd.action;

    // Use systemctl for systemd systems
    const cmd = `systemctl ${action} ${serviceName}`;
    const { stdout, stderr } = await execAsync(cmd);
    
    if (stderr && !stderr.includes('Warning')) {
      throw new Error(stderr);
    }

    // Get service status after action
    const statusCmd = `systemctl status ${serviceName} --no-pager`;
    const { stdout: statusOut } = await execAsync(statusCmd).catch(() => ({ stdout: 'Status unavailable' }));

    return `${stdout}\n\nService Status:\n${statusOut}`;
  }

  private async executeConfigCommand(command: ParsedCommand): Promise<string> {
    const configCmd = command.parameters as ConfigCommand;
    const { service, configFile, action, changes } = configCmd;

    switch (action) {
      case 'view':
        return await this.viewConfig(service, configFile);
      case 'edit':
        return await this.editConfig(service, configFile, changes);
      case 'backup':
        return await this.backupConfig(service, configFile);
      case 'validate':
        return await this.validateConfig(service, configFile);
      default:
        throw new Error(`Unknown config action: ${action}`);
    }
  }

  private async executeDebugCommand(command: ParsedCommand): Promise<string> {
    const debugCmd = command.parameters as DebugCommand;
    const { target, filters } = debugCmd;

    switch (target) {
      case 'logs':
        return await this.getLogs(filters);
      case 'process':
        return await this.getProcessInfo(filters);
      case 'network':
        return await this.getNetworkInfo(filters);
      case 'disk':
        return await this.getDiskInfo();
      case 'memory':
        return await this.getMemoryInfo();
      default:
        throw new Error(`Unknown debug target: ${target}`);
    }
  }

  private async executeSystemCommand(command: ParsedCommand): Promise<string> {
    const systemCmd = command.parameters as SystemCommand;
    const { action, force, scheduled } = systemCmd;

    switch (action) {
      case 'info':
        return await this.getSystemInfo();
      case 'update':
        return await this.updateSystem();
      case 'reboot':
        if (!force) {
          throw new Error('Reboot requires force flag for safety');
        }
        return await this.scheduleReboot(scheduled);
      default:
        throw new Error(`System action ${action} not implemented`);
    }
  }

  private async executeNetworkCommand(command: ParsedCommand): Promise<string> {
    const { action, target, parameters } = command.parameters;

    switch (action) {
      case 'ping':
        return await this.ping(target || '8.8.8.8');
      case 'ports':
        return await this.getOpenPorts();
      case 'connections':
        return await this.getNetworkConnections();
      default:
        throw new Error(`Network action ${action} not implemented`);
    }
  }

  private async executeShellCommands(commands: string[]): Promise<string> {
    const outputs: string[] = [];
    
    for (const cmd of commands) {
      this.logger.info(`Executing shell command: ${cmd}`);
      const { stdout, stderr } = await execAsync(cmd);
      outputs.push(stdout);
      if (stderr) {
        outputs.push(`STDERR: ${stderr}`);
      }
    }

    return outputs.join('\n\n');
  }

  private async runChecks(checks: string[]): Promise<void> {
    for (const check of checks) {
      const { stdout, stderr } = await execAsync(check);
      if (stderr) {
        throw new Error(`Pre-check failed: ${check} - ${stderr}`);
      }
    }
  }

  // Helper methods

  private async viewConfig(service: string, configFile?: string): Promise<string> {
    const configPath = configFile || await this.getDefaultConfigPath(service);
    return await fs.readFile(configPath, 'utf-8');
  }

  private async editConfig(service: string, configFile?: string, changes?: Record<string, any>): Promise<string> {
    const configPath = configFile || await this.getDefaultConfigPath(service);
    
    // Backup first
    await this.backupConfig(service, configPath);
    
    // For now, return what would be changed
    return `Would edit ${configPath} with changes: ${JSON.stringify(changes, null, 2)}`;
  }

  private async backupConfig(service: string, configFile?: string): Promise<string> {
    const configPath = configFile || await this.getDefaultConfigPath(service);
    const backupPath = path.join(this.backupDir, `${service}_${Date.now()}.conf`);
    await fs.copyFile(configPath, backupPath);
    return `Backed up ${configPath} to ${backupPath}`;
  }

  private async validateConfig(service: string, configFile?: string): Promise<string> {
    const validators: Record<string, string> = {
      'nginx': 'nginx -t',
      'apache2': 'apache2ctl configtest',
      'mysql': 'mysqld --validate-config',
      'postgresql': 'postgres --check'
    };

    const validator = validators[service];
    if (!validator) {
      return 'No validator available for this service';
    }

    const { stdout, stderr } = await execAsync(validator);
    return stdout + stderr;
  }

  private async getDefaultConfigPath(service: string): Promise<string> {
    const configPaths: Record<string, string> = {
      'nginx': '/etc/nginx/nginx.conf',
      'apache2': '/etc/apache2/apache2.conf',
      'mysql': '/etc/mysql/my.cnf',
      'postgresql': '/etc/postgresql/main/postgresql.conf',
      'ssh': '/etc/ssh/sshd_config'
    };

    return configPaths[service] || `/etc/${service}/${service}.conf`;
  }

  private async getLogs(filters?: any): Promise<string> {
    const { service, timeRange, severity, count } = filters || {};
    let cmd = 'journalctl --no-pager';

    if (service) cmd += ` -u ${service}`;
    if (timeRange) cmd += ` --since="${timeRange}"`;
    if (severity === 'error') cmd += ' -p err';
    if (count) cmd += ` -n ${count}`;
    else cmd += ' -n 100';

    const { stdout } = await execAsync(cmd);
    return stdout;
  }

  private async getProcessInfo(filters?: any): Promise<string> {
    const service = filters?.service;
    if (service) {
      const { stdout } = await execAsync(`ps aux | grep ${service} | grep -v grep`);
      return stdout;
    }
    const { stdout } = await execAsync('ps aux --sort=-%cpu | head -20');
    return stdout;
  }

  private async getNetworkInfo(filters?: any): Promise<string> {
    const { stdout } = await execAsync('ss -tuln');
    return stdout;
  }

  private async getDiskInfo(): Promise<string> {
    const { stdout } = await execAsync('df -h');
    return stdout;
  }

  private async getMemoryInfo(): Promise<string> {
    const { stdout } = await execAsync('free -h');
    return stdout;
  }

  private async getSystemInfo(): Promise<string> {
    const outputs = await Promise.all([
      execAsync('hostname'),
      execAsync('uname -a'),
      execAsync('uptime'),
      execAsync('df -h /'),
      execAsync('free -h | head -2')
    ]);

    return outputs.map(({ stdout }) => stdout).join('\n');
  }

  private async updateSystem(): Promise<string> {
    // Detect package manager
    try {
      await execAsync('which apt-get');
      const { stdout } = await execAsync('apt-get update && apt-get upgrade -s');
      return stdout;
    } catch {
      try {
        await execAsync('which yum');
        const { stdout } = await execAsync('yum check-update');
        return stdout;
      } catch {
        return 'Package manager not detected';
      }
    }
  }

  private async scheduleReboot(scheduled?: Date): Promise<string> {
    if (scheduled) {
      const minutes = Math.floor((scheduled.getTime() - Date.now()) / 60000);
      await execAsync(`shutdown -r +${minutes}`);
      return `Reboot scheduled in ${minutes} minutes`;
    }
    return 'Reboot would be executed with: shutdown -r now';
  }

  private async ping(target: string): Promise<string> {
    const { stdout } = await execAsync(`ping -c 4 ${target}`);
    return stdout;
  }

  private async getOpenPorts(): Promise<string> {
    const { stdout } = await execAsync('ss -tuln | grep LISTEN');
    return stdout;
  }

  private async getNetworkConnections(): Promise<string> {
    const { stdout } = await execAsync('ss -tuln');
    return stdout;
  }
}