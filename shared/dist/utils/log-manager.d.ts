export declare class LogManager {
    private logDir;
    private logFile;
    private retentionDays;
    constructor(baseDir: string, logFileName: string, retentionDays?: number);
    /**
     * Initialize logging - create directory, rotate existing logs, cleanup old logs
     */
    initialize(): Promise<string>;
    /**
     * Rotate existing log file to timestamped name
     */
    private rotateLog;
    /**
     * Delete logs older than retentionDays
     */
    private cleanupOldLogs;
    /**
     * Get the log file path
     */
    getLogPath(): string;
}
//# sourceMappingURL=log-manager.d.ts.map