"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentAICommandProcessor = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class AgentAICommandProcessor {
    constructor(apiKey, capabilitiesManager) {
        this.agentCapabilities = '';
        console.log(`Initializing Anthropic with API key length: ${apiKey.length}, last 4 chars: ...${apiKey.slice(-4)}`);
        this.anthropic = new sdk_1.default({ apiKey });
        this.capabilitiesManager = capabilitiesManager;
        this.agentName = process.env.AGENT_NAME || 'unknown';
        this.loadCapabilities();
    }
    async loadCapabilities() {
        try {
            // Load agent-specific capabilities from README files
            const capabilities = await this.capabilitiesManager.getCapabilities(true);
            // Build full capability documentation including content
            const capabilityDocs = [];
            for (const cap of capabilities.capabilities) {
                if (cap.readmeContent) {
                    capabilityDocs.push(`## ${cap.name}\n\n${cap.readmeContent}`);
                }
                else {
                    capabilityDocs.push(`## ${cap.name}\n\n${cap.description}`);
                }
            }
            // Load the main capabilities README
            const mainReadme = await this.capabilitiesManager.getCapabilityReadme('README.md');
            this.agentCapabilities = `
Agent: ${this.agentName}
Platform: ${process.platform}

${mainReadme}

Available Capabilities:
${capabilityDocs.join('\n\n')}
`;
        }
        catch (error) {
            console.error('Failed to load capabilities:', error);
            this.agentCapabilities = `Agent: ${this.agentName} - No specific capabilities documented`;
        }
    }
    async processNaturalLanguageCommand(command) {
        const systemPrompt = `You are an AI assistant embedded in a Linux agent named "${this.agentName}".
You help users with infrastructure tasks through natural conversation.

${this.agentCapabilities}

IMPORTANT:
1. You are having a conversation with the user about infrastructure tasks
2. Use the agent's documented capabilities to understand what you can help with
3. You HAVE FULL FILE SYSTEM ACCESS - you can read, write, and execute commands on this system
4. When users ask you to examine files or directories, you should propose the appropriate commands
5. Documented capabilities execute immediately, other commands require approval
6. Be specific about what commands you would run to accomplish tasks
7. You can access ANY directory on the system including /etc/nginx, /var/log, etc.

COMMAND EXECUTION:
When users ask you to perform tasks:
1. IMMEDIATELY execute the necessary commands to get the results they want
2. Show the RESULTS first and foremost - that's what the user cares about
3. You can optionally show which commands you ran, but RESULTS are mandatory
4. Format commands in code blocks with triple backticks so they get executed automatically

Examples:
- User asks: "list my nginx forwarders"
- You say: "I'll check your nginx forwarders configuration."
- Then put the actual commands in code blocks with triple backticks
- The system will execute these and append the results

IMPORTANT RULES:
- ALWAYS execute commands to get results - don't just show what commands COULD be run
- The user wants RESULTS, not a tutorial on shell commands
- If you show a command in a code block, it WILL be executed automatically
- Focus on delivering the information the user requested

For other commands:
- Ask for approval before running arbitrary shell commands
- Example: "I can examine your nginx configuration. Would you like me to run: cat /etc/nginx/nginx.conf?"

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
        }
        catch (error) {
            console.error('AI processing error:', error);
            throw new Error(`Failed to process command: ${error}`);
        }
    }
    async executeCommand(shellCommand) {
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
        }
        catch (error) {
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
exports.AgentAICommandProcessor = AgentAICommandProcessor;
//# sourceMappingURL=ai-command-processor.js.map