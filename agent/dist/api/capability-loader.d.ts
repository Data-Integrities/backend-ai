export interface CapabilityHandler {
    canHandle: (command: string) => boolean;
    handle: (command: string) => Promise<any>;
}
export declare class CapabilityLoader {
    private handlers;
    private capabilitiesDir;
    constructor();
    loadCapabilities(): Promise<void>;
    private loadCapability;
    handleCommand(command: string): Promise<any>;
    getLoadedCapabilities(): string[];
}
//# sourceMappingURL=capability-loader.d.ts.map