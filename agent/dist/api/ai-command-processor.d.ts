import { CapabilitiesManager } from './capabilities-manager';
export declare class AgentAICommandProcessor {
    private anthropic;
    private capabilitiesManager;
    private agentName;
    private agentCapabilities;
    constructor(apiKey: string, capabilitiesManager: CapabilitiesManager);
    private loadCapabilities;
    processNaturalLanguageCommand(command: string): Promise<string>;
    executeCommand(shellCommand: string): Promise<{
        success: boolean;
        stdout?: string;
        stderr?: string;
        error?: string;
    }>;
}
//# sourceMappingURL=ai-command-processor.d.ts.map