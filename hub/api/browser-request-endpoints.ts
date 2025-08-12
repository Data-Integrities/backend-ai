import { Express, Request, Response } from 'express';
import { browserRequestQueue } from './browser-request-queue';

export function setupBrowserRequestEndpoints(app: Express): void {
  
  // Queue a request for browser (GET version for avoiding permission issues)
  app.get('/api/browser-requests/queue', async (req: Request, res: Response) => {
    try {
      const { tabId, type, action, ...params } = req.query;
      
      if (!type || !action) {
        return res.status(400).json({ error: 'type and action are required' });
      }
      
      // Remove system query params and use the rest as action params
      const actionParams: any = {};
      Object.keys(params).forEach(key => {
        if (key !== 'wait') {
          actionParams[key] = params[key];
        }
      });
      
      const requestId = await browserRequestQueue.queueRequest((tabId as string) || 'any', {
        type: type as 'data' | 'control',
        action: action as string,
        params: actionParams
      });
      
      // If wait=true, wait for response
      if (req.query.wait === 'true') {
        const response = await browserRequestQueue.waitForResponse(requestId);
        if (response.error) {
          res.status(400).json({ error: response.error });
        } else {
          res.json(response.response);
        }
      } else {
        res.json({ 
          requestId, 
          status: 'queued',
          message: `Request queued for ${tabId || 'any tab'}`
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Queue a request for browser (POST version)
  app.post('/api/browser-requests', async (req: Request, res: Response) => {
    try {
      const { tabId, type, action, params } = req.body;
      
      if (!type || !action) {
        return res.status(400).json({ error: 'type and action are required' });
      }
      
      const requestId = await browserRequestQueue.queueRequest(tabId || 'any', {
        type,
        action,
        params: params || {}
      });
      
      res.json({ 
        requestId, 
        status: 'queued',
        message: `Request queued for ${tabId || 'any tab'}`
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get pending requests for a tab
  app.get('/api/browser-requests/pending/:tabId', (req: Request, res: Response) => {
    const { tabId } = req.params;
    
    // Update tab activity in registry (auto-registers if not found)
    const { getTabRegistry } = require('./tab-registry');
    const tabRegistry = getTabRegistry();
    
    // Check if tab exists, if not it will auto-register and request refresh
    const existingTab = tabRegistry.getTab(tabId);
    if (!existingTab) {
      console.log(`[BrowserRequest] Auto-registering tab from polling: ${tabId}`);
      tabRegistry.register(tabId, req.headers['user-agent'] as string);
      
      // Queue a refresh command for this newly discovered tab
      // This ensures the browser gets the latest hub version after hub restart
      console.log(`[BrowserRequest] Queueing refresh for auto-registered tab: ${tabId}`);
      browserRequestQueue.queueRequest(tabId, {
        type: 'control',
        action: 'refreshBrowser',
        params: { 
          delay: 500,
          reason: 'Auto-registered after hub restart - refreshing to sync versions'
        }
      });
    } else {
      tabRegistry.updateActivity(tabId);
    }
    
    const requests = browserRequestQueue.getPendingRequests(tabId);
    res.json({ requests });
  });
  
  // Submit response for a request
  app.post('/api/browser-requests/:requestId/response', (req: Request, res: Response) => {
    const { requestId } = req.params;
    const { response, error } = req.body;
    
    browserRequestQueue.storeResponse(requestId, response, error);
    res.json({ status: 'acknowledged' });
  });
  
  // Get response for a request
  app.get('/api/browser-requests/:requestId', async (req: Request, res: Response) => {
    const { requestId } = req.params;
    const wait = req.query.wait === 'true';
    
    try {
      if (wait) {
        // Wait for response with timeout
        const response = await browserRequestQueue.waitForResponse(requestId);
        res.json({ status: 'completed', ...response });
      } else {
        // Check immediately
        const response = browserRequestQueue.getResponse(requestId);
        if (response) {
          res.json({ status: 'completed', ...response });
        } else {
          res.json({ status: 'pending' });
        }
      }
    } catch (error: any) {
      res.status(408).json({ 
        status: 'timeout', 
        error: error.message 
      });
    }
  });
  
  // Get request queue statistics
  app.get('/api/browser-requests/stats', (req: Request, res: Response) => {
    const stats = browserRequestQueue.getStats();
    res.json(stats);
  });
  
  // Convenience endpoints for common operations
  
  // Get logs from browser
  app.post('/api/browser/logs', async (req: Request, res: Response) => {
    try {
      const { tabId, correlationId, last, worker } = req.body;
      
      const requestId = await browserRequestQueue.queueRequest(tabId || 'any', {
        type: 'data',
        action: 'get-logs',
        params: { correlationId, last, worker }
      });
      
      const response = await browserRequestQueue.waitForResponse(requestId);
      
      if (response.error) {
        res.status(400).json({ error: response.error });
      } else {
        res.json(response.response);
      }
    } catch (error: any) {
      res.status(408).json({ error: error.message });
    }
  });
  
  // Get interleaved logs
  app.post('/api/browser/logs/interleaved', async (req: Request, res: Response) => {
    try {
      const { tabId, correlationId } = req.body;
      
      if (!correlationId) {
        return res.status(400).json({ error: 'correlationId is required' });
      }
      
      const requestId = await browserRequestQueue.queueRequest(tabId || 'any', {
        type: 'data',
        action: 'get-interleaved-logs',
        params: { correlationId }
      });
      
      const response = await browserRequestQueue.waitForResponse(requestId);
      
      if (response.error) {
        res.status(400).json({ error: response.error });
      } else {
        res.json(response.response);
      }
    } catch (error: any) {
      res.status(408).json({ error: error.message });
    }
  });
  
  // Get browser state
  app.post('/api/browser/state', async (req: Request, res: Response) => {
    try {
      const { tabId } = req.body;
      
      const requestId = await browserRequestQueue.queueRequest(tabId || 'any', {
        type: 'data',
        action: 'get-state',
        params: {}
      });
      
      const response = await browserRequestQueue.waitForResponse(requestId);
      
      if (response.error) {
        res.status(400).json({ error: response.error });
      } else {
        res.json(response.response);
      }
    } catch (error: any) {
      res.status(408).json({ error: error.message });
    }
  });
  
  // Control browser UI
  app.post('/api/browser/control', async (req: Request, res: Response) => {
    try {
      const { tabId, action, params } = req.body;
      
      if (!action) {
        return res.status(400).json({ error: 'action is required' });
      }
      
      const requestId = await browserRequestQueue.queueRequest(tabId || 'any', {
        type: 'control',
        action,
        params: params || {}
      });
      
      const response = await browserRequestQueue.waitForResponse(requestId, 10000); // 10 second timeout for control actions
      
      if (response.error) {
        res.status(400).json({ error: response.error });
      } else {
        res.json(response.response);
      }
    } catch (error: any) {
      res.status(408).json({ error: error.message });
    }
  });
  
  // Execute command and wait for completion
  app.post('/api/browser/execute-and-wait', async (req: Request, res: Response) => {
    try {
      const { tabId, action, params, timeout } = req.body;
      
      if (!action) {
        return res.status(400).json({ error: 'action is required' });
      }
      
      // First, execute the control action
      const controlRequestId = await browserRequestQueue.queueRequest(tabId || 'any', {
        type: 'control',
        action,
        params: params || {}
      });
      
      const controlResponse = await browserRequestQueue.waitForResponse(controlRequestId, 10000);
      
      if (controlResponse.error || !controlResponse.response?.success) {
        return res.status(400).json({ 
          error: controlResponse.error || 'Control action failed',
          response: controlResponse.response 
        });
      }
      
      const correlationId = controlResponse.response.correlationId;
      
      if (!correlationId) {
        // Action succeeded but no correlationId to track
        return res.json({
          executed: true,
          correlationId: null,
          response: controlResponse.response
        });
      }
      
      // Now wait for the command to complete
      const waitRequestId = await browserRequestQueue.queueRequest(tabId || 'any', {
        type: 'data',
        action: 'wait-for-command',
        params: { correlationId, timeout: timeout || 30000 }
      });
      
      const waitResponse = await browserRequestQueue.waitForResponse(waitRequestId, (timeout || 30000) + 5000);
      
      if (waitResponse.error) {
        return res.status(408).json({ 
          executed: true,
          correlationId,
          completed: false,
          error: waitResponse.error 
        });
      }
      
      // Get the final logs
      const logsRequestId = await browserRequestQueue.queueRequest(tabId || 'any', {
        type: 'data',
        action: 'get-interleaved-logs',
        params: { correlationId }
      });
      
      const logsResponse = await browserRequestQueue.waitForResponse(logsRequestId);
      
      res.json({
        executed: true,
        correlationId,
        completed: waitResponse.response?.completed || false,
        status: waitResponse.response?.status,
        duration: waitResponse.response?.duration,
        command: waitResponse.response?.command,
        logs: logsResponse.response || []
      });
      
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  console.log('[BrowserRequestQueue] Endpoints registered');
  
  // Log available control actions for debugging
  console.log('[BrowserRequestQueue] Available control actions:');
  console.log('  - start-agent (params: {agent: "name"})');
  console.log('  - stop-agent (params: {agent: "name"})');
  console.log('  - start-manager (params: {agent: "name"})');
  console.log('  - stop-manager (params: {agent: "name"})');
  console.log('  - start-all-agents');
  console.log('  - stop-all-agents');
  console.log('  - start-all-managers');
  console.log('  - stop-all-managers');
  console.log('  - clear-console');
  console.log('  - clear-logs');
  console.log('  - retry-command (params: {commandId: "id"})');
  console.log('  - wait-for-command (params: {correlationId: "id", timeout: ms})');
  console.log('  - get-command-status (params: {correlationId: "id"})');
  console.log('  - refresh-browser (params: {delay: ms})');
  
  // Convenience endpoint to refresh browser after deployment
  app.post('/api/browser/refresh-after-deploy', async (req: Request, res: Response) => {
    try {
      const { tabId, delay } = req.body;
      
      // Wait a bit for deployment to complete
      const deployDelay = delay || 5000; // Default 5 seconds
      
      setTimeout(async () => {
        const requestId = await browserRequestQueue.queueRequest(tabId || 'any', {
          type: 'control',
          action: 'refresh-browser',
          params: { delay: 1000 }
        });
        
        console.log(`[BrowserRefresh] Queued refresh request ${requestId} for tab ${tabId || 'any'}`);
      }, deployDelay);
      
      res.json({ 
        success: true, 
        message: `Browser refresh will be requested in ${deployDelay}ms` 
      });
      
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get complete logs for a correlation ID (UI + backend)
  app.get('/api/browser/logs/:correlationId', async (req: Request, res: Response) => {
    try {
      const { correlationId } = req.params;
      const { tabId } = req.query;
      
      // Queue request to get logs from browser
      const requestId = await browserRequestQueue.queueRequest((tabId as string) || 'any', {
        type: 'data',
        action: 'get-logs-for-correlation',
        params: { correlationId }
      });
      
      // Wait for browser response
      const response = await browserRequestQueue.waitForResponse(requestId, 5000);
      
      if (response.error) {
        return res.status(400).json({ error: response.error });
      }
      
      // Also get backend execution data
      const backendResponse = await fetch(`http://localhost:${process.env.PORT || 80}/api/executions/${correlationId}/complete`);
      
      if (backendResponse.ok) {
        const execution: any = await backendResponse.json();
        
        // Combine UI logs and backend logs
        const combinedLogs = {
          correlationId,
          execution,
          uiLogs: response.response?.logs || [],
          backendLogs: execution?.formattedLogs || [],
          combined: [] as any[]
        };
        
        // Merge and sort all logs by timestamp
        [...combinedLogs.uiLogs, ...combinedLogs.backendLogs].forEach(log => {
          combinedLogs.combined.push({
            timestamp: log.timestamp,
            type: log.type,
            source: log.worker ? 'UI' : 'Backend',
            message: log.message || log.description,
            action: log.action,
            worker: log.worker
          });
        });
        
        // Sort by timestamp
        combinedLogs.combined.sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        res.json(combinedLogs);
      } else {
        // No backend execution found, return just UI logs
        res.json({
          correlationId,
          uiLogs: response.response?.logs || [],
          combined: response.response?.logs || []
        });
      }
      
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}