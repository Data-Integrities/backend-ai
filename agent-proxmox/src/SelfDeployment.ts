import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProxmoxAPIWrapper } from './ProxmoxAPIWrapper';
import { Logger } from './Logger';

const execAsync = promisify(exec);

export interface DeploymentConfig {
  targetNode: string;
  agentId?: string;
  hubUrl?: string;
  sshUser?: string;
  sshKey?: string;
  installPath?: string;
}

export class SelfDeployment {
  private proxmoxAPI: ProxmoxAPIWrapper;
  private logger: Logger;

  constructor(proxmoxAPI: ProxmoxAPIWrapper, logger: Logger) {
    this.proxmoxAPI = proxmoxAPI;
    this.logger = logger;
  }

  async deployToNode(config: DeploymentConfig): Promise<string> {
    const {
      targetNode,
      agentId = `proxmox-agent-${targetNode}`,
      hubUrl = process.env.HUB_URL,
      sshUser = 'root',
      installPath = '/opt/proxmox-ai-agent'
    } = config;

    this.logger.info(`Starting self-deployment to node ${targetNode}`);

    try {
      // 1. Verify target node exists and is online
      await this.validateTargetNode(targetNode);

      // 2. Create deployment package
      const packagePath = await this.createDeploymentPackage();

      // 3. Copy package to target node
      await this.copyPackageToNode(targetNode, packagePath, sshUser);

      // 4. Install on target node
      await this.installOnNode(targetNode, agentId, hubUrl!, sshUser, installPath);

      // 5. Verify installation
      await this.verifyInstallation(targetNode, sshUser);

      // 6. Cleanup
      await fs.unlink(packagePath);

      return `Successfully deployed Proxmox AI agent to node ${targetNode} with ID: ${agentId}`;

    } catch (error) {
      this.logger.error(`Deployment to ${targetNode} failed`, error);
      throw error;
    }
  }

  async deployToAllNodes(excludeCurrent: boolean = true): Promise<string[]> {
    const nodes = await this.proxmoxAPI.getNodes();
    const currentNode = process.env.HOSTNAME || 'unknown';
    const results: string[] = [];

    for (const node of nodes) {
      if (excludeCurrent && node.node === currentNode) {
        this.logger.info(`Skipping current node: ${node.node}`);
        continue;
      }

      if (node.status !== 'online') {
        this.logger.warn(`Skipping offline node: ${node.node}`);
        results.push(`❌ ${node.node}: Node offline`);
        continue;
      }

      try {
        const result = await this.deployToNode({
          targetNode: node.node,
          agentId: `proxmox-agent-${node.node}`
        });
        results.push(`✅ ${node.node}: ${result}`);
      } catch (error) {
        results.push(`❌ ${node.node}: ${error}`);
      }
    }

    return results;
  }

  private async validateTargetNode(targetNode: string): Promise<void> {
    const nodes = await this.proxmoxAPI.getNodes();
    const node = nodes.find(n => n.node === targetNode);

    if (!node) {
      throw new Error(`Node ${targetNode} not found in cluster`);
    }

    if (node.status !== 'online') {
      throw new Error(`Node ${targetNode} is offline`);
    }

    this.logger.info(`Target node ${targetNode} validated and online`);
  }

  private async createDeploymentPackage(): Promise<string> {
    const packageDir = '/tmp/proxmox-agent-deploy';
    const packagePath = `/tmp/proxmox-agent-${Date.now()}.tar.gz`;

    // Create temporary directory
    await execAsync(`mkdir -p ${packageDir}`);

    try {
      // Copy essential files
      const currentDir = process.cwd();
      
      await execAsync(`cp -r ${currentDir}/dist ${packageDir}/`);
      await execAsync(`cp ${currentDir}/package.json ${packageDir}/`);
      await execAsync(`cp ${currentDir}/install-proxmox-agent.sh ${packageDir}/`);
      await execAsync(`cp ${currentDir}/.env.example ${packageDir}/`);

      // Create a simplified package.json for remote installation
      const simplifiedPackage = {
        name: "@proxmox-ai-control/agent-proxmox",
        version: "1.0.0",
        main: "dist/index.js",
        dependencies: {
          "@proxmox-ai-control/shared": "file:../shared",
          "axios": "^1.6.0",
          "dotenv": "^16.0.0",
          "node-cron": "^3.0.0",
          "systeminformation": "^5.21.0",
          "winston": "^3.11.0",
          "ws": "^8.16.0"
        }
      };

      await fs.writeFile(
        path.join(packageDir, 'package.json'),
        JSON.stringify(simplifiedPackage, null, 2)
      );

      // Create installation script with embedded shared library
      await this.createEmbeddedInstaller(packageDir);

      // Create tar package
      await execAsync(`cd /tmp && tar -czf ${packagePath} -C ${packageDir} .`);

      this.logger.info(`Created deployment package: ${packagePath}`);
      return packagePath;

    } finally {
      // Clean up temp directory
      await execAsync(`rm -rf ${packageDir}`);
    }
  }

  private async createEmbeddedInstaller(packageDir: string): Promise<void> {
    const installerScript = `#!/bin/bash
set -e

echo "🤖 Proxmox AI Agent Remote Installation"
echo "======================================"

# Get parameters
AGENT_ID=\${1:-"proxmox-agent-\$(hostname)"}
HUB_URL=\${2:-"ws://\$(hostname -I | awk '{print \$1}'):3001"}
INSTALL_DIR=\${3:-"/opt/proxmox-ai-agent"}

echo "Agent ID: \$AGENT_ID"
echo "Hub URL: \$HUB_URL"
echo "Install Dir: \$INSTALL_DIR"

# Create directories
mkdir -p "\$INSTALL_DIR"
mkdir -p "/etc/proxmox-ai-agent"
mkdir -p "/var/log/proxmox-ai-agent"

# Copy files
cp -r dist/* "\$INSTALL_DIR/"
cp package.json "\$INSTALL_DIR/"

# Install Node.js if needed
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Install dependencies
cd "\$INSTALL_DIR"
npm install --production

# Create embedded shared library
mkdir -p node_modules/@proxmox-ai-control
cat > node_modules/@proxmox-ai-control/shared.js << 'SHARED_LIB_EOF'
// Embedded shared library
export var MessageType;
(function (MessageType) {
    MessageType["COMMAND_REQUEST"] = "command_request";
    MessageType["COMMAND_RESULT"] = "command_result";
    MessageType["AGENT_REGISTER"] = "agent_register";
    MessageType["AGENT_HEARTBEAT"] = "agent_heartbeat";
    MessageType["EVENT_NOTIFICATION"] = "event_notification";
    MessageType["HEALTH_CHECK"] = "health_check";
    MessageType["CONFIG_UPDATE"] = "config_update";
    MessageType["AUTH_REQUEST"] = "auth_request";
    MessageType["AUTH_RESPONSE"] = "auth_response";
    MessageType["ERROR"] = "error";
})(MessageType || (MessageType = {}));

export var CommandCategory;
(function (CommandCategory) {
    CommandCategory["SERVICE"] = "service";
    CommandCategory["CONFIG"] = "config";
    CommandCategory["DEBUG"] = "debug";
    CommandCategory["SYSTEM"] = "system";
    CommandCategory["NETWORK"] = "network";
    CommandCategory["FILE"] = "file";
    CommandCategory["PROCESS"] = "process";
    CommandCategory["CONTAINER"] = "container";
})(CommandCategory || (CommandCategory = {}));

export var CommandRisk;
(function (CommandRisk) {
    CommandRisk["LOW"] = "low";
    CommandRisk["MEDIUM"] = "medium";
    CommandRisk["HIGH"] = "high";
    CommandRisk["CRITICAL"] = "critical";
})(CommandRisk || (CommandRisk = {}));
SHARED_LIB_EOF

# Create configuration
cat > /etc/proxmox-ai-agent/agent.env << ENV_EOF
AGENT_ID=\$AGENT_ID
HUB_URL=\$HUB_URL
PROXMOX_HOST=\$(hostname -I | awk '{print \$1}')
PROXMOX_USER=root@pam
PROXMOX_PASSWORD=\${PROXMOX_PASSWORD:-""}
LOG_DIR=/var/log/proxmox-ai-agent
LOG_LEVEL=info
NODE_ENV=production
ENV_EOF

# Create systemd service
cat > /etc/systemd/system/proxmox-ai-agent.service << SERVICE_EOF
[Unit]
Description=Proxmox AI Control Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=\$INSTALL_DIR
EnvironmentFile=/etc/proxmox-ai-agent/agent.env
ExecStart=/usr/bin/node \$INSTALL_DIR/index.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/proxmox-ai-agent/agent.log
StandardError=append:/var/log/proxmox-ai-agent/agent.error.log

[Install]
WantedBy=multi-user.target
SERVICE_EOF

# Enable service
systemctl daemon-reload
systemctl enable proxmox-ai-agent

echo "✅ Proxmox AI Agent installed successfully!"
echo "To start: systemctl start proxmox-ai-agent"
echo "To configure Proxmox password: edit /etc/proxmox-ai-agent/agent.env"
`;

    await fs.writeFile(path.join(packageDir, 'remote-install.sh'), installerScript);
    await execAsync(`chmod +x ${packageDir}/remote-install.sh`);
  }

  private async copyPackageToNode(
    targetNode: string,
    packagePath: string,
    sshUser: string
  ): Promise<void> {
    this.logger.info(`Copying package to node ${targetNode}`);

    try {
      // Copy package to target node
      await execAsync(`scp -o StrictHostKeyChecking=no ${packagePath} ${sshUser}@${targetNode}:/tmp/`);
      
      const packageName = path.basename(packagePath);
      
      // Extract package on target node
      await execAsync(`ssh -o StrictHostKeyChecking=no ${sshUser}@${targetNode} "cd /tmp && tar -xzf ${packageName}"`);
      
      this.logger.info(`Package copied and extracted on ${targetNode}`);
    } catch (error) {
      throw new Error(`Failed to copy package to ${targetNode}: ${error}`);
    }
  }

  private async installOnNode(
    targetNode: string,
    agentId: string,
    hubUrl: string,
    sshUser: string,
    installPath: string
  ): Promise<void> {
    this.logger.info(`Installing agent on node ${targetNode}`);

    try {
      // Run installation script on target node
      const installCommand = `ssh -o StrictHostKeyChecking=no ${sshUser}@${targetNode} "cd /tmp && chmod +x remote-install.sh && ./remote-install.sh '${agentId}' '${hubUrl}' '${installPath}'"`;
      
      const { stdout, stderr } = await execAsync(installCommand);
      
      if (stderr && !stderr.includes('Warning')) {
        this.logger.warn(`Installation warnings on ${targetNode}: ${stderr}`);
      }
      
      this.logger.info(`Installation completed on ${targetNode}`);
    } catch (error) {
      throw new Error(`Installation failed on ${targetNode}: ${error}`);
    }
  }

  private async verifyInstallation(targetNode: string, sshUser: string): Promise<void> {
    this.logger.info(`Verifying installation on node ${targetNode}`);

    try {
      // Start the service
      await execAsync(`ssh -o StrictHostKeyChecking=no ${sshUser}@${targetNode} "systemctl start proxmox-ai-agent"`);
      
      // Wait a moment for startup
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check if service is running
      const { stdout } = await execAsync(`ssh -o StrictHostKeyChecking=no ${sshUser}@${targetNode} "systemctl is-active proxmox-ai-agent"`);
      
      if (stdout.trim() !== 'active') {
        throw new Error(`Service not active on ${targetNode}: ${stdout}`);
      }
      
      this.logger.info(`Installation verified on ${targetNode} - service is running`);
    } catch (error) {
      throw new Error(`Installation verification failed on ${targetNode}: ${error}`);
    }
  }

  // Convenience method to update Proxmox password on all nodes
  async updateProxmoxPasswordOnAllNodes(newPassword: string): Promise<string[]> {
    const nodes = await this.proxmoxAPI.getNodes();
    const results: string[] = [];

    for (const node of nodes) {
      try {
        await execAsync(`ssh -o StrictHostKeyChecking=no root@${node.node} "sed -i 's/PROXMOX_PASSWORD=.*/PROXMOX_PASSWORD=${newPassword}/' /etc/proxmox-ai-agent/agent.env && systemctl restart proxmox-ai-agent"`);
        results.push(`✅ ${node.node}: Password updated and service restarted`);
      } catch (error) {
        results.push(`❌ ${node.node}: Failed to update password - ${error}`);
      }
    }

    return results;
  }

  // Method to check agent status on all nodes
  async checkAgentStatusOnAllNodes(): Promise<string[]> {
    const nodes = await this.proxmoxAPI.getNodes();
    const results: string[] = [];

    for (const node of nodes) {
      try {
        const { stdout } = await execAsync(`ssh -o StrictHostKeyChecking=no root@${node.node} "systemctl is-active proxmox-ai-agent 2>/dev/null || echo 'not-installed'"`);
        
        const status = stdout.trim();
        const icon = status === 'active' ? '🟢' : status === 'inactive' ? '🟡' : '🔴';
        results.push(`${icon} ${node.node}: ${status}`);
      } catch (error) {
        results.push(`🔴 ${node.node}: Error checking status`);
      }
    }

    return results;
  }

  // Deploy to Container
  async deployToContainer(
    node: string,
    vmid: number,
    config?: {
      agentId?: string;
      hubUrl?: string;
      installPath?: string;
    }
  ): Promise<string> {
    const {
      agentId = `linux-agent-ct${vmid}`,
      hubUrl = process.env.HUB_URL || `ws://${node}:3001`,
      installPath = '/opt/ai-agent'
    } = config || {};

    this.logger.info(`Starting deployment to container ${vmid} on node ${node}`);

    try {
      // 1. Check if container is running
      const containerStatus = await this.proxmoxAPI.getVMStatus(node, vmid, 'lxc');
      if (containerStatus.status !== 'running') {
        throw new Error(`Container ${vmid} is not running`);
      }

      // 2. Get OS information
      const osInfo = await this.proxmoxAPI.getContainerOSInfo(node, vmid);
      this.logger.info(`Container OS: ${osInfo.distribution} ${osInfo.version}`);

      // 3. Check required tools
      const tools = await this.proxmoxAPI.checkContainerTools(node, vmid);
      
      // 4. Install Node.js if needed
      await this.installNodeInContainer(node, vmid, osInfo, tools);

      // 5. Create agent directory
      await this.proxmoxAPI.execInContainer(node, vmid, `mkdir -p ${installPath}`);
      await this.proxmoxAPI.execInContainer(node, vmid, `mkdir -p /etc/ai-agent`);
      await this.proxmoxAPI.execInContainer(node, vmid, `mkdir -p /var/log/ai-agent`);

      // 6. Deploy agent files
      await this.deployAgentFilesToContainer(node, vmid, installPath);

      // 7. Create configuration
      const envConfig = `AGENT_ID=${agentId}
HUB_URL=${hubUrl}
LOG_DIR=/var/log/ai-agent
LOG_LEVEL=info
NODE_ENV=production
`;
      await this.proxmoxAPI.writeFileInContainer(node, vmid, '/etc/ai-agent/agent.env', envConfig);

      // 8. Install dependencies
      await this.proxmoxAPI.execInContainer(node, vmid, `cd ${installPath} && npm install --production`);

      // 9. Create and enable service
      await this.createContainerService(node, vmid, installPath, tools.systemd);

      // 10. Start the agent
      if (tools.systemd) {
        await this.proxmoxAPI.execInContainer(node, vmid, 'systemctl start ai-agent');
      } else {
        // Use supervisor or init script for non-systemd containers
        await this.createInitScript(node, vmid, installPath);
      }

      return `✅ Successfully deployed Linux AI agent to container ${vmid} (${containerStatus.name}) with ID: ${agentId}`;

    } catch (error) {
      this.logger.error(`Deployment to container ${vmid} failed`, error);
      throw error;
    }
  }

  // Deploy to VM
  async deployToVM(
    node: string,
    vmid: number,
    config?: {
      agentId?: string;
      hubUrl?: string;
      installPath?: string;
    }
  ): Promise<string> {
    const {
      agentId = `linux-agent-vm${vmid}`,
      hubUrl = process.env.HUB_URL || `ws://${node}:3001`,
      installPath = '/opt/ai-agent'
    } = config || {};

    this.logger.info(`Starting deployment to VM ${vmid} on node ${node}`);

    try {
      // 1. Check if VM is running and has guest agent
      const vmStatus = await this.proxmoxAPI.getVMStatus(node, vmid, 'qemu');
      if (vmStatus.status !== 'running') {
        throw new Error(`VM ${vmid} is not running`);
      }

      // 2. Test QEMU guest agent
      try {
        await this.proxmoxAPI.execInVM(node, vmid, 'echo "Guest agent test"');
      } catch (error) {
        throw new Error(`QEMU guest agent not available. Please install qemu-guest-agent in the VM.`);
      }

      // 3. Get OS information (similar approach)
      const osInfoCmd = 'cat /etc/os-release 2>/dev/null || cat /usr/lib/os-release 2>/dev/null';
      const osResult = await this.proxmoxAPI.execInVM(node, vmid, osInfoCmd);
      
      const osInfo = this.parseOSInfo(osResult.stdout);
      this.logger.info(`VM OS: ${osInfo.distribution} ${osInfo.version}`);

      // 4. Check for required tools and install Node.js
      await this.installNodeInVM(node, vmid, osInfo);

      // 5. Create directories
      await this.proxmoxAPI.execInVM(node, vmid, `mkdir -p ${installPath}`);
      await this.proxmoxAPI.execInVM(node, vmid, `mkdir -p /etc/ai-agent`);
      await this.proxmoxAPI.execInVM(node, vmid, `mkdir -p /var/log/ai-agent`);

      // 6. Deploy agent files (need to transfer via base64 encoding)
      await this.deployAgentFilesToVM(node, vmid, installPath);

      // 7. Create configuration
      const envConfig = `AGENT_ID=${agentId}
HUB_URL=${hubUrl}
LOG_DIR=/var/log/ai-agent
LOG_LEVEL=info
NODE_ENV=production
`;
      await this.writeFileToVM(node, vmid, '/etc/ai-agent/agent.env', envConfig);

      // 8. Install dependencies
      await this.proxmoxAPI.execInVM(node, vmid, `cd ${installPath} && npm install --production`);

      // 9. Create systemd service
      await this.createVMService(node, vmid, installPath);

      // 10. Start the agent
      await this.proxmoxAPI.execInVM(node, vmid, 'systemctl daemon-reload && systemctl enable ai-agent && systemctl start ai-agent');

      return `✅ Successfully deployed Linux AI agent to VM ${vmid} (${vmStatus.name}) with ID: ${agentId}`;

    } catch (error) {
      this.logger.error(`Deployment to VM ${vmid} failed`, error);
      throw error;
    }
  }

  // Deploy to all containers with specific tag
  async deployToContainersByTag(tag: string): Promise<string[]> {
    const containers = await this.proxmoxAPI.getVMsByTag(tag);
    const results: string[] = [];

    for (const container of containers) {
      if (container.type !== 'lxc') continue;
      
      try {
        const result = await this.deployToContainer(container.node, container.vmid);
        results.push(result);
      } catch (error) {
        results.push(`❌ Container ${container.vmid} (${container.name}): ${error}`);
      }
    }

    return results;
  }

  // Helper methods for container deployment
  private async installNodeInContainer(
    node: string,
    vmid: number,
    osInfo: { distribution: string; version: string },
    tools: { curl: boolean; wget: boolean }
  ): Promise<void> {
    // Check if Node.js is already installed
    const nodeCheck = await this.proxmoxAPI.execInContainer(node, vmid, 'which node');
    if (nodeCheck.exitcode === 0) {
      this.logger.info('Node.js already installed in container');
      return;
    }

    this.logger.info('Installing Node.js in container...');

    if (osInfo.distribution === 'ubuntu' || osInfo.distribution === 'debian') {
      // Use NodeSource repository
      const setupScript = tools.curl 
        ? 'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -'
        : 'wget -qO- https://deb.nodesource.com/setup_20.x | bash -';
      
      await this.proxmoxAPI.execInContainer(node, vmid, setupScript);
      await this.proxmoxAPI.execInContainer(node, vmid, 'apt-get install -y nodejs');
    } else if (osInfo.distribution === 'alpine') {
      await this.proxmoxAPI.execInContainer(node, vmid, 'apk add --no-cache nodejs npm');
    } else if (osInfo.distribution === 'centos' || osInfo.distribution === 'rhel') {
      await this.proxmoxAPI.execInContainer(node, vmid, 'dnf module install -y nodejs:20');
    }
  }

  private async deployAgentFilesToContainer(
    node: string,
    vmid: number,
    installPath: string
  ): Promise<void> {
    // Read the Linux agent files from the local system
    const agentPath = path.join(__dirname, '../../agent');
    
    // Read and transfer the main agent file
    const indexContent = await fs.readFile(path.join(agentPath, 'dist/index.js'), 'utf-8');
    await this.proxmoxAPI.writeFileInContainer(node, vmid, `${installPath}/index.js`, indexContent);

    // Create a minimal package.json
    const packageJson = {
      name: "@backend-ai/linux-agent",
      version: "1.0.0",
      main: "index.js",
      dependencies: {
        "ws": "^8.16.0",
        "winston": "^3.11.0",
        "systeminformation": "^5.21.0",
        "dotenv": "^16.0.0"
      }
    };
    
    await this.proxmoxAPI.writeFileInContainer(
      node, 
      vmid, 
      `${installPath}/package.json`, 
      JSON.stringify(packageJson, null, 2)
    );
  }

  private async createContainerService(
    node: string,
    vmid: number,
    installPath: string,
    hasSystemd: boolean
  ): Promise<void> {
    if (hasSystemd) {
      const serviceContent = `[Unit]
Description=AI Control Linux Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${installPath}
EnvironmentFile=/etc/ai-agent/agent.env
ExecStart=/usr/bin/node ${installPath}/index.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/ai-agent/agent.log
StandardError=append:/var/log/ai-agent/agent.error.log

[Install]
WantedBy=multi-user.target
`;
      
      await this.proxmoxAPI.writeFileInContainer(node, vmid, '/etc/systemd/system/ai-agent.service', serviceContent);
      await this.proxmoxAPI.execInContainer(node, vmid, 'systemctl daemon-reload');
      await this.proxmoxAPI.execInContainer(node, vmid, 'systemctl enable ai-agent');
    }
  }

  private async createInitScript(
    node: string,
    vmid: number,
    installPath: string
  ): Promise<void> {
    // For non-systemd containers, create a simple init script
    const initScript = `#!/bin/sh
# AI Agent init script
case "$1" in
  start)
    echo "Starting AI Agent..."
    cd ${installPath}
    nohup /usr/bin/node index.js > /var/log/ai-agent/agent.log 2>&1 &
    echo $! > /var/run/ai-agent.pid
    ;;
  stop)
    echo "Stopping AI Agent..."
    kill $(cat /var/run/ai-agent.pid)
    rm /var/run/ai-agent.pid
    ;;
  *)
    echo "Usage: $0 {start|stop}"
    exit 1
esac
`;
    
    await this.proxmoxAPI.writeFileInContainer(node, vmid, '/etc/init.d/ai-agent', initScript);
    await this.proxmoxAPI.execInContainer(node, vmid, 'chmod +x /etc/init.d/ai-agent');
    await this.proxmoxAPI.execInContainer(node, vmid, '/etc/init.d/ai-agent start');
  }

  // Helper methods for VM deployment
  private async installNodeInVM(
    node: string,
    vmid: number,
    osInfo: { distribution: string; version: string }
  ): Promise<void> {
    // Check if Node.js is already installed
    const nodeCheck = await this.proxmoxAPI.execInVM(node, vmid, 'which node');
    if (nodeCheck.exitcode === 0) {
      this.logger.info('Node.js already installed in VM');
      return;
    }

    this.logger.info('Installing Node.js in VM...');

    if (osInfo.distribution === 'ubuntu' || osInfo.distribution === 'debian') {
      await this.proxmoxAPI.execInVM(node, vmid, 'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -');
      await this.proxmoxAPI.execInVM(node, vmid, 'sudo apt-get install -y nodejs');
    } else if (osInfo.distribution === 'centos' || osInfo.distribution === 'rhel') {
      await this.proxmoxAPI.execInVM(node, vmid, 'sudo dnf module install -y nodejs:20');
    }
  }

  private async deployAgentFilesToVM(
    node: string,
    vmid: number,
    installPath: string
  ): Promise<void> {
    // Similar to container deployment but using execInVM
    const agentPath = path.join(__dirname, '../../agent');
    
    // Read the agent file and encode it for transfer
    const indexContent = await fs.readFile(path.join(agentPath, 'dist/index.js'), 'utf-8');
    const encodedContent = Buffer.from(indexContent).toString('base64');
    
    // Transfer via base64 decoding
    await this.proxmoxAPI.execInVM(
      node, 
      vmid, 
      `echo "${encodedContent}" | base64 -d > ${installPath}/index.js`
    );

    // Create package.json
    const packageJson = {
      name: "@backend-ai/linux-agent",
      version: "1.0.0",
      main: "index.js",
      dependencies: {
        "ws": "^8.16.0",
        "winston": "^3.11.0",
        "systeminformation": "^5.21.0",
        "dotenv": "^16.0.0"
      }
    };
    
    await this.writeFileToVM(
      node,
      vmid,
      `${installPath}/package.json`,
      JSON.stringify(packageJson, null, 2)
    );
  }

  private async createVMService(
    node: string,
    vmid: number,
    installPath: string
  ): Promise<void> {
    const serviceContent = `[Unit]
Description=AI Control Linux Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${installPath}
EnvironmentFile=/etc/ai-agent/agent.env
ExecStart=/usr/bin/node ${installPath}/index.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/ai-agent/agent.log
StandardError=append:/var/log/ai-agent/agent.error.log

[Install]
WantedBy=multi-user.target
`;
    
    await this.writeFileToVM(node, vmid, '/etc/systemd/system/ai-agent.service', serviceContent);
  }

  private async writeFileToVM(
    node: string,
    vmid: number,
    filepath: string,
    content: string
  ): Promise<void> {
    // For VMs, we need to be more careful with escaping
    const encodedContent = Buffer.from(content).toString('base64');
    await this.proxmoxAPI.execInVM(
      node,
      vmid,
      `echo "${encodedContent}" | base64 -d > ${filepath}`
    );
  }

  private parseOSInfo(osReleaseContent: string): { distribution: string; version: string } {
    const lines = osReleaseContent.split('\n');
    const osInfo: any = {};
    
    lines.forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        osInfo[key] = value.replace(/"/g, '');
      }
    });

    return {
      distribution: osInfo.ID || 'unknown',
      version: osInfo.VERSION_ID || 'unknown'
    };
  }
}