export declare class TokenCalculator {
    /**
     * Rough estimation of tokens for a message
     * Based on OpenAI's approximation: 1 token ≈ 4 characters
     */
    static estimateTokens(text: string): number;
    /**
     * Calculate tokens for a conversation
     */
    static calculateConversationTokens(messages: any[]): {
        total: number;
        breakdown: Array<{
            role: string;
            preview: string;
            tokens: number;
        }>;
        summary: {
            userTokens: number;
            assistantTokens: number;
            systemTokens: number;
        };
    };
    /**
     * Format token count with cost estimation
     * Claude 3 Opus pricing: $15/M input tokens, $75/M output tokens
     */
    static formatTokensWithCost(tokens: number, isOutput?: boolean): string;
}
//# sourceMappingURL=token-calculator.d.ts.map