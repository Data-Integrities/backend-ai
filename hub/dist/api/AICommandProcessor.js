"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AICommandProcessor = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
class AICommandProcessor {
    constructor(apiKey) {
        this.anthropic = new sdk_1.default({
            apiKey: apiKey
        });
    }
    async processNaturalLanguageCommand(request, targetAgents, // Simplified agent info, not full AgentStatus
    conversationHistory) {
        const systemPrompt = `You are an AI assistant that helps manage Linux servers and containers. 
    Your task is to interpret natural language commands and determine:
    1. What action needs to be taken
    2. Which servers/containers should execute the command
    3. The risk level of the command
    4. Whether the command needs user confirmation

    IMPORTANT: If this appears to be a follow-up question or continuation of a previous command:
    - Look at the conversation history to understand context
    - If the user doesn't specify which agent/server to use, intelligently route to the same agents used in the most recent related command
    - Consider pronouns like "it", "there", "that server" as references to previously mentioned agents

    Available agents:
    ${targetAgents.map(agent => `- ${agent.agentId}: ${agent.summary || agent.type || 'command executor'}`).join('\n')}

    Respond in JSON format with:
    {
      "action": "description of what to do",
      "targetAgents": ["agent-id1", "agent-id2"],
      "category": "service|config|debug|system|network",
      "risk": "low|medium|high|critical",
      "requireConfirmation": true/false,
      "interpretation": "explanation of what will happen"
    }`;
        try {
            // Build messages array with conversation history
            const messages = [];
            // Add conversation history if available
            if (conversationHistory && conversationHistory.length > 0) {
                // Find the most recent command that targeted specific agents
                let lastAgentCommand = null;
                for (let i = conversationHistory.length - 1; i >= 0; i--) {
                    const msg = conversationHistory[i];
                    if (msg.role === 'assistant' && msg.agentInfo) {
                        lastAgentCommand = msg;
                        break;
                    }
                }
                // Add context about previous commands
                if (lastAgentCommand) {
                    messages.push({
                        role: 'user',
                        content: `Previous conversation context: The last command was sent to ${lastAgentCommand.agentInfo}. Consider this when routing follow-up questions.`
                    });
                    messages.push({
                        role: 'assistant',
                        content: 'I understand the context and will route appropriately.'
                    });
                }
                // Add last few exchanges for context
                const recentHistory = conversationHistory.slice(-6); // Last 3 exchanges
                for (const msg of recentHistory) {
                    if (msg.role && msg.content && typeof msg.content === 'string') {
                        messages.push({
                            role: msg.role,
                            content: msg.content
                        });
                    }
                }
            }
            // Add the current request
            messages.push({
                role: 'user',
                content: request
            });
            const response = await this.anthropic.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1000,
                temperature: 0,
                system: systemPrompt,
                messages
            });
            const content = response.content[0];
            if (content.type === 'text') {
                const parsed = JSON.parse(content.text);
                return {
                    id: this.generateRequestId(),
                    timestamp: new Date(),
                    naturalLanguage: request,
                    sourceHub: 'main-hub',
                    targetAgents: parsed.targetAgents,
                    category: parsed.category,
                    risk: parsed.risk,
                    requireConfirmation: parsed.requireConfirmation
                };
            }
            throw new Error('Invalid response from AI');
        }
        catch (error) {
            throw new Error(`Failed to process command: ${error}`);
        }
    }
    async suggestCommands(situation, availableAgents) {
        const systemPrompt = `You are an AI assistant that helps manage Linux servers.
    Based on the situation described, suggest 3-5 relevant commands that would help.
    
    Available servers and their services:
    ${availableAgents.map(agent => `- ${agent.hostname}: ${agent.capabilities.installedServices.join(', ')}`).join('\n')}
    
    Respond with a JSON array of command suggestions.`;
        try {
            const response = await this.anthropic.messages.create({
                model: 'claude-3-sonnet-20240229',
                max_tokens: 500,
                temperature: 0.3,
                system: systemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: situation
                    }
                ]
            });
            const content = response.content[0];
            if (content.type === 'text') {
                return JSON.parse(content.text);
            }
            return [];
        }
        catch (error) {
            console.error('Failed to generate suggestions:', error);
            return [];
        }
    }
    async analyzeResults(command, results) {
        const systemPrompt = `You are an AI assistant analyzing command execution results.
    Provide a clear, concise summary of what happened, highlighting any errors or important information.`;
        const resultsSummary = results.map(r => ({
            agent: r.agentId,
            success: r.success,
            output: r.output?.substring(0, 500),
            error: r.error
        }));
        try {
            const response = await this.anthropic.messages.create({
                model: 'claude-3-sonnet-20240229',
                max_tokens: 500,
                temperature: 0,
                system: systemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: `Command: ${command.naturalLanguage}\n\nResults: ${JSON.stringify(resultsSummary, null, 2)}`
                    }
                ]
            });
            const content = response.content[0];
            if (content.type === 'text') {
                return content.text;
            }
            return 'Unable to analyze results';
        }
        catch (error) {
            return `Analysis failed: ${error}`;
        }
    }
    generateRequestId() {
        return `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
exports.AICommandProcessor = AICommandProcessor;
//# sourceMappingURL=AICommandProcessor.js.map