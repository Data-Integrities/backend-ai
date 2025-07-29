"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class LogManager {
    constructor(baseDir, logFileName, retentionDays = 5) {
        // Go up one level from agent/manager to find/create logs directory
        const projectRoot = path.resolve(baseDir, '..');
        this.logDir = path.join(projectRoot, 'logs');
        this.logFile = path.join(this.logDir, logFileName);
        this.retentionDays = retentionDays;
    }
    /**
     * Initialize logging - create directory, rotate existing logs, cleanup old logs
     */
    async initialize() {
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
        }
        catch (error) {
            console.error('Failed to initialize logging:', error);
            // Fallback to /tmp if we can't create local logs
            return `/tmp/${path.basename(this.logFile)}`;
        }
    }
    /**
     * Rotate existing log file to timestamped name
     */
    async rotateLog() {
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
        }
        catch (error) {
            console.error('Failed to rotate log:', error);
        }
    }
    /**
     * Delete logs older than retentionDays
     */
    async cleanupOldLogs() {
        try {
            const files = fs.readdirSync(this.logDir);
            const now = Date.now();
            const maxAge = this.retentionDays * 24 * 60 * 60 * 1000; // days to ms
            for (const file of files) {
                // Skip current log files
                if (file === 'agent.log' || file === 'manager.log')
                    continue;
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
        }
        catch (error) {
            console.error('Failed to cleanup old logs:', error);
        }
    }
    /**
     * Get the log file path
     */
    getLogPath() {
        return this.logFile;
    }
}
exports.LogManager = LogManager;
//# sourceMappingURL=log-manager.js.map