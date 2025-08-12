import { Express } from 'express';
import { correlationTracker } from './correlation-tracker';
import axios from 'axios';
import { SimpleHttpAgents } from './SimpleHttpAgents';

export function setupMultiAgentEndpoints(app: Express, httpAgents: SimpleHttpAgents) {
  // Multi-agent start operation
  app.post('/api/agents/multi/start', async (req, res) => {
    const { agents, parentCorrelationId } = req.body;
    
    if (!agents || !Array.isArray(agents) || agents.length === 0) {
      return res.status(400).json({ error: 'agents array is required' });
    }
    
    if (!parentCorrelationId) {
      return res.status(400).json({ error: 'parentCorrelationId is required' });
    }
    
    console.log(`[MULTI-AGENT] Starting multi-agent start operation with parent ${parentCorrelationId}`);
    
    // Start parent execution tracking
    correlationTracker.startExecution(parentCorrelationId, 'start-all', 'multi-agent', 'start-all');
    
    // Start all child operations
    const childPromises = agents.map(async (agentName: string) => {
      const agent = httpAgents.getAgent(agentName);
      if (!agent) {
        return {
          agentName,
          success: false,
          error: 'Agent not found'
        };
      }
      
      // Generate child correlationId
      const childCorrelationId = correlationTracker.generateCorrelationId();
      
      // Start child execution with parentId
      correlationTracker.startExecution(childCorrelationId, 'start-agent', agentName, 'start-agent', parentCorrelationId);
      httpAgents.setPendingCorrelationId(agentName, childCorrelationId);
      
      try {
        // Call agent manager
        correlationTracker.addLog(childCorrelationId, `Calling manager API at http://${agent.ip}:3081/start`);
        const response = await axios.post(`http://${agent.ip}:3081/start`, {
          correlationId: childCorrelationId
        });
        
        correlationTracker.addLog(childCorrelationId, `Manager responded: ${response.data.success ? 'Success' : 'Failed'}`);
        if (response.data.output) {
          correlationTracker.addLog(childCorrelationId, `Manager output: ${response.data.output}`);
        }
        
        return {
          agentName,
          correlationId: childCorrelationId,
          success: true,
          ...response.data
        };
      } catch (error: any) {
        correlationTracker.addLog(childCorrelationId, `Error calling manager: ${error.message}`);
        correlationTracker.failExecution(childCorrelationId, error.message);
        return {
          agentName,
          correlationId: childCorrelationId,
          success: false,
          error: error.message
        };
      }
    });
    
    // Return immediately with accepted status
    res.status(202).json({
      parentCorrelationId,
      message: 'Multi-agent start operation initiated',
      agents: agents
    });
    
    // Don't wait for completion - parent will be updated automatically
    Promise.all(childPromises).then(results => {
      console.log(`[MULTI-AGENT] All child operations initiated for parent ${parentCorrelationId}`);
    });
  });
  
  // Multi-agent stop operation
  app.post('/api/agents/multi/stop', async (req, res) => {
    const { agents, parentCorrelationId } = req.body;
    
    if (!agents || !Array.isArray(agents) || agents.length === 0) {
      return res.status(400).json({ error: 'agents array is required' });
    }
    
    if (!parentCorrelationId) {
      return res.status(400).json({ error: 'parentCorrelationId is required' });
    }
    
    console.log(`[MULTI-AGENT] Starting multi-agent stop operation with parent ${parentCorrelationId}`);
    
    // Start parent execution tracking
    correlationTracker.startExecution(parentCorrelationId, 'stop-all', 'multi-agent', 'stop-all');
    
    // Stop all child operations
    const childPromises = agents.map(async (agentName: string) => {
      const agent = httpAgents.getAgent(agentName);
      if (!agent) {
        return {
          agentName,
          success: false,
          error: 'Agent not found'
        };
      }
      
      // Generate child correlationId
      const childCorrelationId = correlationTracker.generateCorrelationId();
      
      // Start child execution with parentId
      correlationTracker.startExecution(childCorrelationId, 'stop-agent', agentName, 'stop-agent', parentCorrelationId);
      httpAgents.setPendingCorrelationId(agentName, childCorrelationId);
      
      try {
        // Call agent manager
        correlationTracker.addLog(childCorrelationId, `Calling manager API at http://${agent.ip}:3081/stop`);
        const response = await axios.post(`http://${agent.ip}:3081/stop`, {
          correlationId: childCorrelationId
        });
        
        correlationTracker.addLog(childCorrelationId, `Manager responded: ${response.data.success ? 'Success' : 'Failed'}`);
        if (response.data.output) {
          correlationTracker.addLog(childCorrelationId, `Manager output: ${response.data.output}`);
        }
        
        return {
          agentName,
          correlationId: childCorrelationId,
          success: true,
          ...response.data
        };
      } catch (error: any) {
        correlationTracker.addLog(childCorrelationId, `Error calling manager: ${error.message}`);
        correlationTracker.failExecution(childCorrelationId, error.message);
        return {
          agentName,
          correlationId: childCorrelationId,
          success: false,
          error: error.message
        };
      }
    });
    
    // Return immediately with accepted status
    res.status(202).json({
      parentCorrelationId,
      message: 'Multi-agent stop operation initiated',
      agents: agents
    });
    
    // Don't wait for completion - parent will be updated automatically
    Promise.all(childPromises).then(results => {
      console.log(`[MULTI-AGENT] All child operations initiated for parent ${parentCorrelationId}`);
    });
  });
  
  // Multi-agent manager operations (start/stop managers)
  app.post('/api/agents/multi/start-managers', async (req, res) => {
    const { agents, parentCorrelationId } = req.body;
    
    if (!agents || !Array.isArray(agents) || agents.length === 0) {
      return res.status(400).json({ error: 'agents array is required' });
    }
    
    if (!parentCorrelationId) {
      return res.status(400).json({ error: 'parentCorrelationId is required' });
    }
    
    console.log(`[MULTI-AGENT] Starting multi-agent start-managers operation with parent ${parentCorrelationId}`);
    
    // Start parent execution tracking
    correlationTracker.startExecution(parentCorrelationId, 'start-all-managers', 'multi-agent', 'start-all-managers');
    
    // Implementation would follow similar pattern to start/stop
    // For now, return accepted status
    res.status(202).json({
      parentCorrelationId,
      message: 'Multi-agent start-managers operation initiated',
      agents: agents
    });
  });
  
  app.post('/api/agents/multi/stop-managers', async (req, res) => {
    const { agents, parentCorrelationId } = req.body;
    
    if (!agents || !Array.isArray(agents) || agents.length === 0) {
      return res.status(400).json({ error: 'agents array is required' });
    }
    
    if (!parentCorrelationId) {
      return res.status(400).json({ error: 'parentCorrelationId is required' });
    }
    
    console.log(`[MULTI-AGENT] Starting multi-agent stop-managers operation with parent ${parentCorrelationId}`);
    
    // Start parent execution tracking
    correlationTracker.startExecution(parentCorrelationId, 'stop-all-managers', 'multi-agent', 'stop-all-managers');
    
    // Implementation would follow similar pattern to start/stop
    // For now, return accepted status
    res.status(202).json({
      parentCorrelationId,
      message: 'Multi-agent stop-managers operation initiated',
      agents: agents
    });
  });
}