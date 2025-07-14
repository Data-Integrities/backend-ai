import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { Logger } from './Logger';

export interface ProxmoxNode {
  node: string;
  status: 'online' | 'offline';
  cpu: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
}

export interface ProxmoxVM {
  vmid: number;
  name: string;
  status: 'running' | 'stopped' | 'paused';
  node: string;
  type: 'qemu' | 'lxc';
  cpus?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  tags?: string;
}

export interface ProxmoxTask {
  upid: string;
  type: string;
  status: string;
  exitstatus?: string;
  pid: number;
  starttime: number;
  endtime?: number;
}

export interface MigrateOptions {
  target: string;
  online?: boolean;
  'with-local-disks'?: boolean;
}

export interface CreateVMOptions {
  vmid?: number;
  name: string;
  node: string;
  ostemplate?: string;  // For LXC
  cores?: number;
  memory?: number;
  disk?: string;
  net0?: string;
  password?: string;
  ssh_public_keys?: string;
  start?: boolean;
}

export class ProxmoxAPIWrapper {
  private client: AxiosInstance;
  private logger: Logger;
  private authTicket?: string;
  private csrfToken?: string;
  private nodes: string[] = [];

  constructor(
    private host: string,
    private username: string,
    private password: string,
    logger: Logger,
    private skipSSLVerify: boolean = true
  ) {
    this.logger = logger;
    
    this.client = axios.create({
      baseURL: `https://${host}:8006/api2/json`,
      timeout: 30000,
      httpsAgent: skipSSLVerify ? new https.Agent({
        rejectUnauthorized: false
      }) : undefined
    });

    // Add auth headers to all requests
    this.client.interceptors.request.use((config) => {
      if (this.authTicket && this.csrfToken) {
        config.headers.Cookie = `PVEAuthCookie=${this.authTicket}`;
        config.headers['CSRFPreventionToken'] = this.csrfToken;
      }
      return config;
    });
  }

  async authenticate(): Promise<void> {
    try {
      const response = await this.client.post('/access/ticket', {
        username: this.username,
        password: this.password
      });

      this.authTicket = response.data.data.ticket;
      this.csrfToken = response.data.data.CSRFPreventionToken;
      
      this.logger.info(`Authenticated to Proxmox as ${this.username}`);
      
      // Get available nodes
      await this.refreshNodes();
    } catch (error) {
      throw new Error(`Proxmox authentication failed: ${error}`);
    }
  }

  private async refreshNodes(): Promise<void> {
    const response = await this.client.get('/nodes');
    this.nodes = response.data.data.map((n: any) => n.node);
    this.logger.info(`Available nodes: ${this.nodes.join(', ')}`);
  }

  // Node operations
  async getNodes(): Promise<ProxmoxNode[]> {
    const response = await this.client.get('/nodes');
    return response.data.data;
  }

  async getNodeStatus(node: string): Promise<ProxmoxNode> {
    const response = await this.client.get(`/nodes/${node}/status`);
    return response.data.data;
  }

  // VM/Container listing
  async getAllVMs(): Promise<ProxmoxVM[]> {
    const vms: ProxmoxVM[] = [];
    
    for (const node of this.nodes) {
      const [qemuVMs, lxcContainers] = await Promise.all([
        this.getNodeVMs(node),
        this.getNodeContainers(node)
      ]);
      
      vms.push(...qemuVMs, ...lxcContainers);
    }
    
    return vms;
  }

  async getNodeVMs(node: string): Promise<ProxmoxVM[]> {
    const response = await this.client.get(`/nodes/${node}/qemu`);
    return response.data.data.map((vm: any) => ({
      ...vm,
      node,
      type: 'qemu'
    }));
  }

  async getNodeContainers(node: string): Promise<ProxmoxVM[]> {
    const response = await this.client.get(`/nodes/${node}/lxc`);
    return response.data.data.map((ct: any) => ({
      ...ct,
      node,
      type: 'lxc'
    }));
  }

  async getVMStatus(node: string, vmid: number, type: 'qemu' | 'lxc'): Promise<any> {
    const response = await this.client.get(`/nodes/${node}/${type}/${vmid}/status/current`);
    return response.data.data;
  }

  // VM/Container operations
  async startVM(node: string, vmid: number, type: 'qemu' | 'lxc'): Promise<string> {
    const response = await this.client.post(`/nodes/${node}/${type}/${vmid}/status/start`);
    return response.data.data; // Returns UPID (task ID)
  }

  async stopVM(node: string, vmid: number, type: 'qemu' | 'lxc', force: boolean = false): Promise<string> {
    const response = await this.client.post(`/nodes/${node}/${type}/${vmid}/status/stop`);
    return response.data.data;
  }

  async shutdownVM(node: string, vmid: number, type: 'qemu' | 'lxc'): Promise<string> {
    const response = await this.client.post(`/nodes/${node}/${type}/${vmid}/status/shutdown`);
    return response.data.data;
  }

  async rebootVM(node: string, vmid: number, type: 'qemu' | 'lxc'): Promise<string> {
    const response = await this.client.post(`/nodes/${node}/${type}/${vmid}/status/reboot`);
    return response.data.data;
  }

  // Migration
  async migrateVM(
    node: string, 
    vmid: number, 
    type: 'qemu' | 'lxc',
    options: MigrateOptions
  ): Promise<string> {
    const response = await this.client.post(
      `/nodes/${node}/${type}/${vmid}/migrate`,
      options
    );
    return response.data.data;
  }

  // Create VM/Container
  async createContainer(options: CreateVMOptions): Promise<string> {
    const { node, ...config } = options;
    
    // If no vmid specified, find next available
    if (!config.vmid) {
      config.vmid = await this.getNextVMID();
    }
    
    const response = await this.client.post(`/nodes/${node}/lxc`, config);
    return response.data.data;
  }

  async createVM(options: CreateVMOptions): Promise<string> {
    const { node, ...config } = options;
    
    // If no vmid specified, find next available
    if (!config.vmid) {
      config.vmid = await this.getNextVMID();
    }
    
    const response = await this.client.post(`/nodes/${node}/qemu`, config);
    return response.data.data;
  }

  // Delete VM/Container
  async deleteVM(node: string, vmid: number, type: 'qemu' | 'lxc'): Promise<string> {
    const response = await this.client.delete(`/nodes/${node}/${type}/${vmid}`);
    return response.data.data;
  }

  // Clone VM/Container
  async cloneVM(
    node: string,
    vmid: number,
    type: 'qemu' | 'lxc',
    newid: number,
    name: string,
    full: boolean = true
  ): Promise<string> {
    const response = await this.client.post(`/nodes/${node}/${type}/${vmid}/clone`, {
      newid,
      name,
      full: full ? 1 : 0
    });
    return response.data.data;
  }

  // Task monitoring
  async getTaskStatus(node: string, upid: string): Promise<ProxmoxTask> {
    const response = await this.client.get(`/nodes/${node}/tasks/${upid}/status`);
    return response.data.data;
  }

  async waitForTask(node: string, upid: string, timeout: number = 300000): Promise<ProxmoxTask> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const task = await this.getTaskStatus(node, upid);
      
      if (task.status !== 'running') {
        return task;
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error(`Task ${upid} timed out after ${timeout}ms`);
  }

  // Helper methods
  async getNextVMID(): Promise<number> {
    const response = await this.client.get('/cluster/nextid');
    return response.data.data;
  }

  async findVMByName(name: string): Promise<ProxmoxVM | null> {
    const vms = await this.getAllVMs();
    return vms.find(vm => vm.name === name) || null;
  }

  async getVMsByTag(tag: string): Promise<ProxmoxVM[]> {
    const vms = await this.getAllVMs();
    return vms.filter(vm => vm.tags?.includes(tag));
  }

  // Storage operations
  async getStorages(): Promise<any[]> {
    const response = await this.client.get('/storage');
    return response.data.data;
  }

  async getNodeStorages(node: string): Promise<any[]> {
    const response = await this.client.get(`/nodes/${node}/storage`);
    return response.data.data;
  }

  // Backup operations
  async createBackup(
    node: string,
    vmid: number,
    type: 'qemu' | 'lxc',
    storage: string,
    mode: 'snapshot' | 'suspend' | 'stop' = 'snapshot'
  ): Promise<string> {
    const response = await this.client.post(`/nodes/${node}/vzdump`, {
      vmid,
      storage,
      mode,
      compress: 'zstd'
    });
    return response.data.data;
  }

  // Resource usage
  async getClusterResources(): Promise<any[]> {
    const response = await this.client.get('/cluster/resources');
    return response.data.data;
  }

  async getResourceUsage(type?: 'vm' | 'storage' | 'node'): Promise<any[]> {
    const resources = await this.getClusterResources();
    return type ? resources.filter(r => r.type === type) : resources;
  }
}