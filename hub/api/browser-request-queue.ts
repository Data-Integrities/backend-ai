import { v4 as uuidv4 } from 'uuid';

export interface BrowserRequest {
  id: string;
  type: 'data' | 'control';
  action: string;
  params: any;
  timestamp: Date;
  tabId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired';
  response?: any;
  error?: string;
  expiresAt: Date;
}

export class BrowserRequestQueue {
  private requests: Map<string, BrowserRequest[]> = new Map();
  private responses: Map<string, any> = new Map();
  private requestTimeout = 30000; // 30 seconds
  
  constructor() {
    // Clean up expired requests every minute
    setInterval(() => this.cleanupExpiredRequests(), 60000);
  }
  
  // Queue a request for a browser
  async queueRequest(
    tabId: string | 'any', 
    request: Omit<BrowserRequest, 'id' | 'timestamp' | 'status' | 'expiresAt'>
  ): Promise<string> {
    const id = `req_${Date.now()}_${uuidv4().substring(0, 8)}`;
    const fullRequest: BrowserRequest = {
      ...request,
      id,
      timestamp: new Date(),
      status: 'pending',
      expiresAt: new Date(Date.now() + this.requestTimeout)
    };
    
    const key = tabId || 'any';
    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }
    this.requests.get(key)!.push(fullRequest);
    
    console.log(`[BrowserQueue] Queued request ${id} for tab ${key}: ${request.action}`);
    return id;
  }
  
  // Get pending requests for a tab
  getPendingRequests(tabId: string): BrowserRequest[] {
    const requests: BrowserRequest[] = [];
    
    // Get tab-specific requests
    const tabRequests = this.requests.get(tabId) || [];
    requests.push(...tabRequests.filter(r => r.status === 'pending'));
    
    // Get 'any' tab requests
    const anyRequests = this.requests.get('any') || [];
    requests.push(...anyRequests.filter(r => r.status === 'pending'));
    
    // Mark as processing
    requests.forEach(r => r.status = 'processing');
    
    return requests;
  }
  
  // Store response from browser
  storeResponse(requestId: string, response: any, error?: string): void {
    this.responses.set(requestId, {
      response,
      error,
      timestamp: new Date()
    });
    
    // Update request status
    for (const [tabId, requests] of this.requests) {
      const request = requests.find(r => r.id === requestId);
      if (request) {
        request.status = error ? 'failed' : 'completed';
        request.response = response;
        request.error = error;
        console.log(`[BrowserQueue] Response stored for ${requestId}: ${request.status}`);
        break;
      }
    }
  }
  
  // Get response for a request
  getResponse(requestId: string): any {
    return this.responses.get(requestId);
  }
  
  // Wait for response with timeout
  async waitForResponse(requestId: string, timeout?: number): Promise<any> {
    const startTime = Date.now();
    const maxWait = timeout || this.requestTimeout;
    
    while (Date.now() - startTime < maxWait) {
      const response = this.getResponse(requestId);
      if (response) {
        return response;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Mark as expired if no response
    for (const [tabId, requests] of this.requests) {
      const request = requests.find(r => r.id === requestId);
      if (request && request.status === 'processing') {
        request.status = 'expired';
        break;
      }
    }
    
    throw new Error(`Request ${requestId} timed out`);
  }
  
  // Clean up expired requests
  private cleanupExpiredRequests(): void {
    const now = new Date();
    let cleaned = 0;
    
    for (const [tabId, requests] of this.requests) {
      const activeRequests = requests.filter(r => {
        if (r.expiresAt < now && r.status === 'pending') {
          r.status = 'expired';
          cleaned++;
          return false;
        }
        return r.status !== 'completed' && r.status !== 'failed' && r.status !== 'expired';
      });
      
      if (activeRequests.length === 0) {
        this.requests.delete(tabId);
      } else {
        this.requests.set(tabId, activeRequests);
      }
    }
    
    if (cleaned > 0) {
      console.log(`[BrowserQueue] Cleaned up ${cleaned} expired requests`);
    }
  }
  
  // Get request statistics
  getStats(): any {
    let pending = 0;
    let processing = 0;
    let completed = 0;
    let failed = 0;
    let expired = 0;
    
    for (const requests of this.requests.values()) {
      for (const request of requests) {
        switch (request.status) {
          case 'pending': pending++; break;
          case 'processing': processing++; break;
          case 'completed': completed++; break;
          case 'failed': failed++; break;
          case 'expired': expired++; break;
        }
      }
    }
    
    return {
      pending,
      processing,
      completed,
      failed,
      expired,
      total: pending + processing + completed + failed + expired
    };
  }
}

// Singleton instance
export const browserRequestQueue = new BrowserRequestQueue();