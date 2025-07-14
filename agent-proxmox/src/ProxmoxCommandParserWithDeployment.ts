import { 
  ParsedCommand, 
  CommandCategory, 
  CommandRisk
} from '@proxmox-ai-control/shared';

export class ProxmoxCommandParser {
  async parse(naturalLanguage: string): Promise<ParsedCommand> {
    const input = naturalLanguage.trim().toLowerCase();
    
    // Self-deployment operations
    if (input.includes('install') && input.includes('agent')) {
      return this.parseInstallAgent(input);
    } else if (input.includes('deploy') && input.includes('agent')) {
      return this.parseDeployAgent(input);
    } else if (input.includes('check') && input.includes('agent') && input.includes('status')) {
      return this.parseCheckAgentStatus(input);
    } else if (input.includes('update') && input.includes('password')) {
      return this.parseUpdatePassword(input);
    }
    
    // VM/Container operations
    else if (input.includes('restart')) {
      return this.parseRestart(input);
    } else if (input.includes('start')) {
      return this.parseStart(input);
    } else if (input.includes('stop') || input.includes('shutdown')) {
      return this.parseStop(input);
    } else if (input.includes('create') || input.includes('new')) {
      return this.parseCreate(input);
    } else if (input.includes('delete') || input.includes('remove')) {
      return this.parseDelete(input);
    } else if (input.includes('clone') || input.includes('copy')) {
      return this.parseClone(input);
    } else if (input.includes('migrate') || input.includes('move')) {
      return this.parseMigrate(input);
    } else if (input.includes('backup')) {
      return this.parseBackup(input);
    } else if (input.includes('list') || input.includes('show')) {
      return this.parseList(input);
    } else if (input.includes('status')) {
      return this.parseStatus(input);
    } else if (input.includes('resources') || input.includes('usage')) {
      return this.parseResources(input);
    }

    // Default to status
    return this.parseStatus(input);
  }

  private parseInstallAgent(input: string): ParsedCommand {
    const onAllNodes = input.includes('all') || input.includes('every');
    const nodeMatch = input.match(/(?:on|to)\s+(?:node\s+)?([a-z0-9-]+)/i);
    const targetNode = nodeMatch ? nodeMatch[1] : undefined;

    return {
      action: onAllNodes ? 'install agent on all nodes' : `install agent on ${targetNode || 'specified node'}`,
      target: targetNode || 'all-nodes',
      parameters: {
        deployToAll: onAllNodes,
        targetNode
      },
      category: CommandCategory.SYSTEM,
      risk: CommandRisk.HIGH,
      requireConfirmation: true
    };
  }

  private parseDeployAgent(input: string): ParsedCommand {
    const onAllNodes = input.includes('all') || input.includes('every');
    const nodeMatch = input.match(/(?:on|to)\s+(?:node\s+)?([a-z0-9-]+)/i);
    const targetNode = nodeMatch ? nodeMatch[1] : undefined;

    return {
      action: onAllNodes ? 'deploy agent to all nodes' : `deploy agent to ${targetNode || 'specified node'}`,
      target: targetNode || 'all-nodes',
      parameters: {
        deployToAll: onAllNodes,
        targetNode
      },
      category: CommandCategory.SYSTEM,
      risk: CommandRisk.HIGH,
      requireConfirmation: true
    };
  }

  private parseCheckAgentStatus(input: string): ParsedCommand {
    return {
      action: 'check agent status on all nodes',
      target: 'all-nodes',
      parameters: {},
      category: CommandCategory.SYSTEM,
      risk: CommandRisk.LOW
    };
  }

  private parseUpdatePassword(input: string): ParsedCommand {
    const passwordMatch = input.match(/password\s+(?:to\s+)?["']?([^"'\s]+)["']?/i);
    const newPassword = passwordMatch ? passwordMatch[1] : undefined;

    return {
      action: 'update proxmox password on all nodes',
      target: 'all-nodes',
      parameters: {
        newPassword
      },
      category: CommandCategory.SYSTEM,
      risk: CommandRisk.CRITICAL,
      requireConfirmation: true
    };
  }

  private parseRestart(input: string): ParsedCommand {
    const vmName = this.extractVMName(input);
    
    return {
      action: `restart VM/Container ${vmName || ''}`,
      target: vmName || 'vm',
      parameters: { vmName },
      category: CommandCategory.SYSTEM,
      risk: CommandRisk.MEDIUM
    };
  }

  private parseStart(input: string): ParsedCommand {
    const vmName = this.extractVMName(input);
    
    return {
      action: `start VM/Container ${vmName || ''}`,
      target: vmName || 'vm',
      parameters: { vmName },
      category: CommandCategory.SYSTEM,
      risk: CommandRisk.LOW
    };
  }

  private parseStop(input: string): ParsedCommand {
    const vmName = this.extractVMName(input);
    const force = input.includes('force');
    const shutdown = input.includes('shutdown');
    
    return {
      action: shutdown ? `shutdown VM ${vmName || ''}` : `stop VM/Container ${vmName || ''}`,
      target: vmName || 'vm',
      parameters: { vmName, force },
      category: CommandCategory.SYSTEM,
      risk: force ? CommandRisk.HIGH : CommandRisk.MEDIUM
    };
  }

  private parseCreate(input: string): ParsedCommand {
    const isContainer = input.includes('container') || input.includes('lxc');
    const nameMatch = input.match(/(?:named?|called?)\s+["']?([a-z0-9-_]+)["']?/i);
    const nodeMatch = input.match(/(?:on|at|to)\s+(?:node\s+)?([a-z0-9-]+)/i);
    const templateMatch = input.match(/(?:template|from)\s+["']?([a-z0-9-_.\/]+)["']?/i);
    const coresMatch = input.match(/(\d+)\s*(?:core|cpu)/i);
    const memoryMatch = input.match(/(\d+)\s*(?:gb|mb)\s*(?:ram|memory)?/i);
    const diskMatch = input.match(/(\d+)\s*(?:gb|mb)\s*(?:disk|storage)?/i);
    
    const name = nameMatch ? nameMatch[1] : `new-${isContainer ? 'container' : 'vm'}-${Date.now()}`;
    const node = nodeMatch ? nodeMatch[1] : 'pve1';
    
    return {
      action: `create ${isContainer ? 'container' : 'VM'} ${name}`,
      target: name,
      parameters: {
        name,
        node,
        template: templateMatch ? templateMatch[1] : undefined,
        cores: coresMatch ? parseInt(coresMatch[1]) : 2,
        memory: memoryMatch ? parseInt(memoryMatch[1]) * (input.includes('gb') ? 1024 : 1) : 2048,
        disk: diskMatch ? `local-lvm:${diskMatch[1]}` : 'local-lvm:20'
      },
      category: CommandCategory.SYSTEM,
      risk: CommandRisk.HIGH,
      requireConfirmation: true
    };
  }

  private parseDelete(input: string): ParsedCommand {
    const vmName = this.extractVMName(input);
    const force = input.includes('force');
    
    return {
      action: `delete VM/Container ${vmName || ''}`,
      target: vmName || 'vm',
      parameters: { vmName, force },
      category: CommandCategory.SYSTEM,
      risk: CommandRisk.CRITICAL,
      requireConfirmation: true
    };
  }

  private parseClone(input: string): ParsedCommand {
    const sourceMatch = input.match(/(?:clone|copy)\s+["']?([a-z0-9-_]+)["']?/i);
    const nameMatch = input.match(/(?:to|as|named?|called?)\s+["']?([a-z0-9-_]+)["']?/i);
    const nodeMatch = input.match(/(?:on|at|to)\s+(?:node\s+)?([a-z0-9-]+)/i);
    const full = !input.includes('linked');
    
    const source = sourceMatch ? sourceMatch[1] : '';
    const name = nameMatch ? nameMatch[1] : `${source}-clone-${Date.now()}`;
    
    return {
      action: `clone VM/Container ${source} to ${name}`,
      target: source,
      parameters: {
        source,
        name,
        node: nodeMatch ? nodeMatch[1] : undefined,
        full
      },
      category: CommandCategory.SYSTEM,
      risk: CommandRisk.MEDIUM,
      requireConfirmation: true
    };
  }

  private parseMigrate(input: string): ParsedCommand {
    const vmName = this.extractVMName(input);
    const nodeMatch = input.match(/(?:to|target)\s+(?:node\s+)?([a-z0-9-]+)/i);
    const online = !input.includes('offline');
    const withLocalDisks = input.includes('local disk');
    
    return {
      action: `migrate VM/Container ${vmName || ''} to ${nodeMatch ? nodeMatch[1] : 'target node'}`,
      target: vmName || 'vm',
      parameters: {
        vmName,
        targetNode: nodeMatch ? nodeMatch[1] : undefined,
        online,
        withLocalDisks
      },
      category: CommandCategory.SYSTEM,
      risk: CommandRisk.HIGH,
      requireConfirmation: true
    };
  }

  private parseBackup(input: string): ParsedCommand {
    const vmName = this.extractVMName(input);
    const storageMatch = input.match(/(?:to|on|storage)\s+["']?([a-z0-9-_]+)["']?/i);
    const mode = input.includes('stop') ? 'stop' : input.includes('suspend') ? 'suspend' : 'snapshot';
    
    return {
      action: `backup VM/Container ${vmName || ''}`,
      target: vmName || 'vm',
      parameters: {
        vmName,
        storage: storageMatch ? storageMatch[1] : 'local',
        mode
      },
      category: CommandCategory.SYSTEM,
      risk: mode === 'stop' ? CommandRisk.MEDIUM : CommandRisk.LOW
    };
  }

  private parseList(input: string): ParsedCommand {
    const nodeMatch = input.match(/(?:on|at|from)\s+(?:node\s+)?([a-z0-9-]+)/i);
    const filterMatch = input.match(/(?:with|tagged?|named?|status)\s+["']?([a-z0-9-_]+)["']?/i);
    
    return {
      action: 'list VMs and containers',
      target: 'cluster',
      parameters: {
        node: nodeMatch ? nodeMatch[1] : undefined,
        filter: filterMatch ? filterMatch[1] : undefined
      },
      category: CommandCategory.SYSTEM,
      risk: CommandRisk.LOW
    };
  }

  private parseStatus(input: string): ParsedCommand {
    const vmName = this.extractVMName(input);
    
    return {
      action: vmName ? `get status of ${vmName}` : 'get cluster status',
      target: vmName || 'cluster',
      parameters: { vmName },
      category: CommandCategory.SYSTEM,
      risk: CommandRisk.LOW
    };
  }

  private parseResources(input: string): ParsedCommand {
    return {
      action: 'get resource usage',
      target: 'cluster',
      parameters: {},
      category: CommandCategory.SYSTEM,
      risk: CommandRisk.LOW
    };
  }

  private extractVMName(input: string): string | undefined {
    // Try various patterns to extract VM name
    const patterns = [
      /(?:vm|container|lxc|ct)\s+["']?([a-z0-9-_]+)["']?/i,
      /["']([a-z0-9-_]+)["']/,
      /\b(web-server|api-server|database|db-server|download-server|build-server|runner|[a-z]+-\d+)\b/i,
      /\b(\d{3,})\b/ // VMID
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return undefined;
  }
}