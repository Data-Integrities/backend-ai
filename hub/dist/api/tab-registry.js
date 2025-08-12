"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tabRegistry = void 0;
exports.setupTabEndpoints = setupTabEndpoints;
exports.getTabRegistry = getTabRegistry;
class TabRegistry {
    constructor() {
        this.tabs = new Map();
        this.TAB_TIMEOUT_MS = 5 * 1000; // 5 seconds - tabs poll every 250ms
    }
    register(tabId, userAgent) {
        const now = new Date();
        this.tabs.set(tabId, {
            tabId,
            lastActivity: now,
            registeredAt: now,
            description: `Registered at ${now.toISOString()}`,
            userAgent
        });
        console.log(`[TAB-REGISTRY] Tab registered: ${tabId}`);
        this.cleanup();
    }
    updateActivity(tabId) {
        const tab = this.tabs.get(tabId);
        if (tab) {
            tab.lastActivity = new Date();
            tab.description = `Last active: ${tab.lastActivity.toISOString()}`;
        }
        else {
            // Auto-register if not found
            this.register(tabId);
        }
    }
    getMostRecentTab() {
        this.cleanup();
        const sortedTabs = Array.from(this.tabs.values())
            .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
        return sortedTabs[0] || null;
    }
    getAllTabs() {
        this.cleanup();
        return Array.from(this.tabs.values())
            .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
    }
    getTab(tabId) {
        return this.tabs.get(tabId) || null;
    }
    // Remove tabs that haven't been active for TAB_TIMEOUT_MS
    cleanup() {
        const now = Date.now();
        const toRemove = [];
        this.tabs.forEach((tab, tabId) => {
            if (now - tab.lastActivity.getTime() > this.TAB_TIMEOUT_MS) {
                toRemove.push(tabId);
            }
        });
        toRemove.forEach(tabId => {
            this.tabs.delete(tabId);
            console.log(`[TAB-REGISTRY] Tab expired and removed: ${tabId}`);
        });
    }
}
// Singleton instance
exports.tabRegistry = new TabRegistry();
function setupTabEndpoints(app) {
    // Register a new tab
    app.post('/api/tabs/register', (req, res) => {
        const { tabId } = req.body;
        const userAgent = req.headers['user-agent'];
        if (!tabId) {
            return res.status(400).json({ error: 'tabId required' });
        }
        exports.tabRegistry.register(tabId, userAgent);
        res.json({
            success: true,
            message: 'Tab registered',
            tabId
        });
    });
    // Get all active tabs
    app.get('/api/tabs', (req, res) => {
        const tabs = exports.tabRegistry.getAllTabs();
        res.json({
            tabs,
            count: tabs.length
        });
    });
    // Get most recent tab
    app.get('/api/tabs/most-recent', (req, res) => {
        const tab = exports.tabRegistry.getMostRecentTab();
        if (!tab) {
            return res.status(404).json({ error: 'No active tabs found' });
        }
        res.json({
            tab,
            debugUrl: `/api/client/logs?tabId=${tab.tabId}`
        });
    });
    // Request logs from most recent tab (redirects)
    app.get('/api/tabs/most-recent/logs', (req, res) => {
        const tab = exports.tabRegistry.getMostRecentTab();
        if (!tab) {
            return res.status(404).json({ error: 'No active tabs found' });
        }
        // Redirect to the client API with tab ID
        const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
        const separator = queryString ? '&' : '?';
        res.redirect(`/api/client/logs${queryString}${separator}tabId=${tab.tabId}`);
    });
    // Get specific tab info
    app.get('/api/tabs/:tabId', (req, res) => {
        const { tabId } = req.params;
        const tab = exports.tabRegistry.getTab(tabId);
        if (!tab) {
            return res.status(404).json({ error: 'Tab not found' });
        }
        res.json({ tab });
    });
    // Update tab activity (called by middleware)
    app.use((req, res, next) => {
        // Extract tabId from request body or headers
        const tabId = req.body?.tabId || req.headers['x-tab-id'];
        if (tabId && typeof tabId === 'string') {
            exports.tabRegistry.updateActivity(tabId);
        }
        next();
    });
}
// Export for use in other modules
function getTabRegistry() {
    return exports.tabRegistry;
}
//# sourceMappingURL=tab-registry.js.map