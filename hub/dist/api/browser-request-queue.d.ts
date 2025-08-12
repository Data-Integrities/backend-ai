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
export declare class BrowserRequestQueue {
    private requests;
    private responses;
    private requestTimeout;
    constructor();
    queueRequest(tabId: string | 'any', request: Omit<BrowserRequest, 'id' | 'timestamp' | 'status' | 'expiresAt'>): Promise<string>;
    getPendingRequests(tabId: string): BrowserRequest[];
    storeResponse(requestId: string, response: any, error?: string): void;
    getResponse(requestId: string): any;
    waitForResponse(requestId: string, timeout?: number): Promise<any>;
    private cleanupExpiredRequests;
    getStats(): any;
}
export declare const browserRequestQueue: BrowserRequestQueue;
//# sourceMappingURL=browser-request-queue.d.ts.map