import { 
  ParsedCommand, 
  CommandResult,
  CommandCategory
} from '@proxmox-ai-control/shared';
import { ProxmoxAPIWrapper, ProxmoxVM, MigrateOptions } from './ProxmoxAPIWrapper';
import { Logger } from './Logger';

export class ProxmoxCommandExecutor {
  private proxmox: ProxmoxAPIWrapper;
  private logger: Logger;

  constructor(proxmox: ProxmoxAPIWrapper, logger: Logger) {
    this.proxmox = proxmox;
    this.logger = logger;
  }

  async execute(command: ParsedCommand, requestId: string): Promise<CommandResult> {
    const startTime = Date.now();
    
    try {
      let output: string;
      
      // Route to appropriate handler based on action
      const action = command.action.toLowerCase();
      
      if (action.includes('restart') && (action.includes('vm') || action.includes('container'))) {
        output = await this.handleRestart(command);
      } else if (action.includes('start') && (action.includes('vm') || action.includes('container'))) {
        output = await this.handleStart(command);
      } else if (action.includes('stop') && (action.includes('vm') || action.includes('container'))) {
        output = await this.handleStop(command);
      } else if (action.includes('shutdown')) {
        output = await this.handleShutdown(command);
      } else if (action.includes('create') && (action.includes('vm') || action.includes('container'))) {
        output = await this.handleCreate(command);
      } else if (action.includes('delete') || action.includes('remove')) {
        output = await this.handleDelete(command);
      } else if (action.includes('clone')) {
        output = await this.handleClone(command);
      } else if (action.includes('migrate') || action.includes('move')) {
        output = await this.handleMigrate(command);
      } else if (action.includes('backup')) {
        output = await this.handleBackup(command);
      } else if (action.includes('list') || action.includes('show')) {
        output = await this.handleList(command);
      } else if (action.includes('status')) {
        output = await this.handleStatus(command);
      } else if (action.includes('resources') || action.includes('usage')) {
        output = await this.handleResources(command);
      } else {
        throw new Error(`Unknown Proxmox command: ${command.action}`);
      }

      return {
        requestId,
        agentId: process.env.AGENT_ID || 'proxmox-agent',
        success: true,
        timestamp: new Date(),
        executionTime: Date.now() - startTime,
        output
      };

    } catch (error) {
      return {
        requestId,
        agentId: process.env.AGENT_ID || 'proxmox-agent',
        success: false,
        timestamp: new Date(),
        executionTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async handleRestart(command: ParsedCommand): Promise<string> {
    const vmName = command.parameters.vmName || command.target;
    const vm = await this.findVM(vmName);
    
    if (!vm) {
      throw new Error(`VM/Container '${vmName}' not found`);
    }

    this.logger.info(`Restarting ${vm.type} ${vm.vmid} (${vm.name}) on ${vm.node}`);
    
    const taskId = await this.proxmox.rebootVM(vm.node, vm.vmid, vm.type);
    await this.waitForTask(vm.node, taskId);
    
    return `Successfully restarted ${vm.type} '${vm.name}' (ID: ${vm.vmid}) on node ${vm.node}`;
  }

  private async handleStart(command: ParsedCommand): Promise<string> {
    const vmName = command.parameters.vmName || command.target;
    const vm = await this.findVM(vmName);
    
    if (!vm) {
      throw new Error(`VM/Container '${vmName}' not found`);
    }

    if (vm.status === 'running') {
      return `${vm.type} '${vm.name}' is already running`;
    }

    this.logger.info(`Starting ${vm.type} ${vm.vmid} (${vm.name}) on ${vm.node}`);
    
    const taskId = await this.proxmox.startVM(vm.node, vm.vmid, vm.type);
    await this.waitForTask(vm.node, taskId);
    
    return `Successfully started ${vm.type} '${vm.name}' (ID: ${vm.vmid}) on node ${vm.node}`;
  }

  private async handleStop(command: ParsedCommand): Promise<string> {
    const vmName = command.parameters.vmName || command.target;
    const force = command.parameters.force || false;
    const vm = await this.findVM(vmName);
    
    if (!vm) {
      throw new Error(`VM/Container '${vmName}' not found`);
    }

    if (vm.status === 'stopped') {
      return `${vm.type} '${vm.name}' is already stopped`;
    }

    this.logger.info(`Stopping ${vm.type} ${vm.vmid} (${vm.name}) on ${vm.node}`);
    
    const taskId = await this.proxmox.stopVM(vm.node, vm.vmid, vm.type, force);
    await this.waitForTask(vm.node, taskId);
    
    return `Successfully stopped ${vm.type} '${vm.name}' (ID: ${vm.vmid}) on node ${vm.node}`;
  }

  private async handleShutdown(command: ParsedCommand): Promise<string> {
    const vmName = command.parameters.vmName || command.target;
    const vm = await this.findVM(vmName);
    
    if (!vm) {
      throw new Error(`VM/Container '${vmName}' not found`);
    }

    this.logger.info(`Shutting down ${vm.type} ${vm.vmid} (${vm.name}) on ${vm.node}`);
    
    const taskId = await this.proxmox.shutdownVM(vm.node, vm.vmid, vm.type);
    await this.waitForTask(vm.node, taskId);
    
    return `Successfully initiated shutdown of ${vm.type} '${vm.name}' (ID: ${vm.vmid}) on node ${vm.node}`;
  }

  private async handleCreate(command: ParsedCommand): Promise<string> {
    const { name, node, template, cores, memory, disk, network } = command.parameters;
    
    if (!name || !node) {
      throw new Error('Name and node are required for creating VM/Container');
    }

    const isContainer = command.action.includes('container');
    
    const options = {
      name,
      node,
      ostemplate: isContainer ? (template || 'local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst') : undefined,
      cores: cores || 1,
      memory: memory || 512,
      disk: disk || 'local-lvm:8',
      net0: network || 'name=eth0,bridge=vmbr0,ip=dhcp',
      start: true
    };

    this.logger.info(`Creating ${isContainer ? 'container' : 'VM'} '${name}' on ${node}`);
    
    const taskId = isContainer 
      ? await this.proxmox.createContainer(options)
      : await this.proxmox.createVM(options);
      
    await this.waitForTask(node, taskId);
    
    const newVM = await this.proxmox.findVMByName(name);
    
    return `Successfully created ${isContainer ? 'container' : 'VM'} '${name}' (ID: ${newVM?.vmid}) on node ${node}`;
  }

  private async handleDelete(command: ParsedCommand): Promise<string> {
    const vmName = command.parameters.vmName || command.target;
    const vm = await this.findVM(vmName);
    
    if (!vm) {
      throw new Error(`VM/Container '${vmName}' not found`);
    }

    // Safety check
    if (!command.parameters.force) {
      throw new Error(`Deleting ${vm.type} '${vm.name}' requires force flag for safety`);
    }

    this.logger.info(`Deleting ${vm.type} ${vm.vmid} (${vm.name}) on ${vm.node}`);
    
    const taskId = await this.proxmox.deleteVM(vm.node, vm.vmid, vm.type);
    await this.waitForTask(vm.node, taskId);
    
    return `Successfully deleted ${vm.type} '${vm.name}' (ID: ${vm.vmid}) from node ${vm.node}`;
  }

  private async handleClone(command: ParsedCommand): Promise<string> {
    const { source, name, node, full } = command.parameters;
    const sourceVM = await this.findVM(source);
    
    if (!sourceVM) {
      throw new Error(`Source VM/Container '${source}' not found`);
    }

    const newId = await this.proxmox.getNextVMID();
    const targetNode = node || sourceVM.node;
    
    this.logger.info(`Cloning ${sourceVM.type} ${sourceVM.vmid} to ${newId} as '${name}'`);
    
    const taskId = await this.proxmox.cloneVM(
      sourceVM.node,
      sourceVM.vmid,
      sourceVM.type,
      newId,
      name,
      full !== false
    );
    
    await this.waitForTask(sourceVM.node, taskId);
    
    return `Successfully cloned ${sourceVM.type} '${sourceVM.name}' to '${name}' (ID: ${newId}) on node ${targetNode}`;
  }

  private async handleMigrate(command: ParsedCommand): Promise<string> {
    const { vmName, targetNode, online, withLocalDisks } = command.parameters;
    const vm = await this.findVM(vmName || command.target);
    
    if (!vm) {
      throw new Error(`VM/Container '${vmName}' not found`);
    }

    if (!targetNode) {
      throw new Error('Target node is required for migration');
    }

    const options: MigrateOptions = {
      target: targetNode,
      online: online !== false,
      'with-local-disks': withLocalDisks || false
    };

    this.logger.info(`Migrating ${vm.type} ${vm.vmid} from ${vm.node} to ${targetNode}`);
    
    const taskId = await this.proxmox.migrateVM(vm.node, vm.vmid, vm.type, options);
    await this.waitForTask(vm.node, taskId);
    
    return `Successfully migrated ${vm.type} '${vm.name}' (ID: ${vm.vmid}) from ${vm.node} to ${targetNode}`;
  }

  private async handleBackup(command: ParsedCommand): Promise<string> {
    const { vmName, storage, mode } = command.parameters;
    const vm = await this.findVM(vmName || command.target);
    
    if (!vm) {
      throw new Error(`VM/Container '${vmName}' not found`);
    }

    const backupStorage = storage || 'local';
    const backupMode = mode || 'snapshot';
    
    this.logger.info(`Creating backup of ${vm.type} ${vm.vmid} to ${backupStorage}`);
    
    const taskId = await this.proxmox.createBackup(
      vm.node,
      vm.vmid,
      vm.type,
      backupStorage,
      backupMode
    );
    
    await this.waitForTask(vm.node, taskId);
    
    return `Successfully created backup of ${vm.type} '${vm.name}' (ID: ${vm.vmid}) to storage '${backupStorage}'`;
  }

  private async handleList(command: ParsedCommand): Promise<string> {
    const { filter, node } = command.parameters;
    let vms = await this.proxmox.getAllVMs();
    
    if (node) {
      vms = vms.filter(vm => vm.node === node);
    }
    
    if (filter) {
      vms = vms.filter(vm => 
        vm.name.includes(filter) || 
        vm.tags?.includes(filter) ||
        vm.status === filter
      );
    }

    if (vms.length === 0) {
      return 'No VMs/Containers found matching criteria';
    }

    const output = ['VMs and Containers:', ''];
    
    // Group by node
    const byNode: { [key: string]: ProxmoxVM[] } = {};
    vms.forEach(vm => {
      if (!byNode[vm.node]) byNode[vm.node] = [];
      byNode[vm.node].push(vm);
    });

    Object.entries(byNode).forEach(([node, nodeVMs]) => {
      output.push(`Node: ${node}`);
      nodeVMs.forEach(vm => {
        const status = vm.status === 'running' ? '🟢' : '🔴';
        const type = vm.type === 'qemu' ? 'VM' : 'CT';
        const memory = vm.maxmem ? `${Math.round(vm.mem! / vm.maxmem * 100)}% RAM` : '';
        output.push(`  ${status} [${type} ${vm.vmid}] ${vm.name} - ${memory}`);
      });
      output.push('');
    });

    return output.join('\n');
  }

  private async handleStatus(command: ParsedCommand): Promise<string> {
    const vmName = command.parameters.vmName || command.target;
    
    if (vmName) {
      const vm = await this.findVM(vmName);
      if (!vm) {
        throw new Error(`VM/Container '${vmName}' not found`);
      }
      
      const status = await this.proxmox.getVMStatus(vm.node, vm.vmid, vm.type);
      
      return `${vm.type} '${vm.name}' (ID: ${vm.vmid}) on ${vm.node}:
Status: ${status.status}
CPU: ${status.cpus} cores (${Math.round(status.cpu * 100)}% usage)
Memory: ${this.formatBytes(status.mem)} / ${this.formatBytes(status.maxmem)} (${Math.round(status.mem / status.maxmem * 100)}%)
Disk: ${this.formatBytes(status.disk)} / ${this.formatBytes(status.maxdisk)}
Uptime: ${this.formatUptime(status.uptime)}`;
    }

    // Show cluster status
    const nodes = await this.proxmox.getNodes();
    const output = ['Proxmox Cluster Status:', ''];
    
    for (const node of nodes) {
      const status = node.status === 'online' ? '🟢' : '🔴';
      output.push(`${status} ${node.node}:`);
      output.push(`  CPU: ${Math.round(node.cpu * 100)}% (${node.maxcpu} cores)`);
      output.push(`  Memory: ${this.formatBytes(node.mem)} / ${this.formatBytes(node.maxmem)}`);
      output.push(`  Disk: ${this.formatBytes(node.disk)} / ${this.formatBytes(node.maxdisk)}`);
      output.push(`  Uptime: ${this.formatUptime(node.uptime)}`);
      output.push('');
    }

    return output.join('\n');
  }

  private async handleResources(command: ParsedCommand): Promise<string> {
    const resources = await this.proxmox.getClusterResources();
    
    // Calculate totals
    const totals = {
      cpu: 0,
      maxcpu: 0,
      mem: 0,
      maxmem: 0,
      disk: 0,
      maxdisk: 0,
      runningVMs: 0,
      totalVMs: 0
    };

    resources.forEach(r => {
      if (r.type === 'node') {
        totals.maxcpu += r.maxcpu || 0;
        totals.maxmem += r.maxmem || 0;
        totals.maxdisk += r.maxdisk || 0;
      } else if (r.type === 'qemu' || r.type === 'lxc') {
        totals.totalVMs++;
        if (r.status === 'running') {
          totals.runningVMs++;
          totals.cpu += (r.cpu || 0) * (r.maxcpu || 0);
          totals.mem += r.mem || 0;
          totals.disk += r.disk || 0;
        }
      }
    });

    return `Cluster Resource Usage:

Total Resources:
  CPUs: ${totals.maxcpu} cores
  Memory: ${this.formatBytes(totals.maxmem)}
  Storage: ${this.formatBytes(totals.maxdisk)}

Current Usage:
  CPU: ${Math.round(totals.cpu / totals.maxcpu * 100)}% (${totals.cpu.toFixed(1)} / ${totals.maxcpu} cores)
  Memory: ${Math.round(totals.mem / totals.maxmem * 100)}% (${this.formatBytes(totals.mem)} / ${this.formatBytes(totals.maxmem)})
  Storage: ${Math.round(totals.disk / totals.maxdisk * 100)}% (${this.formatBytes(totals.disk)} / ${this.formatBytes(totals.maxdisk)})

VMs/Containers:
  Total: ${totals.totalVMs}
  Running: ${totals.runningVMs}
  Stopped: ${totals.totalVMs - totals.runningVMs}`;
  }

  // Helper methods
  private async findVM(identifier: string): Promise<ProxmoxVM | null> {
    // Try to find by name first
    let vm = await this.proxmox.findVMByName(identifier);
    
    // If not found and identifier is numeric, try by VMID
    if (!vm && /^\d+$/.test(identifier)) {
      const vmid = parseInt(identifier);
      const allVMs = await this.proxmox.getAllVMs();
      vm = allVMs.find(v => v.vmid === vmid) || null;
    }
    
    return vm;
  }

  private async waitForTask(node: string, taskId: string): Promise<void> {
    this.logger.info(`Waiting for task ${taskId} on ${node}`);
    const task = await this.proxmox.waitForTask(node, taskId);
    
    if (task.exitstatus !== 'OK') {
      throw new Error(`Task failed with status: ${task.exitstatus}`);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }
}