import { CommandRequest, AgentStatus } from '@proxmox-ai-control/shared';
export declare class AICommandProcessor {
    private anthropic;
    constructor(apiKey: string);
    processNaturalLanguageCommand(request: string, targetAgents: any[], // Simplified agent info, not full AgentStatus
    conversationHistory?: any[]): Promise<CommandRequest>;
    suggestCommands(situation: string, availableAgents: AgentStatus[]): Promise<string[]>;
    analyzeResults(command: CommandRequest, results: any[]): Promise<string>;
    private generateRequestId;
}
//# sourceMappingURL=AICommandProcessor.d.ts.map