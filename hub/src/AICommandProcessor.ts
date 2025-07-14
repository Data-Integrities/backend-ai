import Anthropic from 'anthropic';
import { 
  CommandRequest, 
  ParsedCommand,
  CommandCategory,
  CommandRisk,
  AgentStatus
} from '@proxmox-ai-control/shared';

export class AICommandProcessor {
  private anthropic: Anthropic;

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({
      apiKey: apiKey
    });
  }

  async processNaturalLanguageCommand(
    request: string,
    targetAgents: AgentStatus[]
  ): Promise<CommandRequest> {
    const systemPrompt = `You are an AI assistant that helps manage Linux servers and containers. 
    Your task is to interpret natural language commands and determine:
    1. What action needs to be taken
    2. Which servers/containers should execute the command
    3. The risk level of the command
    4. Whether the command needs user confirmation

    Available agents:
    ${targetAgents.map(agent => `- ${agent.agentId} (${agent.hostname}): ${agent.capabilities.installedServices.join(', ')}`).join('\n')}

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
      const response = await this.anthropic.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1000,
        temperature: 0,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: request
          }
        ]
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
          category: parsed.category as CommandCategory,
          risk: parsed.risk as CommandRisk,
          requireConfirmation: parsed.requireConfirmation
        };
      }

      throw new Error('Invalid response from AI');
    } catch (error) {
      throw new Error(`Failed to process command: ${error}`);
    }
  }

  async suggestCommands(
    situation: string,
    availableAgents: AgentStatus[]
  ): Promise<string[]> {
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
    } catch (error) {
      console.error('Failed to generate suggestions:', error);
      return [];
    }
  }

  async analyzeResults(
    command: CommandRequest,
    results: any[]
  ): Promise<string> {
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
    } catch (error) {
      return `Analysis failed: ${error}`;
    }
  }

  private generateRequestId(): string {
    return `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}