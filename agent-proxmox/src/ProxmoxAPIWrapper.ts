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

  // Container execution methods for agent deployment
  async execInContainer(
    node: string,
    vmid: number,
    command: string | string[],
    timeout: number = 30
  ): Promise<{ exitcode: number; stdout: string; stderr: string }> {
    try {
      // Proxmox API expects commands as array
      const cmdArray = Array.isArray(command) ? command : ['/bin/bash', '-c', command];
      
      const response = await this.client.post(`/nodes/${node}/lxc/${vmid}/exec`, {
        command: cmdArray,
        timeout
      });

      // The exec API returns a task UPID, we need to wait for it
      const upid = response.data.data;
      const task = await this.waitForTask(node, upid, timeout * 1000);
      
      // Get the exec output from the task log
      const logResponse = await this.client.get(`/nodes/${node}/tasks/${upid}/log`);
      const logs = logResponse.data.data;
      
      // Parse the output from task logs
      let stdout = '';
      let stderr = '';
      let exitcode = 0;
      
      logs.forEach((log: any) => {
        const text = log.t || '';
        if (text.includes('STDOUT:')) {
          stdout += text.replace('STDOUT:', '').trim() + '\n';
        } else if (text.includes('STDERR:')) {
          stderr += text.replace('STDERR:', '').trim() + '\n';
        } else if (text.includes('exit status')) {
          const match = text.match(/exit status (\d+)/);
          if (match) {
            exitcode = parseInt(match[1]);
          }
        }
      });

      return { exitcode, stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (error: any) {
      this.logger.error(`Failed to execute in container ${vmid}: ${error.message}`);
      throw error;
    }
  }

  // Check if container has required tools installed
  async checkContainerTools(
    node: string,
    vmid: number
  ): Promise<{ bash: boolean; wget: boolean; curl: boolean; systemd: boolean }> {
    const tools = {
      bash: false,
      wget: false,
      curl: false,
      systemd: false
    };

    try {
      // Check for bash
      const bashResult = await this.execInContainer(node, vmid, ['which', 'bash']);
      tools.bash = bashResult.exitcode === 0;

      // Check for wget
      const wgetResult = await this.execInContainer(node, vmid, ['which', 'wget']);
      tools.wget = wgetResult.exitcode === 0;

      // Check for curl
      const curlResult = await this.execInContainer(node, vmid, ['which', 'curl']);
      tools.curl = curlResult.exitcode === 0;

      // Check for systemd
      const systemdResult = await this.execInContainer(node, vmid, ['which', 'systemctl']);
      tools.systemd = systemdResult.exitcode === 0;
    } catch (error) {
      this.logger.warn(`Error checking tools in container ${vmid}: ${error}`);
    }

    return tools;
  }

  // Get container OS information
  async getContainerOSInfo(
    node: string,
    vmid: number
  ): Promise<{ distribution: string; version: string; codename: string }> {
    try {
      // Try to read os-release file
      const osReleaseResult = await this.execInContainer(
        node,
        vmid,
        'cat /etc/os-release 2>/dev/null || cat /usr/lib/os-release 2>/dev/null'
      );

      if (osReleaseResult.exitcode === 0) {
        const lines = osReleaseResult.stdout.split('\n');
        const osInfo: any = {};
        
        lines.forEach(line => {
          const [key, value] = line.split('=');
          if (key && value) {
            osInfo[key] = value.replace(/"/g, '');
          }
        });

        return {
          distribution: osInfo.ID || 'unknown',
          version: osInfo.VERSION_ID || 'unknown',
          codename: osInfo.VERSION_CODENAME || osInfo.UBUNTU_CODENAME || 'unknown'
        };
      }

      // Fallback: try lsb_release
      const lsbResult = await this.execInContainer(
        node,
        vmid,
        'lsb_release -a 2>/dev/null'
      );

      if (lsbResult.exitcode === 0) {
        const lines = lsbResult.stdout.split('\n');
        const lsbInfo: any = {};
        
        lines.forEach(line => {
          const [key, value] = line.split(':');
          if (key && value) {
            lsbInfo[key.trim()] = value.trim();
          }
        });

        return {
          distribution: lsbInfo['Distributor ID']?.toLowerCase() || 'unknown',
          version: lsbInfo['Release'] || 'unknown',
          codename: lsbInfo['Codename'] || 'unknown'
        };
      }

      return { distribution: 'unknown', version: 'unknown', codename: 'unknown' };
    } catch (error) {
      this.logger.error(`Failed to get OS info for container ${vmid}: ${error}`);
      return { distribution: 'unknown', version: 'unknown', codename: 'unknown' };
    }
  }

  // File operations in container
  async writeFileInContainer(
    node: string,
    vmid: number,
    filepath: string,
    content: string
  ): Promise<void> {
    // Escape content for shell
    const escapedContent = content
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`');

    const command = `cat > "${filepath}" << 'EOF'
${content}
EOF`;

    const result = await this.execInContainer(node, vmid, command);
    
    if (result.exitcode !== 0) {
      throw new Error(`Failed to write file ${filepath}: ${result.stderr}`);
    }
  }

  async readFileInContainer(
    node: string,
    vmid: number,
    filepath: string
  ): Promise<string> {
    const result = await this.execInContainer(node, vmid, `cat "${filepath}"`);
    
    if (result.exitcode !== 0) {
      throw new Error(`Failed to read file ${filepath}: ${result.stderr}`);
    }
    
    return result.stdout;
  }

  // VM execution using QEMU guest agent
  async execInVM(
    node: string,
    vmid: number,
    command: string,
    timeout: number = 30
  ): Promise<{ exitcode: number; stdout: string; stderr: string }> {
    try {
      // First check if QEMU guest agent is running
      const agentStatus = await this.client.post(`/nodes/${node}/qemu/${vmid}/agent/ping`);
      
      if (!agentStatus.data.data) {
        throw new Error('QEMU guest agent not responding. Ensure qemu-guest-agent is installed and running in the VM.');
      }

      // Execute command via guest agent
      const response = await this.client.post(`/nodes/${node}/qemu/${vmid}/agent/exec`, {
        command: command,
        timeout: timeout
      });

      const pid = response.data.data.pid;

      // Wait for command to complete and get output
      let result;
      const startTime = Date.now();
      
      while (Date.now() - startTime < timeout * 1000) {
        const statusResponse = await this.client.get(
          `/nodes/${node}/qemu/${vmid}/agent/exec-status?pid=${pid}`
        );
        
        result = statusResponse.data.data;
        
        if (result.exited) {
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (!result || !result.exited) {
        throw new Error(`Command timed out after ${timeout} seconds`);
      }

      return {
        exitcode: result.exitcode || 0,
        stdout: result['out-data'] ? Buffer.from(result['out-data'], 'base64').toString() : '',
        stderr: result['err-data'] ? Buffer.from(result['err-data'], 'base64').toString() : ''
      };
    } catch (error: any) {
      this.logger.error(`Failed to execute in VM ${vmid}: ${error.message}`);
      throw error;
    }
  }
}