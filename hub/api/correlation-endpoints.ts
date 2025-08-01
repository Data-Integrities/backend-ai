import { Express } from 'express';
import { correlationTracker } from './correlation-tracker';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export function setupCorrelationEndpoints(app: Express) {
  // Server-Sent Events endpoint MUST be registered FIRST before parameterized routes
  app.get('/api/executions/stream', (req, res) => {
    console.log('[SSE] Client connected to execution stream');
    
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable nginx buffering
    });

    // Send initial comment to establish connection
    res.write(':ok\n\n');

    const sendUpdate = (execution: any) => {
      res.write(`data: ${JSON.stringify(execution)}\n\n`);
    };

    // Send all current executions
    correlationTracker.getAllExecutions().forEach(execution => {
      sendUpdate(execution);
    });

    // Listen for updates
    const updateHandler = (execution: any) => sendUpdate(execution);
    correlationTracker.on('executionUpdate', updateHandler);

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      res.write(':heartbeat\n\n');
    }, 30000);

    // Cleanup on disconnect
    req.on('close', () => {
      console.log('[SSE] Client disconnected from execution stream');
      clearInterval(heartbeat);
      correlationTracker.off('executionUpdate', updateHandler);
    });
  });

  // Get execution status by correlationId
  app.get('/api/executions/:correlationId', (req, res) => {
    const { correlationId } = req.params;
    const execution = correlationTracker.getExecution(correlationId);
    
    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    
    res.json(execution);
  });

  // Get all recent executions
  app.get('/api/executions', (req, res) => {
    const executions = correlationTracker.getAllExecutions();
    res.json({ executions });
  });

  // Get timeout configuration
  app.get('/api/executions/config/timeouts', (req, res) => {
    const timeoutConfig = correlationTracker.getTimeoutConfig();
    res.json({
      defaultTimeoutMs: timeoutConfig.defaultTimeout,
      managerTimeoutMs: timeoutConfig.managerTimeout,
      defaultTimeoutSeconds: timeoutConfig.defaultTimeout / 1000,
      managerTimeoutSeconds: timeoutConfig.managerTimeout / 1000
    });
  });

  // Mark execution as complete (called by agents/managers)
  app.post('/api/executions/:correlationId/complete', (req, res) => {
    const { correlationId } = req.params;
    const { result } = req.body;
    
    // Log the callback received
    const execution = correlationTracker.getExecution(correlationId);
    if (execution) {
      const duration = Date.now() - execution.startTime;
      const agentInfo = result?.agentId || result?.agentName || 'unknown';
      correlationTracker.addLog(correlationId, `[CALLBACK] Completion callback received from ${agentInfo} (IP: ${req.ip})`);
      correlationTracker.addLog(correlationId, `[CALLBACK] Result: ${JSON.stringify(result)}`);
      correlationTracker.addLog(correlationId, `[CALLBACK] Total duration: ${duration}ms (${(duration/1000).toFixed(1)}s)`);
      
      // Log if agent name is missing
      if (!result?.agentId && !result?.agentName) {
        correlationTracker.addLog(correlationId, `[WARNING] Callback missing agent identification`);
        console.warn(`[CALLBACK] Missing agent name for ${correlationId}:`, result);
      }
    }
    
    correlationTracker.completeExecution(correlationId, result);
    res.json({ success: true });
  });

  // Mark execution as failed
  app.post('/api/executions/:correlationId/fail', (req, res) => {
    const { correlationId } = req.params;
    const { error } = req.body;
    
    // Log the failure callback
    const execution = correlationTracker.getExecution(correlationId);
    if (execution) {
      const duration = Date.now() - execution.startTime;
      correlationTracker.addLog(correlationId, `[CALLBACK] Failure callback received from ${req.ip}`);
      correlationTracker.addLog(correlationId, `[CALLBACK] Error: ${error}`);
      correlationTracker.addLog(correlationId, `[CALLBACK] Failed after: ${duration}ms (${(duration/1000).toFixed(1)}s)`);
    }
    
    correlationTracker.failExecution(correlationId, error);
    res.json({ success: true });
  });

  // Add log entry
  app.post('/api/executions/:correlationId/log', (req, res) => {
    const { correlationId } = req.params;
    const { message } = req.body;
    
    correlationTracker.addLog(correlationId, message);
    res.json({ success: true });
  });

  // Search logs by correlationId
  app.get('/api/logs/:correlationId', async (req, res) => {
    const { correlationId } = req.params;
    const { agent } = req.query;
    
    if (!agent || typeof agent !== 'string') {
      return res.status(400).json({ error: 'Agent parameter required' });
    }

    try {
      // First try using the search script if available
      try {
        const scriptResult = await execAsync(
          `ssh root@${agent} "/opt/ai-agent/agent/scripts/search-logs.sh '${correlationId}'" 2>/dev/null`
        );
        
        if (scriptResult.stdout) {
          const parsedLogs = JSON.parse(scriptResult.stdout);
          return res.json(parsedLogs);
        }
      } catch (scriptError) {
        console.log(`Log search script not available on ${agent}, falling back to direct search`);
      }

      // Fallback to direct log search - optimized to use single SSH connection
      const logs: any = {
        correlationId,
        agent,
        sources: {}
      };

      // Create a single command that gets all log types at once
      const searchCommand = `
        echo "===MANAGER_LOGS_START===";
        grep -n '${correlationId}' /var/log/ai-agent-manager.log 2>/dev/null | tail -50 || echo "No manager logs found";
        echo "===MANAGER_LOGS_END===";
        
        echo "===AGENT_LOGS_START===";
        if [ -d /etc/systemd/system ]; then
          journalctl -u ai-agent --no-pager | grep '${correlationId}' | tail -50 || echo "No agent logs found";
        else
          grep -n '${correlationId}' /var/log/ai-agent.log 2>/dev/null | tail -50 || echo "No agent logs found";
        fi;
        echo "===AGENT_LOGS_END===";
        
        echo "===SYSTEMD_LOGS_START===";
        if [ -d /etc/systemd/system ]; then
          journalctl -u ai-agent-manager --no-pager | grep '${correlationId}' | tail -50 || echo "No systemd logs found";
        else
          # For non-systemd systems, check rc.d service logs
          grep -n '${correlationId}' /var/log/messages 2>/dev/null | grep -E 'ai-agent|ai-agent-manager' | tail -50 || echo "No service logs found";
        fi;
        echo "===SYSTEMD_LOGS_END===";
      `.trim();

      try {
        // Single SSH connection to get all logs
        const allLogs = await execAsync(
          `ssh root@${agent} '${searchCommand}'`
        );
        
        if (allLogs.stdout) {
          const output = allLogs.stdout;
          
          // Parse manager logs
          const managerMatch = output.match(/===MANAGER_LOGS_START===\n([\s\S]*?)\n===MANAGER_LOGS_END===/);
          if (managerMatch && managerMatch[1] !== "No manager logs found") {
            logs.sources.manager = managerMatch[1].split('\n').filter(line => line.trim());
          } else {
            logs.sources.manager = [];
          }
          
          // Parse agent logs
          const agentMatch = output.match(/===AGENT_LOGS_START===\n([\s\S]*?)\n===AGENT_LOGS_END===/);
          if (agentMatch && agentMatch[1] !== "No agent logs found") {
            logs.sources.agent = agentMatch[1].split('\n').filter(line => line.trim());
          } else {
            logs.sources.agent = [];
          }
          
          // Parse systemd/service logs
          const systemdMatch = output.match(/===SYSTEMD_LOGS_START===\n([\s\S]*?)\n===SYSTEMD_LOGS_END===/);
          if (systemdMatch && systemdMatch[1] !== "No systemd logs found" && systemdMatch[1] !== "No service logs found") {
            logs.sources.systemd = systemdMatch[1].split('\n').filter(line => line.trim());
          } else {
            logs.sources.systemd = [];
          }
        }
      } catch (e) {
        console.error(`Failed to retrieve logs from ${agent}:`, e);
        logs.sources.manager = [];
        logs.sources.agent = [];
        logs.sources.systemd = [];
      }

      res.json(logs);
    } catch (error: any) {
      console.error(`Failed to search logs on ${agent} for ${correlationId}:`, error);
      res.status(500).json({ error: error.message });
    }
  });
}