"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatLogger = void 0;
exports.setupChatEndpoints = setupChatEndpoints;
const chat_logger_1 = require("./chat-logger");
let chatLogger;
function setupChatEndpoints(app) {
    // Initialize chat logger
    exports.chatLogger = chatLogger = new chat_logger_1.ChatLogger();
    // Start a new chat session
    app.post('/api/chat/start', async (req, res) => {
        try {
            const { tabId, title, agents } = req.body;
            if (!tabId || !title) {
                return res.status(400).json({ error: 'tabId and title are required' });
            }
            const chatId = await chatLogger.startNewChat(tabId, title, agents);
            res.json({
                success: true,
                chatId,
                message: 'Chat session started'
            });
        }
        catch (error) {
            console.error('Error starting chat:', error);
            res.status(500).json({ error: error.message });
        }
    });
    // Log a message
    app.post('/api/chat/message', async (req, res) => {
        try {
            const { tabId, role, text, agentName } = req.body;
            if (!tabId || !role || !text) {
                return res.status(400).json({ error: 'tabId, role, and text are required' });
            }
            await chatLogger.logMessage(tabId, role, text, agentName);
            res.json({
                success: true,
                message: 'Message logged'
            });
        }
        catch (error) {
            console.error('Error logging message:', error);
            res.status(500).json({ error: error.message });
        }
    });
    // Get agent chat history
    app.get('/api/chat/agent/:agentName', async (req, res) => {
        try {
            const { agentName } = req.params;
            const history = await chatLogger.getAgentChatHistory(agentName);
            res.json({
                success: true,
                chats: history
            });
        }
        catch (error) {
            console.error('Error getting agent history:', error);
            res.status(500).json({ error: error.message });
        }
    });
    // Load a specific chat
    app.get('/api/chat/load', async (req, res) => {
        try {
            const { filePath } = req.query;
            if (!filePath) {
                return res.status(400).json({ error: 'filePath is required' });
            }
            const chat = await chatLogger.loadChatHistory(filePath);
            res.json({
                success: true,
                ...chat
            });
        }
        catch (error) {
            console.error('Error loading chat:', error);
            res.status(500).json({ error: error.message });
        }
    });
    // Get context for resuming a chat
    app.get('/api/chat/context', async (req, res) => {
        try {
            const { filePath, lastN } = req.query;
            if (!filePath) {
                return res.status(400).json({ error: 'filePath is required' });
            }
            const context = await chatLogger.restoreChatContext(filePath, lastN ? parseInt(lastN) : 10);
            res.json({
                success: true,
                ...context
            });
        }
        catch (error) {
            console.error('Error getting context:', error);
            res.status(500).json({ error: error.message });
        }
    });
    // Close a chat session
    app.post('/api/chat/close', async (req, res) => {
        try {
            const { tabId } = req.body;
            if (!tabId) {
                return res.status(400).json({ error: 'tabId is required' });
            }
            await chatLogger.closeChat(tabId);
            res.json({
                success: true,
                message: 'Chat session closed'
            });
        }
        catch (error) {
            console.error('Error closing chat:', error);
            res.status(500).json({ error: error.message });
        }
    });
}
//# sourceMappingURL=chat-endpoints.js.map