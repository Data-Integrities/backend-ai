import { 
  ParsedCommand, 
  CommandCategory, 
  CommandRisk,
  ServiceCommand,
  ConfigCommand,
  DebugCommand,
  SystemCommand,
  NetworkCommand
} from '@proxmox-ai-control/shared';

export class CommandParser {
  private commandPatterns = {
    service: {
      patterns: [
        /(?:restart|start|stop|status|enable|disable)\s+(?:the\s+)?(\w+)(?:\s+service)?/i,
        /check\s+(?:if\s+)?(\w+)\s+is\s+running/i,
        /is\s+(\w+)\s+(?:service\s+)?running/i
      ],
      category: CommandCategory.SERVICE
    },
    config: {
      patterns: [
        /(?:show|view|display)\s+(?:the\s+)?(\w+)\s+(?:configuration|config)/i,
        /add\s+(?:domain|site)\s+(\S+)\s+to\s+(\w+)/i,
        /(?:update|change|modify)\s+(\w+)\s+(?:configuration|config)/i
      ],
      category: CommandCategory.CONFIG
    },
    debug: {
      patterns: [
        /(?:show|display|get)\s+(?:last\s+)?(\d+)?\s*(?:error\s+)?logs?\s+(?:from|for)?\s*(\w+)?/i,
        /(?:why|what)\s+is\s+(?:wrong|the\s+problem)\s+(?:with\s+)?(\w+)?/i,
        /debug\s+(\w+)/i,
        /check\s+(?:the\s+)?error\s+logs/i
      ],
      category: CommandCategory.DEBUG
    },
    system: {
      patterns: [
        /(?:show|display|get)\s+(?:system\s+)?(?:info|information)/i,
        /(?:check|show)\s+disk\s+(?:usage|space)/i,
        /(?:check|show)\s+memory\s+(?:usage|info)/i,
        /reboot\s+(?:the\s+)?(?:server|system)/i,
        /(?:update|upgrade)\s+(?:the\s+)?agent/i,
        /force\s+update\s+(?:the\s+)?agent/i,
        /check\s+(?:for\s+)?agent\s+updates?/i
      ],
      category: CommandCategory.SYSTEM
    },
    network: {
      patterns: [
        /(?:ping|test\s+connection\s+to)\s+(\S+)/i,
        /(?:show|list)\s+(?:open\s+)?ports/i,
        /(?:show|list)\s+(?:network\s+)?connections/i,
        /what\s+domains?\s+(?:is|are)\s+nginx\s+(?:routing|serving)/i
      ],
      category: CommandCategory.NETWORK
    }
  };

  async parse(naturalLanguage: string): Promise<ParsedCommand> {
    const input = naturalLanguage.trim().toLowerCase();
    
    // Special handling for update commands
    if (input.includes('update') && input.includes('agent')) {
      return this.buildUpdateCommand(input);
    }
    
    // Try to match against known patterns
    for (const [type, config] of Object.entries(this.commandPatterns)) {
      for (const pattern of config.patterns) {
        const match = input.match(pattern);
        if (match) {
          return this.buildCommand(type, match, input, config.category);
        }
      }
    }

    // If no pattern matches, try to interpret the command
    return this.interpretGenericCommand(input);
  }

  private buildUpdateCommand(input: string): ParsedCommand {
    const force = input.includes('force');
    
    return {
      action: force ? 'force update agent' : 'check for agent updates',
      target: 'agent',
      parameters: {
        action: 'update',
        force
      },
      category: CommandCategory.SYSTEM,
      risk: CommandRisk.MEDIUM,
      validation: {
        preChecks: ['echo "Current agent version: $AGENT_VERSION"']
      }
    };
  }

  private buildCommand(
    type: string, 
    match: RegExpMatchArray, 
    input: string,
    category: CommandCategory
  ): ParsedCommand {
    switch (type) {
      case 'service':
        return this.buildServiceCommand(match, input);
      case 'config':
        return this.buildConfigCommand(match, input);
      case 'debug':
        return this.buildDebugCommand(match, input);
      case 'system':
        return this.buildSystemCommand(match, input);
      case 'network':
        return this.buildNetworkCommand(match, input);
      default:
        throw new Error(`Unknown command type: ${type}`);
    }
  }

  private buildServiceCommand(match: RegExpMatchArray, input: string): ParsedCommand {
    let action: ServiceCommand['action'] = 'status';
    let service = '';

    if (input.includes('restart')) action = 'restart';
    else if (input.includes('start')) action = 'start';
    else if (input.includes('stop')) action = 'stop';
    else if (input.includes('enable')) action = 'enable';
    else if (input.includes('disable')) action = 'disable';
    else if (input.includes('check') || input.includes('is')) action = 'status';

    // Extract service name
    service = match[1] || '';
    if (!service) {
      // Try to extract service name from the input
      const serviceMatch = input.match(/(?:nginx|apache|mysql|postgresql|redis|docker|ssh|systemd-[a-z-]+)/);
      service = serviceMatch ? serviceMatch[0] : '';
    }

    const parameters: ServiceCommand = { service, action };

    return {
      action: `${action} ${service} service`,
      target: service,
      parameters,
      category: CommandCategory.SERVICE,
      risk: ['restart', 'stop', 'disable'].includes(action) ? CommandRisk.MEDIUM : CommandRisk.LOW,
      shellCommands: [`systemctl ${action} ${service}`]
    };
  }

  private buildConfigCommand(match: RegExpMatchArray, input: string): ParsedCommand {
    let action: ConfigCommand['action'] = 'view';
    let service = '';
    let changes: any = {};

    if (input.includes('show') || input.includes('view')) {
      action = 'view';
      service = match[1] || '';
    } else if (input.includes('add')) {
      action = 'edit';
      const domain = match[1];
      service = match[2] || 'nginx';
      changes = { addDomain: domain };
    }

    const parameters: ConfigCommand = { service, action, changes };

    return {
      action: `${action} ${service} configuration`,
      target: service,
      parameters,
      category: CommandCategory.CONFIG,
      risk: action === 'edit' ? CommandRisk.HIGH : CommandRisk.LOW,
      validation: action === 'edit' ? {
        preChecks: [`${service} -t`],
        rollbackCommands: [`cp /var/backups/ai-agent/${service}_*.conf /etc/${service}/`]
      } : undefined
    };
  }

  private buildDebugCommand(match: RegExpMatchArray, input: string): ParsedCommand {
    let target: DebugCommand['target'] = 'logs';
    let filters: DebugCommand['filters'] = {};

    if (input.includes('log')) {
      target = 'logs';
      const count = match[1] ? parseInt(match[1]) : 100;
      const service = match[2] || '';
      filters = { count, service };
      
      if (input.includes('error')) {
        filters.severity = 'error';
      }
    } else if (input.includes('disk')) {
      target = 'disk';
    } else if (input.includes('memory')) {
      target = 'memory';
    } else if (input.includes('process')) {
      target = 'process';
    }

    const parameters: DebugCommand = { target, filters };

    return {
      action: `debug ${target}`,
      target: target,
      parameters,
      category: CommandCategory.DEBUG,
      risk: CommandRisk.LOW
    };
  }

  private buildSystemCommand(match: RegExpMatchArray, input: string): ParsedCommand {
    let action: SystemCommand['action'] = 'info';

    if (input.includes('reboot')) {
      action = 'reboot';
    } else if (input.includes('update') || input.includes('upgrade')) {
      action = 'update';
    } else if (input.includes('disk')) {
      return this.buildDebugCommand(match, input);
    } else if (input.includes('memory')) {
      return this.buildDebugCommand(match, input);
    }

    const parameters: SystemCommand = { action };

    return {
      action: `system ${action}`,
      target: 'system',
      parameters,
      category: CommandCategory.SYSTEM,
      risk: action === 'reboot' ? CommandRisk.CRITICAL : CommandRisk.LOW
    };
  }

  private buildNetworkCommand(match: RegExpMatchArray, input: string): ParsedCommand {
    let action: NetworkCommand['action'] = 'ping';
    let target = '';

    if (input.includes('ping')) {
      action = 'ping';
      target = match[1] || '8.8.8.8';
    } else if (input.includes('port')) {
      action = 'ports';
    } else if (input.includes('connection')) {
      action = 'connections';
    } else if (input.includes('domain') && input.includes('nginx')) {
      // Special case for nginx domains
      return {
        action: 'list nginx domains',
        target: 'nginx',
        parameters: {},
        category: CommandCategory.CONFIG,
        risk: CommandRisk.LOW,
        shellCommands: [
          'find /etc/nginx/sites-enabled -type f -exec grep -H "server_name" {} \\;',
          'nginx -T 2>/dev/null | grep "server_name"'
        ]
      };
    }

    const parameters: NetworkCommand = { action, target };

    return {
      action: `network ${action}`,
      target: target || 'network',
      parameters,
      category: CommandCategory.NETWORK,
      risk: CommandRisk.LOW
    };
  }

  private interpretGenericCommand(input: string): ParsedCommand {
    // Handle some generic cases
    if (input.includes('not working') || input.includes('broken')) {
      const serviceMatch = input.match(/(\w+)\s+(?:is\s+)?(?:not\s+working|broken)/);
      const service = serviceMatch ? serviceMatch[1] : 'unknown';
      
      return {
        action: `diagnose ${service}`,
        target: service,
        parameters: { target: 'logs', filters: { service, severity: 'error', count: 50 } },
        category: CommandCategory.DEBUG,
        risk: CommandRisk.LOW,
        shellCommands: [
          `systemctl status ${service}`,
          `journalctl -u ${service} -n 50 --no-pager`,
          `ps aux | grep ${service}`
        ]
      };
    }

    // Default fallback
    return {
      action: 'unknown command',
      target: 'system',
      parameters: {},
      category: CommandCategory.SYSTEM,
      risk: CommandRisk.LOW,
      shellCommands: [`echo "Could not parse command: ${input}"`]
    };
  }
}