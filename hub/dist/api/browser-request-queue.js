"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.browserRequestQueue = exports.BrowserRequestQueue = void 0;
const uuid_1 = require("uuid");
class BrowserRequestQueue {
    constructor() {
        this.requests = new Map();
        this.responses = new Map();
        this.requestTimeout = 30000; // 30 seconds
        // Clean up expired requests every minute
        setInterval(() => this.cleanupExpiredRequests(), 60000);
    }
    // Queue a request for a browser
    async queueRequest(tabId, request) {
        const id = `req_${Date.now()}_${(0, uuid_1.v4)().substring(0, 8)}`;
        const fullRequest = {
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
        this.requests.get(key).push(fullRequest);
        console.log(`[BrowserQueue] Queued request ${id} for tab ${key}: ${request.action}`);
        return id;
    }
    // Get pending requests for a tab
    getPendingRequests(tabId) {
        const requests = [];
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
    storeResponse(requestId, response, error) {
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
    getResponse(requestId) {
        return this.responses.get(requestId);
    }
    // Wait for response with timeout
    async waitForResponse(requestId, timeout) {
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
    cleanupExpiredRequests() {
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
            }
            else {
                this.requests.set(tabId, activeRequests);
            }
        }
        if (cleaned > 0) {
            console.log(`[BrowserQueue] Cleaned up ${cleaned} expired requests`);
        }
    }
    // Get request statistics
    getStats() {
        let pending = 0;
        let processing = 0;
        let completed = 0;
        let failed = 0;
        let expired = 0;
        for (const requests of this.requests.values()) {
            for (const request of requests) {
                switch (request.status) {
                    case 'pending':
                        pending++;
                        break;
                    case 'processing':
                        processing++;
                        break;
                    case 'completed':
                        completed++;
                        break;
                    case 'failed':
                        failed++;
                        break;
                    case 'expired':
                        expired++;
                        break;
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
exports.BrowserRequestQueue = BrowserRequestQueue;
// Singleton instance
exports.browserRequestQueue = new BrowserRequestQueue();
//# sourceMappingURL=browser-request-queue.js.map