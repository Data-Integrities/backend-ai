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
export declare class ChatLogger {
    private logsDir;
    private activeChats;
    constructor(logsDir?: string);
    private ensureLogsDir;
    startNewChat(tabId: string, title: string, agents?: string[]): Promise<string>;
    logMessage(tabId: string, role: 'human' | 'assistant', text: string, agentName?: string): Promise<void>;
    private updateConversationMetadata;
    getAgentChatHistory(agentName: string): Promise<Array<{
        conversation: ChatConversation;
        firstMessage?: string;
        messageCount: number;
        filePath: string;
    }>>;
    loadChatHistory(filePath: string): Promise<{
        conversation: ChatConversation;
        messages: ChatMessage[];
    }>;
    restoreChatContext(filePath: string, includeLastN?: number): Promise<{
        summary: string;
        recentMessages: Array<{
            role: string;
            content: string;
        }>;
        contextMarkers: string[];
    }>;
    closeChat(tabId: string): Promise<void>;
}
//# sourceMappingURL=chat-logger.d.ts.map