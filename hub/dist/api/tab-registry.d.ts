import { Express } from 'express';
interface TabInfo {
    tabId: string;
    lastActivity: Date;
    description: string;
    userAgent?: string;
    registeredAt: Date;
}
declare class TabRegistry {
    private tabs;
    private readonly TAB_TIMEOUT_MS;
    register(tabId: string, userAgent?: string): void;
    updateActivity(tabId: string): void;
    getMostRecentTab(): TabInfo | null;
    getAllTabs(): TabInfo[];
    getTab(tabId: string): TabInfo | null;
    private cleanup;
}
export declare const tabRegistry: TabRegistry;
export declare function setupTabEndpoints(app: Express): void;
export declare function getTabRegistry(): TabRegistry;
export {};
//# sourceMappingURL=tab-registry.d.ts.map