import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface ChatMessage {
    uuid: string;
    role: 'human' | 'assistant';
    content: Array<{
        type: 'text';
        text: string;
    }>;
    created_at: string;
    metadata?: {
        agentName?: string;
        tabId?: string;
        correlationId?: string;
    };
}

export interface ChatConversation {
    uuid: string;
    name: string;
    summary: string;
    created_at: string;
    updated_at: string;
    model: string;
    conversation_template: string;
    is_starred: boolean;
    has_attachments: boolean;
    metadata?: {
        agents: string[];
        tabId: string;
        lastMessageCount?: number;
    };
}

export class ChatLogger {
    private logsDir: string;
    private activeChats: Map<string, string>; // tabId -> filePath

    constructor(logsDir: string = '/opt/backend-ai/hub/chat-logs') {
        this.logsDir = logsDir;
        this.activeChats = new Map();
        this.ensureLogsDir();
    }

    private async ensureLogsDir(): Promise<void> {
        try {
            await fs.access(this.logsDir);
        } catch {
            await fs.mkdir(this.logsDir, { recursive: true });
        }
    }

    async startNewChat(tabId: string, title: string, agents: string[] = []): Promise<string> {
        const chatId = uuidv4();
        const timestamp = new Date().toISOString();
        const filename = `${timestamp.split('T')[0]}_${chatId}.jsonl`;
        const filePath = path.join(this.logsDir, filename);

        const conversation: ChatConversation = {
            uuid: chatId,
            name: title,
            summary: title,
            created_at: timestamp,
            updated_at: timestamp,
            model: 'backend-ai-agent',
            conversation_template: 'infrastructure',
            is_starred: false,
            has_attachments: false,
            metadata: {
                agents: agents,
                tabId: tabId,
                lastMessageCount: 0
            }
        };

        // Write header line
        await fs.appendFile(filePath, JSON.stringify(conversation) + '\n');
        
        // Track active chat
        this.activeChats.set(tabId, filePath);
        
        return chatId;
    }

    async logMessage(tabId: string, role: 'human' | 'assistant', text: string, agentName?: string): Promise<void> {
        const filePath = this.activeChats.get(tabId);
        if (!filePath) {
            console.warn(`No active chat for tab ${tabId}`);
            return;
        }

        const message: ChatMessage = {
            uuid: `msg-${uuidv4()}`,
            role: role,
            content: [{
                type: 'text',
                text: text
            }],
            created_at: new Date().toISOString(),
            metadata: {
                tabId: tabId,
                agentName: agentName
            }
        };

        await fs.appendFile(filePath, JSON.stringify(message) + '\n');
        
        // Update conversation metadata
        await this.updateConversationMetadata(filePath);
    }

    private async updateConversationMetadata(filePath: string): Promise<void> {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n');
        
        if (lines.length < 1) return;
        
        const conversation = JSON.parse(lines[0]) as ChatConversation;
        conversation.updated_at = new Date().toISOString();
        conversation.metadata!.lastMessageCount = lines.length - 1;
        
        // Rewrite file with updated header
        lines[0] = JSON.stringify(conversation);
        await fs.writeFile(filePath, lines.join('\n') + '\n');
    }

    async getAgentChatHistory(agentName: string): Promise<Array<{
        conversation: ChatConversation;
        firstMessage?: string;
        messageCount: number;
        filePath: string;
    }>> {
        const files = await fs.readdir(this.logsDir);
        const chats = [];
        
        for (const file of files) {
            if (!file.endsWith('.jsonl')) continue;
            
            const filePath = path.join(this.logsDir, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const lines = content.trim().split('\n');
            
            if (lines.length === 0) continue;
            
            const conversation = JSON.parse(lines[0]) as ChatConversation;
            
            // Check if this chat involves the agent
            let involvesAgent = false;
            if (conversation.metadata?.agents?.includes(agentName)) {
                involvesAgent = true;
            } else {
                // Check messages for agent involvement
                for (let i = 1; i < lines.length; i++) {
                    const msg = JSON.parse(lines[i]) as ChatMessage;
                    if (msg.metadata?.agentName === agentName) {
                        involvesAgent = true;
                        break;
                    }
                }
            }
            
            if (involvesAgent) {
                let firstMessage = '';
                if (lines.length > 1) {
                    const firstMsg = JSON.parse(lines[1]) as ChatMessage;
                    firstMessage = firstMsg.content[0].text.substring(0, 100);
                }
                
                chats.push({
                    conversation,
                    firstMessage,
                    messageCount: lines.length - 1,
                    filePath
                });
            }
        }
        
        // Sort by updated_at descending
        return chats.sort((a, b) => 
            new Date(b.conversation.updated_at).getTime() - 
            new Date(a.conversation.updated_at).getTime()
        );
    }

    async loadChatHistory(filePath: string): Promise<{
        conversation: ChatConversation;
        messages: ChatMessage[];
    }> {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n');
        
        if (lines.length === 0) {
            throw new Error('Empty chat file');
        }
        
        const conversation = JSON.parse(lines[0]) as ChatConversation;
        const messages: ChatMessage[] = [];
        
        for (let i = 1; i < lines.length; i++) {
            messages.push(JSON.parse(lines[i]) as ChatMessage);
        }
        
        return { conversation, messages };
    }

    async restoreChatContext(filePath: string, includeLastN: number = 10): Promise<{
        summary: string;
        recentMessages: Array<{ role: string; content: string }>;
        contextMarkers: string[];
    }> {
        const { conversation, messages } = await this.loadChatHistory(filePath);
        
        // Get last N messages for context
        const recentMessages = messages.slice(-includeLastN).map(msg => ({
            role: msg.role,
            content: msg.content[0].text
        }));
        
        // Extract context markers (you could enhance this with AI summarization)
        const contextMarkers: string[] = [];
        messages.forEach(msg => {
            // Simple keyword extraction - could be enhanced
            const text = msg.content[0].text.toLowerCase();
            if (text.includes('nginx') && !contextMarkers.includes('nginx-config')) {
                contextMarkers.push('nginx-config');
            }
            if (text.includes('ssl') && !contextMarkers.includes('ssl-setup')) {
                contextMarkers.push('ssl-setup');
            }
            // Add more context detection as needed
        });
        
        return {
            summary: conversation.summary,
            recentMessages,
            contextMarkers
        };
    }

    async closeChat(tabId: string): Promise<void> {
        this.activeChats.delete(tabId);
    }
}