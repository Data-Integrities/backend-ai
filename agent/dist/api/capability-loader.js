"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CapabilityLoader = void 0;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
class CapabilityLoader {
    constructor() {
        this.handlers = new Map();
        const baseDir = process.env.AGENT_DIR || (process.platform === 'linux' && !process.env.container ?
            '/opt/ai-agent/agent' :
            process.cwd());
        this.capabilitiesDir = path_1.default.join(baseDir, 'capabilities');
    }
    async loadCapabilities() {
        try {
            // Check if capabilities directory exists
            await promises_1.default.access(this.capabilitiesDir);
            // Load each capability
            const entries = await promises_1.default.readdir(this.capabilitiesDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    await this.loadCapability(entry.name);
                }
            }
        }
        catch (error) {
            console.log('No capabilities directory found or error loading capabilities:', error);
        }
    }
    async loadCapability(capabilityName) {
        try {
            const handlerPath = path_1.default.join(this.capabilitiesDir, capabilityName, 'handler');
            // Try to load the handler module
            const handlerModule = require(handlerPath);
            // Check if it exports the required functions
            if (handlerModule.parseDNSCommand && handlerModule.handleDNSCommand) {
                // DNS capability
                this.handlers.set('cloudflare-dns', {
                    canHandle: (command) => {
                        const parsed = handlerModule.parseDNSCommand(command);
                        return parsed !== null;
                    },
                    handle: handlerModule.handleDNSCommand
                });
                console.log(`Loaded capability: ${capabilityName}`);
            }
            else if (handlerModule.parseNginxCommand && handlerModule.handleNginxCommand) {
                // Nginx capability
                this.handlers.set('nginx-forwarders', {
                    canHandle: (command) => {
                        const parsed = handlerModule.parseNginxCommand(command);
                        return parsed !== null;
                    },
                    handle: handlerModule.handleNginxCommand
                });
                console.log(`Loaded capability: ${capabilityName}`);
            }
        }
        catch (error) {
            console.log(`Failed to load capability ${capabilityName}:`, error);
        }
    }
    async handleCommand(command) {
        // Check each handler to see if it can handle this command
        for (const [name, handler] of this.handlers) {
            if (handler.canHandle(command)) {
                console.log(`Using capability handler: ${name}`);
                return await handler.handle(command);
            }
        }
        // No handler found
        return null;
    }
    getLoadedCapabilities() {
        return Array.from(this.handlers.keys());
    }
}
exports.CapabilityLoader = CapabilityLoader;
//# sourceMappingURL=capability-loader.js.map