"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatLogger = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
class ChatLogger {
    constructor(logsDir = '/opt/backend-ai/hub/chat-logs') {
        this.logsDir = logsDir;
        this.activeChats = new Map();
        this.ensureLogsDir();
    }
    async ensureLogsDir() {
        try {
            await promises_1.default.access(this.logsDir);
        }
        catch {
            await promises_1.default.mkdir(this.logsDir, { recursive: true });
        }
    }
    async startNewChat(tabId, title, agents = []) {
        const chatId = (0, uuid_1.v4)();
        const timestamp = new Date().toISOString();
        const filename = `${timestamp.split('T')[0]}_${chatId}.jsonl`;
        const filePath = path_1.default.join(this.logsDir, filename);
        const conversation = {
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
        await promises_1.default.appendFile(filePath, JSON.stringify(conversation) + '\n');
        // Track active chat
        this.activeChats.set(tabId, filePath);
        return chatId;
    }
    async logMessage(tabId, role, text, agentName) {
        const filePath = this.activeChats.get(tabId);
        if (!filePath) {
            console.warn(`No active chat for tab ${tabId}`);
            return;
        }
        const message = {
            uuid: `msg-${(0, uuid_1.v4)()}`,
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
        await promises_1.default.appendFile(filePath, JSON.stringify(message) + '\n');
        // Update conversation metadata
        await this.updateConversationMetadata(filePath);
    }
    async updateConversationMetadata(filePath) {
        const content = await promises_1.default.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n');
        if (lines.length < 1)
            return;
        const conversation = JSON.parse(lines[0]);
        conversation.updated_at = new Date().toISOString();
        conversation.metadata.lastMessageCount = lines.length - 1;
        // Rewrite file with updated header
        lines[0] = JSON.stringify(conversation);
        await promises_1.default.writeFile(filePath, lines.join('\n') + '\n');
    }
    async getAgentChatHistory(agentName) {
        const files = await promises_1.default.readdir(this.logsDir);
        const chats = [];
        for (const file of files) {
            if (!file.endsWith('.jsonl'))
                continue;
            const filePath = path_1.default.join(this.logsDir, file);
            const content = await promises_1.default.readFile(filePath, 'utf-8');
            const lines = content.trim().split('\n');
            if (lines.length === 0)
                continue;
            const conversation = JSON.parse(lines[0]);
            // Check if this chat involves the agent
            let involvesAgent = false;
            if (conversation.metadata?.agents?.includes(agentName)) {
                involvesAgent = true;
            }
            else {
                // Check messages for agent involvement
                for (let i = 1; i < lines.length; i++) {
                    const msg = JSON.parse(lines[i]);
                    if (msg.metadata?.agentName === agentName) {
                        involvesAgent = true;
                        break;
                    }
                }
            }
            if (involvesAgent) {
                let firstMessage = '';
                if (lines.length > 1) {
                    const firstMsg = JSON.parse(lines[1]);
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
        return chats.sort((a, b) => new Date(b.conversation.updated_at).getTime() -
            new Date(a.conversation.updated_at).getTime());
    }
    async loadChatHistory(filePath) {
        const content = await promises_1.default.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n');
        if (lines.length === 0) {
            throw new Error('Empty chat file');
        }
        const conversation = JSON.parse(lines[0]);
        const messages = [];
        for (let i = 1; i < lines.length; i++) {
            messages.push(JSON.parse(lines[i]));
        }
        return { conversation, messages };
    }
    async restoreChatContext(filePath, includeLastN = 10) {
        const { conversation, messages } = await this.loadChatHistory(filePath);
        // Get last N messages for context
        const recentMessages = messages.slice(-includeLastN).map(msg => ({
            role: msg.role,
            content: msg.content[0].text
        }));
        // Extract context markers (you could enhance this with AI summarization)
        const contextMarkers = [];
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
    async closeChat(tabId) {
        this.activeChats.delete(tabId);
    }
}
exports.ChatLogger = ChatLogger;
//# sourceMappingURL=chat-logger.js.map