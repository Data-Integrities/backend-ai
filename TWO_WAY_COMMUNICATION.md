# Two-Way Communication Pattern: Server-Browser Request Queue

This document describes a powerful pattern for enabling bidirectional communication between a server API and browser clients, allowing the server to request data from browsers and even control their UI programmatically.

## Overview

Traditional web architectures follow a one-way request model where browsers request data from servers. This pattern inverts that relationship, allowing servers to queue requests that browsers fulfill during their regular communication cycles.

## Architecture

### Core Components

1. **Server-Side Request Queue**
   - Maintains pending requests for browser clients
   - Tracks request status and responses
   - Handles request routing to specific tabs/sessions

2. **Browser Polling/EventSource Integration**
   - Browsers check for pending requests during regular communication
   - Processes requests and sends responses back
   - Maintains tab registration for request routing

3. **Request Types**
   - **Data Requests**: Fetch browser-only data (sessionStorage, UI state, logs)
   - **Control Commands**: Programmatically control the UI (click buttons, navigate)

## Implementation Pattern

### 1. Server-Side Request Queue

```typescript
// Server API (TypeScript)
interface BrowserRequest {
  id: string;
  type: 'data' | 'control';
  action: string;
  params: any;
  timestamp: Date;
  tabId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  response?: any;
}

class BrowserRequestQueue {
  private requests: Map<string, BrowserRequest[]> = new Map();
  private responses: Map<string, any> = new Map();

  // Queue a request for a browser
  async queueRequest(tabId: string, request: Omit<BrowserRequest, 'id' | 'timestamp' | 'status'>): Promise<string> {
    const id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullRequest: BrowserRequest = {
      ...request,
      id,
      timestamp: new Date(),
      status: 'pending'
    };
    
    if (!this.requests.has(tabId)) {
      this.requests.set(tabId, []);
    }
    this.requests.get(tabId)!.push(fullRequest);
    
    return id;
  }

  // Get pending requests for a tab
  getPendingRequests(tabId: string): BrowserRequest[] {
    const requests = this.requests.get(tabId) || [];
    return requests.filter(r => r.status === 'pending');
  }

  // Store response from browser
  storeResponse(requestId: string, response: any): void {
    this.responses.set(requestId, {
      response,
      timestamp: new Date()
    });
    
    // Update request status
    for (const [tabId, requests] of this.requests) {
      const request = requests.find(r => r.id === requestId);
      if (request) {
        request.status = 'completed';
        request.response = response;
        break;
      }
    }
  }
}
```

### 2. API Endpoints

```typescript
// Server endpoints
app.post('/api/browser-requests', async (req, res) => {
  const { tabId, type, action, params } = req.body;
  const requestId = await browserQueue.queueRequest(tabId || 'any', {
    type,
    action,
    params
  });
  
  res.json({ requestId, status: 'queued' });
});

app.get('/api/browser-requests/:requestId', async (req, res) => {
  const response = browserQueue.getResponse(req.params.requestId);
  if (response) {
    res.json({ status: 'completed', ...response });
  } else {
    res.json({ status: 'pending' });
  }
});

// Browser checks for pending requests
app.get('/api/browser-requests/pending/:tabId', (req, res) => {
  const requests = browserQueue.getPendingRequests(req.params.tabId);
  res.json({ requests });
});

// Browser submits responses
app.post('/api/browser-requests/:requestId/response', (req, res) => {
  browserQueue.storeResponse(req.params.requestId, req.body);
  res.json({ status: 'acknowledged' });
});
```

### 3. Browser-Side Implementation

```javascript
// Browser client
class BrowserRequestHandler {
  constructor(tabId) {
    this.tabId = tabId;
    this.handlers = new Map();
    
    // Register handlers for different request types
    this.registerHandlers();
    
    // Start checking for requests
    this.startRequestPolling();
  }
  
  registerHandlers() {
    // Data request handlers
    this.handlers.set('get-logs', async (params) => {
      const logs = JSON.parse(sessionStorage.getItem('logs') || '[]');
      return params.last ? logs.slice(-params.last) : logs;
    });
    
    this.handlers.set('get-state', async (params) => {
      return {
        url: window.location.href,
        sessionData: Object.keys(sessionStorage),
        consoleState: this.getConsoleState(),
        timestamp: new Date().toISOString()
      };
    });
    
    // Control command handlers
    this.handlers.set('click-button', async (params) => {
      const button = document.querySelector(params.selector);
      if (button) {
        button.click();
        return { success: true, clicked: params.selector };
      }
      return { success: false, error: 'Button not found' };
    });
    
    this.handlers.set('start-agent', async (params) => {
      const button = document.querySelector(`[data-agent="${params.agent}"][data-action="start"]`);
      if (button) {
        button.click();
        return { success: true, agent: params.agent, action: 'started' };
      }
      return { success: false, error: 'Start button not found' };
    });
  }
  
  async checkForRequests() {
    try {
      const response = await fetch(`/api/browser-requests/pending/${this.tabId}`);
      const { requests } = await response.json();
      
      for (const request of requests) {
        await this.processRequest(request);
      }
    } catch (error) {
      console.error('Failed to check for requests:', error);
    }
  }
  
  async processRequest(request) {
    const handler = this.handlers.get(request.action);
    
    if (!handler) {
      await this.sendResponse(request.id, {
        error: `Unknown action: ${request.action}`
      });
      return;
    }
    
    try {
      const result = await handler(request.params);
      await this.sendResponse(request.id, result);
    } catch (error) {
      await this.sendResponse(request.id, {
        error: error.message
      });
    }
  }
  
  async sendResponse(requestId, response) {
    await fetch(`/api/browser-requests/${requestId}/response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response)
    });
  }
  
  startRequestPolling() {
    // Check during EventSource messages
    if (this.eventSource) {
      this.eventSource.addEventListener('message', () => {
        this.checkForRequests();
      });
    }
    
    // Also check periodically
    setInterval(() => {
      this.checkForRequests();
    }, 5000);
  }
}
```

## Use Cases

### 1. Remote Debugging

```bash
# Request recent error logs from the browser
curl -X POST http://server/api/browser-requests \
  -d '{"type":"data","action":"get-logs","params":{"level":"error","last":50}}'

# Get the response
curl http://server/api/browser-requests/req_123_abc
```

### 2. Automated Testing

```javascript
// Server-side test automation
async function testWorkflow() {
  // Start an agent via GUI
  const startReq = await queueRequest('tab_123', {
    type: 'control',
    action: 'start-agent',
    params: { agent: 'pve1' }
  });
  
  // Wait for completion
  await waitForResponse(startReq);
  
  // Check the console logs
  const logsReq = await queueRequest('tab_123', {
    type: 'data',
    action: 'get-console-entries',
    params: { last: 10 }
  });
  
  const logs = await waitForResponse(logsReq);
  assert(logs.some(entry => entry.status === 'success'));
}
```

### 3. Support and Diagnostics

```javascript
// Support tool to diagnose user issues
async function diagnoseUserIssue(tabId) {
  // Get current state
  const state = await requestFromBrowser(tabId, 'get-state');
  
  // Get recent errors
  const errors = await requestFromBrowser(tabId, 'get-errors');
  
  // Get performance metrics
  const metrics = await requestFromBrowser(tabId, 'get-performance');
  
  return {
    diagnosis: analyzeIssues(state, errors, metrics),
    recommendations: generateFixes(state)
  };
}
```

## Benefits

1. **Access Browser-Only Data**: Retrieve sessionStorage, localStorage, and other browser-specific data
2. **Remote Control**: Programmatically control the UI without user interaction
3. **Debugging**: Get real-time state and logs from user browsers
4. **Testing**: Automate UI testing through the same interface users use
5. **Support**: Diagnose issues by seeing exactly what users see

## Security Considerations

1. **Authentication**: Ensure requests are authenticated and authorized
2. **Validation**: Validate all control commands to prevent abuse
3. **Sandboxing**: Limit what actions can be performed
4. **Audit Trail**: Log all requests and responses for security review
5. **Consent**: Consider user consent for remote control features

## Implementation Tips

1. **Request Expiry**: Add TTL to requests to prevent queue buildup
2. **Priority Levels**: Implement priority queuing for urgent requests
3. **Batching**: Allow multiple requests to be processed together
4. **Compression**: Compress large responses (logs, state dumps)
5. **Rate Limiting**: Prevent request flooding
6. **Error Recovery**: Handle browser disconnections gracefully

## Example Integration with AI Assistant

```javascript
// AI assistant requesting browser data
async function aiDebugSession(userQuery) {
  if (userQuery.includes("command failed")) {
    // Get failed commands from browser
    const failures = await requestFromBrowser('most-recent-tab', {
      action: 'get-failed-commands',
      params: { last: 5 }
    });
    
    // Get detailed logs for each failure
    for (const failure of failures) {
      const logs = await requestFromBrowser('most-recent-tab', {
        action: 'get-logs',
        params: { correlationId: failure.correlationId }
      });
      
      // Analyze and fix
      const fix = await analyzeFailure(logs);
      await deployFix(fix);
      
      // Retry via browser control
      await requestFromBrowser('most-recent-tab', {
        type: 'control',
        action: 'retry-command',
        params: { commandId: failure.id }
      });
    }
  }
}
```

## Conclusion

This two-way communication pattern transforms the traditional client-server relationship, enabling powerful new capabilities for debugging, automation, and support. By implementing a request queue system, servers can interact with browsers as if they were active participants rather than passive clients.

The pattern is particularly valuable for:
- Development tools that need browser state
- Support systems that need to see what users see
- Testing frameworks that need UI control
- AI assistants that need to understand and fix issues

When implemented with proper security controls, this pattern provides a robust foundation for next-generation web applications that blur the line between client and server.