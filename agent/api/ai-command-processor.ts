import Anthropic from '@anthropic-ai/sdk';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { CapabilitiesManager } from './capabilities-manager';

const execAsync = promisify(exec);

export class AgentAICommandProcessor {
    private anthropic: Anthropic;
    private capabilitiesManager: CapabilitiesManager;
    private agentName: string;
    private agentCapabilities: string = '';

    constructor(apiKey: string, capabilitiesManager: CapabilitiesManager) {
        console.log(`Initializing Anthropic with API key length: ${apiKey.length}, last 4 chars: ...${apiKey.slice(-4)}`);
        this.anthropic = new Anthropic({ apiKey });
        this.capabilitiesManager = capabilitiesManager;
        this.agentName = process.env.AGENT_NAME || 'unknown';
        this.loadCapabilities();
    }

    private async loadCapabilities() {
        try {
            // Load agent-specific capabilities from README files
            const capabilities = await this.capabilitiesManager.getCapabilities(true);
            const capabilityDocs = capabilities.capabilities
                .map(cap => `${cap.name}: ${cap.description}`)
                .join('\n');
            
            // Load the main capabilities README
            const mainReadme = await this.capabilitiesManager.getCapabilityReadme('README.md');
            
            this.agentCapabilities = `
Agent: ${this.agentName}
Platform: ${process.platform}

${mainReadme}

Available Capabilities:
${capabilityDocs}
`;
        } catch (error) {
            console.error('Failed to load capabilities:', error);
            this.agentCapabilities = `Agent: ${this.agentName} - No specific capabilities documented`;
        }
    }

    async processNaturalLanguageCommand(command: string): Promise<string> {
        const systemPrompt = `You are an AI assistant embedded in a Linux agent named "${this.agentName}".
You help users with infrastructure tasks through natural conversation.

${this.agentCapabilities}

IMPORTANT:
1. You are having a conversation with the user about infrastructure tasks
2. Use the agent's documented capabilities to understand what you can help with
3. You HAVE FULL FILE SYSTEM ACCESS - you can read, write, and execute commands on this system
4. When users ask you to examine files or directories, you should propose the appropriate commands
5. All commands you suggest will require user approval before execution (similar to Claude Code)
6. Be specific about what commands you would run to accomplish tasks
7. You can access ANY directory on the system including /etc/nginx, /var/log, etc.

COMMAND EXECUTION:
When users ask you to perform tasks, you should:
1. Explain what you're going to do
2. List the specific commands you would run
3. Format commands in code blocks using backticks
4. Example: "I'll examine your nginx configuration by running: \`cat /etc/nginx/nginx.conf\`"

Remember: You're not limited to just discussing - you can actually propose and execute commands with user approval.

PERMISSION HANDLING:
When discussing operations that could be dangerous or have significant impact, wrap the relevant part of your response with permission markers:

[PERMISSION_REQUIRED: risk=high]
Description of the dangerous operation and its potential impact.
[/PERMISSION_REQUIRED]

Risk levels:
- low: Routine operations (viewing logs, checking status)
- medium: Configuration changes that won't interrupt service
- high: Service restarts, network changes, or operations that may cause brief interruptions
- critical: Data deletion, system-wide changes, or operations that could cause extended downtime

Examples of high-risk operations:
- Restarting services (nginx, database, etc.)
- Modifying firewall rules
- Changing network configuration
- Deleting files or data
- Modifying system configuration files
- Installing or removing software`;

        try {
            const response = await this.anthropic.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1000,
                temperature: 0,
                system: systemPrompt,
                messages: [{
                    role: 'user',
                    content: command
                }]
            });

            const content = response.content[0];
            if (content.type === 'text') {
                return content.text;
            }

            throw new Error('Invalid AI response format');
        } catch (error) {
            console.error('AI processing error:', error);
            throw new Error(`Failed to process command: ${error}`);
        }
    }

    async executeCommand(shellCommand: string): Promise<{
        success: boolean;
        stdout?: string;
        stderr?: string;
        error?: string;
    }> {
        try {
            console.log(`[AGENT ${this.agentName}] Executing: ${shellCommand}`);
            const { stdout, stderr } = await execAsync(shellCommand, {
                timeout: 30000, // 30 second timeout
                maxBuffer: 1024 * 1024 * 10 // 10MB buffer
            });

            return {
                success: true,
                stdout: stdout || '',
                stderr: stderr || ''
            };
        } catch (error: any) {
            console.error(`[AGENT ${this.agentName}] Command failed:`, error);
            return {
                success: false,
                error: error.message,
                stdout: error.stdout || '',
                stderr: error.stderr || ''
            };
        }
    }
}