import { exec } from 'child_process';
import { promisify } from 'util';
import { Express } from 'express';
import { SimpleHttpAgents } from './SimpleHttpAgents';
import axios from 'axios';
import { correlationTracker } from './correlation-tracker';

const execAsync = promisify(exec);

interface ManagerCommand {
  agentName: string;
  action: 'start' | 'stop' | 'restart' | 'status';
  correlationId?: string;
}

export function setupManagerControlEndpoints(app: Express, httpAgents: SimpleHttpAgents) {
  // Control agent managers remotely
  app.post('/api/managers/:agentName/:action', async (req, res) => {
    const { agentName, action } = req.params;
    const agent = httpAgents.getAgent(agentName);
    
    // Generate or use provided correlationId
    const correlationId = req.body?.correlationId || correlationTracker.generateCorrelationId();
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found', correlationId });
    }
    
    // Get agent config from agents-config.json
    const agentConfig = httpAgents.getAgentConfig(agentName);
    if (!agentConfig) {
      return res.status(404).json({ error: 'Agent configuration not found', correlationId });
    }
    
    // Start tracking this execution
    correlationTracker.startExecution(correlationId, `${action}-manager`, agentName);
    
    // Set pending correlationId for agent polling
    if (action === 'start' || action === 'restart') {
      httpAgents.setPendingCorrelationId(agentName, correlationId);
    }
    
    let sshCommand = '';
    try {
      let command: string;
      const serviceName = 'ai-agent-manager';
      
      // Get service manager configuration
      const serviceManagerType = agentConfig.serviceManager || 'systemd';
      const serviceManagers = httpAgents.getServiceManagers();
      const serviceManager = serviceManagers[serviceManagerType];
      
      if (!serviceManager || !serviceManager.commands[action]) {
        return res.status(400).json({ 
          error: `Invalid action or service manager configuration for ${agentName}`,
          correlationId 
        });
      }
      
      // Use service manager template, replacing {service} with actual service name
      command = serviceManager.commands[action].replace('{service}', serviceName);
      
      // For special actions that need correlationId support, modify the command
      if (action === 'start' || action === 'restart') {
        // Add correlationId as environment variable for the command
        command = `CORRELATION_ID="${correlationId}" ${command}`;
      } else if (action === 'stop') {
        // For stop, use wrapper script that can send callback
        if (serviceManagerType === 'systemd') {
          command = `/opt/ai-agent/ai-agent-manager-stop.sh "${correlationId}"`;
        } else if (serviceManagerType === 'rc.d') {
          // For unraid, use rc.d version of the script
          command = `/opt/ai-agent/rc.d/ai-agent-manager-stop.sh "${correlationId}"`;
        } else {
          // Fallback - just add correlationId as environment variable
          command = `CORRELATION_ID="${correlationId}" ${command}`;
        }
      }
      
      // Execute command via SSH
      sshCommand = `ssh -o StrictHostKeyChecking=no ${agentConfig.accessUser || 'root'}@${agent.ip} "${command}"`;
      console.log(`[HUB] Executing manager ${action} for ${agentName} [${correlationId}]: ${command}`);
      correlationTracker.addLog(correlationId, `[HUB] Executing manager ${action} for ${agentName}`);
      correlationTracker.addLog(correlationId, `Command: ${command}`);
      
      const { stdout, stderr } = await execAsync(sshCommand);
      
      // Log the full command for debugging
      correlationTracker.addLog(correlationId, `Full SSH command: ${sshCommand}`);
      
      // Log stdout if present
      if (stdout && stdout.trim()) {
        correlationTracker.addLog(correlationId, `Output: ${stdout.trim()}`);
      } else {
        correlationTracker.addLog(correlationId, `No output from command`);
      }
      
      // Log stderr if present
      if (stderr && stderr.trim()) {
        correlationTracker.addLog(correlationId, `Stderr: ${stderr.trim()}`);
      }
      
      // Log completion - the service scripts will send the actual completion callback
      correlationTracker.addLog(correlationId, `SSH command completed successfully`);
      
      res.json({
        agent: agentName,
        action: action,
        success: true,
        output: stdout.trim(),
        command: command,
        correlationId: correlationId
      });
      
    } catch (error: any) {
      console.error(`[HUB] Manager ${action} failed for ${agentName} [${correlationId}]:`, error.message);
      
      // Log the full SSH command that failed
      correlationTracker.addLog(correlationId, `Full SSH command: ${sshCommand}`);
      
      // Log error details
      correlationTracker.addLog(correlationId, `Error: ${error.message}`);
      if (error.stdout) {
        correlationTracker.addLog(correlationId, `Stdout before failure: ${error.stdout}`);
      }
      if (error.stderr) {
        correlationTracker.addLog(correlationId, `Stderr: ${error.stderr}`);
      }
      
      correlationTracker.failExecution(correlationId, error.message);
      
      res.status(500).json({
        agent: agentName,
        action: action,
        success: false,
        error: error.message,
        stderr: error.stderr,
        correlationId: correlationId
      });
    }
  });
  
  // Get manager status for all agents
  app.get('/api/managers/status', async (req, res) => {
    const agents = httpAgents.getAgents();
    const statuses = [];
    
    for (const agent of agents) {
      const agentConfig = httpAgents.getAgentConfig(agent.name);
      if (!agentConfig) continue;
      
      try {
        // Check if manager is responding
        const managerUrl = `http://${agent.ip}:3081/status`;
        const response = await axios.get(managerUrl, { timeout: 2000 });
        
        if (response.status === 200) {
          const data = response.data;
          statuses.push({
            agent: agent.name,
            managerRunning: true,
            managerVersion: data.managerVersion,
            agentRunning: data.running
          });
        } else {
          statuses.push({
            agent: agent.name,
            managerRunning: false,
            managerVersion: null,
            agentRunning: false
          });
        }
      } catch (error) {
        // Manager not responding
        statuses.push({
          agent: agent.name,
          managerRunning: false,
          managerVersion: null,
          agentRunning: false,
          error: 'Manager not responding'
        });
      }
    }
    
    res.json({ managers: statuses });
  });
  
  // Emergency recovery - start all managers
  app.post('/api/managers/start-all', async (req, res) => {
    const agents = httpAgents.getAgents();
    const results = [];
    
    console.log('[HUB] Starting all agent managers...');
    
    for (const agent of agents) {
      const agentConfig = httpAgents.getAgentConfig(agent.name);
      if (!agentConfig) continue;
      
      try {
        let command: string;
        if (agentConfig.systemType === 'unraid') {
          command = `/etc/rc.d/rc.ai-agent-manager start`;
        } else {
          command = `systemctl start ai-agent-manager`;
        }
        
        const sshCommand = `ssh -o StrictHostKeyChecking=no ${agentConfig.accessUser || 'root'}@${agent.ip} "${command}"`;
        await execAsync(sshCommand);
        
        results.push({
          agent: agent.name,
          success: true,
          message: 'Manager started'
        });
      } catch (error: any) {
        results.push({
          agent: agent.name,
          success: false,
          error: error.message
        });
      }
    }
    
    res.json({ results });
  });
}