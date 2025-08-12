"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupBrowserRequestEndpoints = setupBrowserRequestEndpoints;
const browser_request_queue_1 = require("./browser-request-queue");
function setupBrowserRequestEndpoints(app) {
    // Queue a request for browser (GET version for avoiding permission issues)
    app.get('/api/browser-requests/queue', async (req, res) => {
        try {
            const { tabId, type, action, ...params } = req.query;
            if (!type || !action) {
                return res.status(400).json({ error: 'type and action are required' });
            }
            // Remove system query params and use the rest as action params
            const actionParams = {};
            Object.keys(params).forEach(key => {
                if (key !== 'wait') {
                    actionParams[key] = params[key];
                }
            });
            const requestId = await browser_request_queue_1.browserRequestQueue.queueRequest(tabId || 'any', {
                type: type,
                action: action,
                params: actionParams
            });
            // If wait=true, wait for response
            if (req.query.wait === 'true') {
                const response = await browser_request_queue_1.browserRequestQueue.waitForResponse(requestId);
                if (response.error) {
                    res.status(400).json({ error: response.error });
                }
                else {
                    res.json(response.response);
                }
            }
            else {
                res.json({
                    requestId,
                    status: 'queued',
                    message: `Request queued for ${tabId || 'any tab'}`
                });
            }
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    // Queue a request for browser (POST version)
    app.post('/api/browser-requests', async (req, res) => {
        try {
            const { tabId, type, action, params } = req.body;
            if (!type || !action) {
                return res.status(400).json({ error: 'type and action are required' });
            }
            const requestId = await browser_request_queue_1.browserRequestQueue.queueRequest(tabId || 'any', {
                type,
                action,
                params: params || {}
            });
            res.json({
                requestId,
                status: 'queued',
                message: `Request queued for ${tabId || 'any tab'}`
            });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    // Get pending requests for a tab
    app.get('/api/browser-requests/pending/:tabId', (req, res) => {
        const { tabId } = req.params;
        // Update tab activity in registry (auto-registers if not found)
        const { getTabRegistry } = require('./tab-registry');
        const tabRegistry = getTabRegistry();
        // Check if tab exists, if not it will auto-register and request refresh
        const existingTab = tabRegistry.getTab(tabId);
        if (!existingTab) {
            console.log(`[BrowserRequest] Auto-registering tab from polling: ${tabId}`);
            tabRegistry.register(tabId, req.headers['user-agent']);
            // Queue a refresh command for this newly discovered tab
            // This ensures the browser gets the latest hub version after hub restart
            console.log(`[BrowserRequest] Queueing refresh for auto-registered tab: ${tabId}`);
            browser_request_queue_1.browserRequestQueue.queueRequest(tabId, {
                type: 'control',
                action: 'refreshBrowser',
                params: {
                    delay: 500,
                    reason: 'Auto-registered after hub restart - refreshing to sync versions'
                }
            });
        }
        else {
            tabRegistry.updateActivity(tabId);
        }
        const requests = browser_request_queue_1.browserRequestQueue.getPendingRequests(tabId);
        res.json({ requests });
    });
    // Submit response for a request
    app.post('/api/browser-requests/:requestId/response', (req, res) => {
        const { requestId } = req.params;
        const { response, error } = req.body;
        browser_request_queue_1.browserRequestQueue.storeResponse(requestId, response, error);
        res.json({ status: 'acknowledged' });
    });
    // Get response for a request
    app.get('/api/browser-requests/:requestId', async (req, res) => {
        const { requestId } = req.params;
        const wait = req.query.wait === 'true';
        try {
            if (wait) {
                // Wait for response with timeout
                const response = await browser_request_queue_1.browserRequestQueue.waitForResponse(requestId);
                res.json({ status: 'completed', ...response });
            }
            else {
                // Check immediately
                const response = browser_request_queue_1.browserRequestQueue.getResponse(requestId);
                if (response) {
                    res.json({ status: 'completed', ...response });
                }
                else {
                    res.json({ status: 'pending' });
                }
            }
        }
        catch (error) {
            res.status(408).json({
                status: 'timeout',
                error: error.message
            });
        }
    });
    // Get request queue statistics
    app.get('/api/browser-requests/stats', (req, res) => {
        const stats = browser_request_queue_1.browserRequestQueue.getStats();
        res.json(stats);
    });
    // Convenience endpoints for common operations
    // Get logs from browser
    app.post('/api/browser/logs', async (req, res) => {
        try {
            const { tabId, correlationId, last, worker } = req.body;
            const requestId = await browser_request_queue_1.browserRequestQueue.queueRequest(tabId || 'any', {
                type: 'data',
                action: 'get-logs',
                params: { correlationId, last, worker }
            });
            const response = await browser_request_queue_1.browserRequestQueue.waitForResponse(requestId);
            if (response.error) {
                res.status(400).json({ error: response.error });
            }
            else {
                res.json(response.response);
            }
        }
        catch (error) {
            res.status(408).json({ error: error.message });
        }
    });
    // Get interleaved logs
    app.post('/api/browser/logs/interleaved', async (req, res) => {
        try {
            const { tabId, correlationId } = req.body;
            if (!correlationId) {
                return res.status(400).json({ error: 'correlationId is required' });
            }
            const requestId = await browser_request_queue_1.browserRequestQueue.queueRequest(tabId || 'any', {
                type: 'data',
                action: 'get-interleaved-logs',
                params: { correlationId }
            });
            const response = await browser_request_queue_1.browserRequestQueue.waitForResponse(requestId);
            if (response.error) {
                res.status(400).json({ error: response.error });
            }
            else {
                res.json(response.response);
            }
        }
        catch (error) {
            res.status(408).json({ error: error.message });
        }
    });
    // Get browser state
    app.post('/api/browser/state', async (req, res) => {
        try {
            const { tabId } = req.body;
            const requestId = await browser_request_queue_1.browserRequestQueue.queueRequest(tabId || 'any', {
                type: 'data',
                action: 'get-state',
                params: {}
            });
            const response = await browser_request_queue_1.browserRequestQueue.waitForResponse(requestId);
            if (response.error) {
                res.status(400).json({ error: response.error });
            }
            else {
                res.json(response.response);
            }
        }
        catch (error) {
            res.status(408).json({ error: error.message });
        }
    });
    // Control browser UI
    app.post('/api/browser/control', async (req, res) => {
        try {
            const { tabId, action, params } = req.body;
            if (!action) {
                return res.status(400).json({ error: 'action is required' });
            }
            const requestId = await browser_request_queue_1.browserRequestQueue.queueRequest(tabId || 'any', {
                type: 'control',
                action,
                params: params || {}
            });
            const response = await browser_request_queue_1.browserRequestQueue.waitForResponse(requestId, 10000); // 10 second timeout for control actions
            if (response.error) {
                res.status(400).json({ error: response.error });
            }
            else {
                res.json(response.response);
            }
        }
        catch (error) {
            res.status(408).json({ error: error.message });
        }
    });
    // Execute command and wait for completion
    app.post('/api/browser/execute-and-wait', async (req, res) => {
        try {
            const { tabId, action, params, timeout } = req.body;
            if (!action) {
                return res.status(400).json({ error: 'action is required' });
            }
            // First, execute the control action
            const controlRequestId = await browser_request_queue_1.browserRequestQueue.queueRequest(tabId || 'any', {
                type: 'control',
                action,
                params: params || {}
            });
            const controlResponse = await browser_request_queue_1.browserRequestQueue.waitForResponse(controlRequestId, 10000);
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
            const waitRequestId = await browser_request_queue_1.browserRequestQueue.queueRequest(tabId || 'any', {
                type: 'data',
                action: 'wait-for-command',
                params: { correlationId, timeout: timeout || 30000 }
            });
            const waitResponse = await browser_request_queue_1.browserRequestQueue.waitForResponse(waitRequestId, (timeout || 30000) + 5000);
            if (waitResponse.error) {
                return res.status(408).json({
                    executed: true,
                    correlationId,
                    completed: false,
                    error: waitResponse.error
                });
            }
            // Get the final logs
            const logsRequestId = await browser_request_queue_1.browserRequestQueue.queueRequest(tabId || 'any', {
                type: 'data',
                action: 'get-interleaved-logs',
                params: { correlationId }
            });
            const logsResponse = await browser_request_queue_1.browserRequestQueue.waitForResponse(logsRequestId);
            res.json({
                executed: true,
                correlationId,
                completed: waitResponse.response?.completed || false,
                status: waitResponse.response?.status,
                duration: waitResponse.response?.duration,
                command: waitResponse.response?.command,
                logs: logsResponse.response || []
            });
        }
        catch (error) {
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
    app.post('/api/browser/refresh-after-deploy', async (req, res) => {
        try {
            const { tabId, delay } = req.body;
            // Wait a bit for deployment to complete
            const deployDelay = delay || 5000; // Default 5 seconds
            setTimeout(async () => {
                const requestId = await browser_request_queue_1.browserRequestQueue.queueRequest(tabId || 'any', {
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
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    // Get complete logs for a correlation ID (UI + backend)
    app.get('/api/browser/logs/:correlationId', async (req, res) => {
        try {
            const { correlationId } = req.params;
            const { tabId } = req.query;
            // Queue request to get logs from browser
            const requestId = await browser_request_queue_1.browserRequestQueue.queueRequest(tabId || 'any', {
                type: 'data',
                action: 'get-logs-for-correlation',
                params: { correlationId }
            });
            // Wait for browser response
            const response = await browser_request_queue_1.browserRequestQueue.waitForResponse(requestId, 5000);
            if (response.error) {
                return res.status(400).json({ error: response.error });
            }
            // Also get backend execution data
            const backendResponse = await fetch(`http://localhost:${process.env.PORT || 80}/api/executions/${correlationId}/complete`);
            if (backendResponse.ok) {
                const execution = await backendResponse.json();
                // Combine UI logs and backend logs
                const combinedLogs = {
                    correlationId,
                    execution,
                    uiLogs: response.response?.logs || [],
                    backendLogs: execution?.formattedLogs || [],
                    combined: []
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
                combinedLogs.combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                res.json(combinedLogs);
            }
            else {
                // No backend execution found, return just UI logs
                res.json({
                    correlationId,
                    uiLogs: response.response?.logs || [],
                    combined: response.response?.logs || []
                });
            }
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}
//# sourceMappingURL=browser-request-endpoints.js.map