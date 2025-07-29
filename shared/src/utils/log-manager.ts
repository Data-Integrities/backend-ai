import * as fs from 'fs';
import * as path from 'path';

export class LogManager {
    private logDir: string;
    private logFile: string;
    private retentionDays: number;

    constructor(baseDir: string, logFileName: string, retentionDays: number = 5) {
        // Go up one level from agent/manager to find/create logs directory
        const projectRoot = path.resolve(baseDir, '..');
        this.logDir = path.join(projectRoot, 'logs');
        this.logFile = path.join(this.logDir, logFileName);
        this.retentionDays = retentionDays;
    }

    /**
     * Initialize logging - create directory, rotate existing logs, cleanup old logs
     */
    async initialize(): Promise<string> {
        try {
            // Create logs directory if it doesn't exist
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
                console.log(`Created log directory: ${this.logDir}`);
            }

            // Rotate existing log if present
            if (fs.existsSync(this.logFile)) {
                await this.rotateLog();
            }

            // Clean up old logs
            await this.cleanupOldLogs();

            return this.logFile;
        } catch (error) {
            console.error('Failed to initialize logging:', error);
            // Fallback to /tmp if we can't create local logs
            return `/tmp/${path.basename(this.logFile)}`;
        }
    }

    /**
     * Rotate existing log file to timestamped name
     */
    private async rotateLog(): Promise<void> {
        try {
            const stats = fs.statSync(this.logFile);
            const mtime = stats.mtime;
            
            // Format: agent-2025-01-28-16-55-01.log
            const timestamp = mtime.toISOString()
                .replace(/T/, '-')
                .replace(/:/g, '-')
                .replace(/\..+/, '');
            
            const baseName = path.basename(this.logFile, '.log');
            const rotatedName = `${baseName}-${timestamp}.log`;
            const rotatedPath = path.join(this.logDir, rotatedName);
            
            fs.renameSync(this.logFile, rotatedPath);
            console.log(`Rotated log: ${this.logFile} -> ${rotatedPath}`);
        } catch (error) {
            console.error('Failed to rotate log:', error);
        }
    }

    /**
     * Delete logs older than retentionDays
     */
    private async cleanupOldLogs(): Promise<void> {
        try {
            const files = fs.readdirSync(this.logDir);
            const now = Date.now();
            const maxAge = this.retentionDays * 24 * 60 * 60 * 1000; // days to ms
            
            for (const file of files) {
                // Skip current log files
                if (file === 'agent.log' || file === 'manager.log') continue;
                
                // Check if it's a rotated log file
                if (file.includes('-') && file.endsWith('.log')) {
                    const filePath = path.join(this.logDir, file);
                    const stats = fs.statSync(filePath);
                    const age = now - stats.mtime.getTime();
                    
                    if (age > maxAge) {
                        fs.unlinkSync(filePath);
                        console.log(`Deleted old log: ${file} (${Math.floor(age / (24 * 60 * 60 * 1000))} days old)`);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to cleanup old logs:', error);
        }
    }

    /**
     * Get the log file path
     */
    getLogPath(): string {
        return this.logFile;
    }
}