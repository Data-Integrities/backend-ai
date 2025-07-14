export enum CommandCategory {
  SERVICE = 'service',
  CONFIG = 'config',
  DEBUG = 'debug',
  SYSTEM = 'system',
  NETWORK = 'network',
  FILE = 'file',
  PROCESS = 'process',
  CONTAINER = 'container'
}

export enum CommandRisk {
  LOW = 'low',        // Read-only operations
  MEDIUM = 'medium',  // Service restarts, config views
  HIGH = 'high',      // Config changes, file modifications
  CRITICAL = 'critical' // System reboots, deletions
}

export interface CommandRequest {
  id: string;
  timestamp: Date;
  naturalLanguage: string;
  sourceHub: string;
  targetAgents?: string[];
  category?: CommandCategory;
  risk?: CommandRisk;
  requireConfirmation?: boolean;
  timeout?: number;
}

export interface ParsedCommand {
  action: string;
  target: string;
  parameters: Record<string, any>;
  category: CommandCategory;
  risk: CommandRisk;
  shellCommands?: string[];
  validation?: CommandValidation;
}

export interface CommandValidation {
  preChecks?: string[];
  postChecks?: string[];
  rollbackCommands?: string[];
}

export interface CommandResult {
  requestId: string;
  agentId: string;
  success: boolean;
  timestamp: Date;
  executionTime: number;
  output?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface AgentCapabilities {
  os: string;
  osVersion: string;
  installedServices: string[];
  supportedCommands: CommandCategory[];
  customCapabilities?: string[];
}

export interface AgentStatus {
  agentId: string;
  hostname: string;
  ip: string;
  status: 'online' | 'offline' | 'error';
  lastSeen: Date;
  version: string;
  capabilities: AgentCapabilities;
  currentLoad?: {
    cpu: number;
    memory: number;
    disk: number;
  };
}

// Common command templates
export interface ServiceCommand {
  service: string;
  action: 'start' | 'stop' | 'restart' | 'status' | 'enable' | 'disable';
}

export interface ConfigCommand {
  service: string;
  configFile?: string;
  action: 'view' | 'edit' | 'validate' | 'backup' | 'restore';
  changes?: Record<string, any>;
}

export interface DebugCommand {
  target: 'logs' | 'process' | 'network' | 'disk' | 'memory';
  filters?: {
    service?: string;
    timeRange?: string;
    severity?: 'error' | 'warn' | 'info' | 'debug';
    count?: number;
  };
}

export interface SystemCommand {
  action: 'reboot' | 'shutdown' | 'update' | 'upgrade' | 'info';
  force?: boolean;
  scheduled?: Date;
}

export interface NetworkCommand {
  action: 'ping' | 'traceroute' | 'ports' | 'connections' | 'firewall';
  target?: string;
  parameters?: Record<string, any>;
}