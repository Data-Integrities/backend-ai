import { Express } from 'express';

interface TabInfo {
  tabId: string;
  lastActivity: Date;
  description: string;
  userAgent?: string;
  registeredAt: Date;
}

class TabRegistry {
  private tabs: Map<string, TabInfo> = new Map();
  private readonly TAB_TIMEOUT_MS = 5 * 1000; // 5 seconds - tabs poll every 250ms

  register(tabId: string, userAgent?: string): void {
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

  updateActivity(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.lastActivity = new Date();
      tab.description = `Last active: ${tab.lastActivity.toISOString()}`;
    } else {
      // Auto-register if not found
      this.register(tabId);
    }
  }

  getMostRecentTab(): TabInfo | null {
    this.cleanup();
    
    const sortedTabs = Array.from(this.tabs.values())
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
    
    return sortedTabs[0] || null;
  }

  getAllTabs(): TabInfo[] {
    this.cleanup();
    return Array.from(this.tabs.values())
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  }

  getTab(tabId: string): TabInfo | null {
    return this.tabs.get(tabId) || null;
  }

  // Remove tabs that haven't been active for TAB_TIMEOUT_MS
  private cleanup(): void {
    const now = Date.now();
    const toRemove: string[] = [];
    
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
export const tabRegistry = new TabRegistry();

export function setupTabEndpoints(app: Express) {
  // Register a new tab
  app.post('/api/tabs/register', (req, res) => {
    const { tabId } = req.body;
    const userAgent = req.headers['user-agent'];
    
    if (!tabId) {
      return res.status(400).json({ error: 'tabId required' });
    }
    
    tabRegistry.register(tabId, userAgent);
    res.json({ 
      success: true, 
      message: 'Tab registered',
      tabId 
    });
  });

  // Get all active tabs
  app.get('/api/tabs', (req, res) => {
    const tabs = tabRegistry.getAllTabs();
    res.json({ 
      tabs,
      count: tabs.length
    });
  });

  // Get most recent tab
  app.get('/api/tabs/most-recent', (req, res) => {
    const tab = tabRegistry.getMostRecentTab();
    
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
    const tab = tabRegistry.getMostRecentTab();
    
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
    const tab = tabRegistry.getTab(tabId);
    
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
      tabRegistry.updateActivity(tabId);
    }
    
    next();
  });
}

// Export for use in other modules
export function getTabRegistry() {
  return tabRegistry;
}