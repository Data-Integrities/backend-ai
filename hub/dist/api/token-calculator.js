"use strict";
// Token calculator for estimating API usage
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenCalculator = void 0;
class TokenCalculator {
    /**
     * Rough estimation of tokens for a message
     * Based on OpenAI's approximation: 1 token ≈ 4 characters
     */
    static estimateTokens(text) {
        // More accurate estimation considering:
        // - Whitespace and punctuation use fewer tokens
        // - Code blocks might use more tokens
        // - Special characters and formatting
        const charCount = text.length;
        const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
        // Use a weighted average of character and word-based estimates
        const charBasedEstimate = charCount / 4;
        const wordBasedEstimate = wordCount * 1.3; // 1 word ≈ 1.3 tokens
        // Weight character estimate more for code-heavy content
        const hasCode = text.includes('```') || text.includes('    ');
        const weight = hasCode ? 0.7 : 0.5;
        return Math.ceil(charBasedEstimate * weight + wordBasedEstimate * (1 - weight));
    }
    /**
     * Calculate tokens for a conversation
     */
    static calculateConversationTokens(messages) {
        const breakdown = [];
        let userTokens = 0;
        let assistantTokens = 0;
        let systemTokens = 0;
        for (const message of messages) {
            const content = typeof message.content === 'string'
                ? message.content
                : message.content[0]?.text || '';
            const tokens = this.estimateTokens(content);
            const preview = content.substring(0, 50) + (content.length > 50 ? '...' : '');
            breakdown.push({
                role: message.role,
                preview,
                tokens
            });
            switch (message.role) {
                case 'user':
                case 'human':
                    userTokens += tokens;
                    break;
                case 'assistant':
                case 'ai':
                    assistantTokens += tokens;
                    break;
                case 'system':
                    systemTokens += tokens;
                    break;
            }
        }
        return {
            total: userTokens + assistantTokens + systemTokens,
            breakdown,
            summary: {
                userTokens,
                assistantTokens,
                systemTokens
            }
        };
    }
    /**
     * Format token count with cost estimation
     * Claude 3 Opus pricing: $15/M input tokens, $75/M output tokens
     */
    static formatTokensWithCost(tokens, isOutput = false) {
        const costPerMillion = isOutput ? 75 : 15;
        const cost = (tokens / 1000000) * costPerMillion;
        return `${tokens.toLocaleString()} tokens (~$${cost.toFixed(4)})`;
    }
}
exports.TokenCalculator = TokenCalculator;
//# sourceMappingURL=token-calculator.js.map