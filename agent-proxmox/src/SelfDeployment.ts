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
}