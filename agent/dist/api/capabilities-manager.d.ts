export interface CapabilityInfo {
    name: string;
    description: string;
    readmePath: string;
    readmeContent?: string;
}
export interface CapabilitiesData {
    capabilities: CapabilityInfo[];
    hash: string;
    lastUpdated: string;
}
export declare class CapabilitiesManager {
    private capabilitiesDir;
    private cacheData;
    constructor();
    ensureCapabilitiesDir(): Promise<void>;
    getCapabilities(includeContent?: boolean): Promise<CapabilitiesData>;
    getCapabilityReadme(capabilityPath: string): Promise<string>;
    addCapability(name: string, folder: string, description: string, readmeContent: string): Promise<void>;
}
//# sourceMappingURL=capabilities-manager.d.ts.map