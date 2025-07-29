#!/usr/bin/env node
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
console.log('[STARTUP] Process started at', new Date().toISOString());
var processStart = Date.now();
var startup_profiler_1 = require("./startup-profiler");
var profiler = new startup_profiler_1.StartupProfiler();
profiler.mark('Initial imports started');
var express_1 = require("express");
var child_process_1 = require("child_process");
var util_1 = require("util");
var dotenv_1 = require("dotenv");
var si = require("systeminformation");
var uuid_1 = require("uuid");
var axios_1 = require("axios");
var path_1 = require("path");
var capabilities_manager_1 = require("./capabilities-manager");
profiler.mark('Imports completed');
// Load environment variables
dotenv_1.default.config();
profiler.mark('Environment loaded');
var execAsync = (0, util_1.promisify)(child_process_1.exec);
var app = (0, express_1.default)();
var PORT = parseInt(process.env.PORT || '3080');
var AGENT_ID = process.env.AGENT_ID || "agent-".concat(require('os').hostname());
var HUB_URL = process.env.HUB_URL || 'http://192.168.1.30';
// Initialize capabilities manager
profiler.mark('Initializing capabilities manager');
var capabilitiesManager = new capabilities_manager_1.CapabilitiesManager();
profiler.mark('Capabilities manager initialized');
// Command tracking
var activeCommands = new Map();
profiler.mark('Setting up Express middleware');
app.use(express_1.default.json());
// Serve static files from gui directory
app.use(express_1.default.static(path_1.default.join(__dirname, '../../gui')));
profiler.mark('Express middleware configured');
// No authentication - internal infrastructure only
profiler.mark('Registering API routes');
// Status endpoint with full system info
app.get('/api/status', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var osInfo, currentLoad, mem, diskLayout, packageJson;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, si.osInfo()];
            case 1:
                osInfo = _a.sent();
                return [4 /*yield*/, si.currentLoad()];
            case 2:
                currentLoad = _a.sent();
                return [4 /*yield*/, si.mem()];
            case 3:
                mem = _a.sent();
                return [4 /*yield*/, si.diskLayout()];
            case 4:
                diskLayout = _a.sent();
                packageJson = require('../../package.json');
                res.json({
                    agentId: AGENT_ID,
                    status: 'online',
                    version: packageJson.version,
                    workingDirectory: process.cwd(),
                    platform: osInfo.platform,
                    hostname: osInfo.hostname,
                    timestamp: new Date().toISOString(),
                    system: {
                        os: osInfo.distro,
                        kernel: osInfo.kernel,
                        arch: osInfo.arch,
                        uptime: process.uptime()
                    },
                    resources: {
                        cpu: {
                            usage: currentLoad.currentLoad,
                            cores: currentLoad.cpus.length
                        },
                        memory: {
                            total: mem.total,
                            used: mem.used,
                            free: mem.free,
                            percentage: (mem.used / mem.total) * 100
                        },
                        disk: diskLayout.map(function (disk) { return ({
                            device: disk.device,
                            size: disk.size,
                            type: disk.type
                        }); })
                    }
                });
                return [2 /*return*/];
        }
    });
}); });
// Enhanced capabilities endpoint with service discovery and README system
app.get('/api/capabilities', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var services, osInfo, includeContent, capabilitiesData, _a, _b;
    var _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0: return [4 /*yield*/, discoverServices()];
            case 1:
                services = _e.sent();
                return [4 /*yield*/, si.osInfo()];
            case 2:
                osInfo = _e.sent();
                includeContent = req.query.includeContent;
                return [4 /*yield*/, capabilitiesManager.getCapabilities(includeContent === 'true')];
            case 3:
                capabilitiesData = _e.sent();
                _b = (_a = res).json;
                _c = {
                    agentId: AGENT_ID,
                    type: determineAgentType(osInfo.platform),
                    summary: "".concat(osInfo.platform, " host with ").concat(services.join(', '), " services")
                };
                _d = {
                    docker: services.includes('docker'),
                    systemd: osInfo.platform === 'linux',
                    filesystem: true
                };
                return [4 /*yield*/, isProxmox()];
            case 4:
                _b.apply(_a, [(_c.capabilities = (_d.proxmox = _e.sent(),
                        _d),
                        _c.services = services,
                        _c.supportedCommands = [
                            'service', 'config', 'debug', 'system', 'network', 'file', 'process'
                        ],
                        _c.description = "Agent running on ".concat(osInfo.distro, " ").concat(osInfo.release),
                        _c.examples = generateExamples(services),
                        // New README-based capabilities
                        _c.modules = capabilitiesData.capabilities,
                        _c.capabilitiesHash = capabilitiesData.hash,
                        _c.capabilitiesLastUpdated = capabilitiesData.lastUpdated,
                        _c)]);
                return [2 /*return*/];
        }
    });
}); });
// Get specific capability README
app.get('/api/capabilities/:path(*)', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var readmeContent, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, capabilitiesManager.getCapabilityReadme(req.params.path)];
            case 1:
                readmeContent = _a.sent();
                res.type('text/markdown').send(readmeContent);
                return [3 /*break*/, 3];
            case 2:
                error_1 = _a.sent();
                res.status(404).json({ error: error_1.message });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// Command execution with request ID tracking
app.post('/api/execute', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, command, _b, requestId, _c, async, parsedCommand, result, error_2;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                _a = req.body, command = _a.command, _b = _a.requestId, requestId = _b === void 0 ? (0, uuid_1.v4)() : _b, _c = _a.async, async = _c === void 0 ? false : _c;
                if (!command) {
                    return [2 /*return*/, res.status(400).json({ error: 'Command required' })];
                }
                return [4 /*yield*/, parseCommand(command)];
            case 1:
                parsedCommand = _d.sent();
                if (!async) return [3 /*break*/, 2];
                // Start async execution
                executeCommandAsync(parsedCommand, requestId);
                res.json({
                    requestId: requestId,
                    status: 'accepted',
                    message: 'Command accepted for async execution'
                });
                return [3 /*break*/, 5];
            case 2:
                _d.trys.push([2, 4, , 5]);
                return [4 /*yield*/, executeCommand(parsedCommand)];
            case 3:
                result = _d.sent();
                res.json(__assign(__assign({ requestId: requestId, success: true }, result), { timestamp: new Date().toISOString() }));
                return [3 /*break*/, 5];
            case 4:
                error_2 = _d.sent();
                res.json({
                    requestId: requestId,
                    success: false,
                    error: error_2.message,
                    timestamp: new Date().toISOString()
                });
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
// Get command status/result
app.get('/api/command/:requestId', function (req, res) {
    var requestId = req.params.requestId;
    var command = activeCommands.get(requestId);
    if (!command) {
        return res.status(404).json({ error: 'Command not found' });
    }
    res.json(command);
});
// Event notification endpoint - agent can POST events to hub
app.post('/api/events', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var event, error_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                event = req.body;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                // Send event to hub
                return [4 /*yield*/, notifyHub('event', event)];
            case 2:
                // Send event to hub
                _a.sent();
                res.json({ success: true });
                return [3 /*break*/, 4];
            case 3:
                error_3 = _a.sent();
                res.status(500).json({ error: 'Failed to send event to hub' });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// Service management endpoints
app.get('/api/services', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var services;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, getServiceStatus()];
            case 1:
                services = _a.sent();
                res.json(services);
                return [2 /*return*/];
        }
    });
}); });
app.post('/api/services/:service/:action', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, service, action, result, error_4;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.params, service = _a.service, action = _a.action;
                if (!['start', 'stop', 'restart', 'status'].includes(action)) {
                    return [2 /*return*/, res.status(400).json({ error: 'Invalid action' })];
                }
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, manageService(service, action)];
            case 2:
                result = _b.sent();
                res.json(result);
                return [3 /*break*/, 4];
            case 3:
                error_4 = _b.sent();
                res.status(500).json({ error: error_4.message });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// Get logs endpoint
app.get('/api/logs', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var lines, service, command, result, error_5;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                lines = parseInt(req.query.lines) || 100;
                service = req.query.service;
                command = void 0;
                if (service === 'agent') {
                    // Get agent's own logs (systemd)
                    command = "journalctl -u ai-agent.service -n ".concat(lines, " --no-pager");
                }
                else if (service) {
                    // Get specific service logs
                    command = "journalctl -u ".concat(service, " -n ").concat(lines, " --no-pager");
                }
                else {
                    // Get system logs
                    command = "journalctl -n ".concat(lines, " --no-pager");
                }
                return [4 /*yield*/, execAsync(command)];
            case 1:
                result = _a.sent();
                res.json({
                    service: service || 'system',
                    lines: lines,
                    logs: result.stdout,
                    timestamp: new Date().toISOString()
                });
                return [3 /*break*/, 3];
            case 2:
                error_5 = _a.sent();
                res.status(500).json({
                    error: 'Failed to fetch logs',
                    message: error_5.message
                });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// Update functionality removed - handled by agent manager
// Version endpoint
app.get('/api/version', function (req, res) {
    var packageJson = require('../../package.json');
    res.json({
        version: packageJson.version,
        name: packageJson.name,
        agentId: AGENT_ID,
        buildTime: process.env.BUILD_TIME || 'unknown'
    });
});
// Health check
app.get('/health', function (req, res) {
    res.send('OK');
});
// Helper functions
function discoverServices() {
    return __awaiter(this, void 0, void 0, function () {
        var services, commonServices, _i, commonServices_1, service, stdout, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    services = [];
                    commonServices = ['nginx', 'apache2', 'mysql', 'postgresql', 'redis', 'docker', 'ssh', 'systemd'];
                    _i = 0, commonServices_1 = commonServices;
                    _b.label = 1;
                case 1:
                    if (!(_i < commonServices_1.length)) return [3 /*break*/, 6];
                    service = commonServices_1[_i];
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, execAsync("which ".concat(service, " 2>/dev/null || systemctl is-enabled ").concat(service, " 2>/dev/null || service ").concat(service, " status 2>/dev/null"))];
                case 3:
                    stdout = (_b.sent()).stdout;
                    if (stdout.trim()) {
                        services.push(service);
                    }
                    return [3 /*break*/, 5];
                case 4:
                    _a = _b.sent();
                    return [3 /*break*/, 5];
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6: return [2 /*return*/, services];
            }
        });
    });
}
function determineAgentType(platform) {
    if (process.env.AGENT_TYPE) {
        return process.env.AGENT_TYPE;
    }
    // Auto-detect based on platform and environment
    if (platform === 'linux') {
        if (process.env.container === 'docker') {
            return 'docker-container';
        }
        return 'linux-host';
    }
    return platform;
}
function isProxmox() {
    return __awaiter(this, void 0, void 0, function () {
        var stdout, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, execAsync('test -f /etc/pve/version && echo "true"')];
                case 1:
                    stdout = (_b.sent()).stdout;
                    return [2 /*return*/, stdout.trim() === 'true'];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function generateExamples(services) {
    var examples = ['Check system status', 'View logs'];
    if (services.includes('docker')) {
        examples.push('List Docker containers', 'Manage Docker services');
    }
    if (services.includes('nginx')) {
        examples.push('Check nginx configuration', 'Reload nginx');
    }
    if (services.includes('mysql')) {
        examples.push('Check MySQL status', 'View MySQL logs');
    }
    return examples;
}
function parseCommand(command) {
    return __awaiter(this, void 0, void 0, function () {
        var lowerCommand, service, service;
        return __generator(this, function (_a) {
            // If it's already a shell command, return as-is
            if (command.startsWith('/') || command.includes('|') || command.includes('>')) {
                return [2 /*return*/, { type: 'shell', command: command }];
            }
            lowerCommand = command.toLowerCase();
            if (lowerCommand.includes('restart') && lowerCommand.includes('service')) {
                service = extractServiceName(command);
                return [2 /*return*/, { type: 'service', action: 'restart', service: service }];
            }
            if (lowerCommand.includes('check') && lowerCommand.includes('logs')) {
                service = extractServiceName(command);
                return [2 /*return*/, { type: 'logs', service: service }];
            }
            if (lowerCommand.includes('docker') && lowerCommand.includes('container')) {
                return [2 /*return*/, { type: 'shell', command: 'docker ps -a' }];
            }
            // Default to shell command
            return [2 /*return*/, { type: 'shell', command: command }];
        });
    });
}
function extractServiceName(command) {
    var words = command.split(' ');
    var serviceIndex = words.findIndex(function (w) { return ['nginx', 'apache', 'mysql', 'docker', 'redis'].includes(w.toLowerCase()); });
    return serviceIndex >= 0 ? words[serviceIndex] : 'unknown';
}
function executeCommand(parsed) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, logsCommand, _b, stdout, stderr, result;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _a = parsed.type;
                    switch (_a) {
                        case 'service': return [3 /*break*/, 1];
                        case 'logs': return [3 /*break*/, 3];
                        case 'shell': return [3 /*break*/, 5];
                    }
                    return [3 /*break*/, 5];
                case 1: return [4 /*yield*/, manageService(parsed.service, parsed.action)];
                case 2: return [2 /*return*/, _c.sent()];
                case 3:
                    logsCommand = "journalctl -u ".concat(parsed.service, " -n 50 --no-pager || tail -50 /var/log/").concat(parsed.service, "/*.log");
                    return [4 /*yield*/, execAsync(logsCommand)];
                case 4:
                    _b = _c.sent(), stdout = _b.stdout, stderr = _b.stderr;
                    return [2 /*return*/, { stdout: stdout, stderr: stderr }];
                case 5: return [4 /*yield*/, execAsync(parsed.command)];
                case 6:
                    result = _c.sent();
                    return [2 /*return*/, result];
            }
        });
    });
}
function executeCommandAsync(parsed, requestId) {
    return __awaiter(this, void 0, void 0, function () {
        var result, error_6;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    activeCommands.set(requestId, {
                        requestId: requestId,
                        status: 'running',
                        startTime: new Date().toISOString()
                    });
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 6]);
                    return [4 /*yield*/, executeCommand(parsed)];
                case 2:
                    result = _a.sent();
                    activeCommands.set(requestId, __assign(__assign({ requestId: requestId, status: 'completed', success: true }, result), { startTime: activeCommands.get(requestId).startTime, endTime: new Date().toISOString() }));
                    // Notify hub of completion
                    return [4 /*yield*/, notifyHub('command-result', __assign({ requestId: requestId, agentId: AGENT_ID, success: true }, result))];
                case 3:
                    // Notify hub of completion
                    _a.sent();
                    return [3 /*break*/, 6];
                case 4:
                    error_6 = _a.sent();
                    activeCommands.set(requestId, {
                        requestId: requestId,
                        status: 'failed',
                        success: false,
                        error: error_6.message,
                        startTime: activeCommands.get(requestId).startTime,
                        endTime: new Date().toISOString()
                    });
                    // Notify hub of failure
                    return [4 /*yield*/, notifyHub('command-result', {
                            requestId: requestId,
                            agentId: AGENT_ID,
                            success: false,
                            error: error_6.message
                        })];
                case 5:
                    // Notify hub of failure
                    _a.sent();
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function getServiceStatus() {
    return __awaiter(this, void 0, void 0, function () {
        var services, statuses, _i, services_1, service, stdout, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, discoverServices()];
                case 1:
                    services = _b.sent();
                    statuses = [];
                    _i = 0, services_1 = services;
                    _b.label = 2;
                case 2:
                    if (!(_i < services_1.length)) return [3 /*break*/, 7];
                    service = services_1[_i];
                    _b.label = 3;
                case 3:
                    _b.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, execAsync("systemctl is-active ".concat(service, " 2>/dev/null || service ").concat(service, " status 2>/dev/null | grep -q running && echo active || echo inactive"))];
                case 4:
                    stdout = (_b.sent()).stdout;
                    statuses.push({
                        name: service,
                        status: stdout.trim() === 'active' ? 'running' : 'stopped'
                    });
                    return [3 /*break*/, 6];
                case 5:
                    _a = _b.sent();
                    statuses.push({
                        name: service,
                        status: 'unknown'
                    });
                    return [3 /*break*/, 6];
                case 6:
                    _i++;
                    return [3 /*break*/, 2];
                case 7: return [2 /*return*/, statuses];
            }
        });
    });
}
function manageService(service, action) {
    return __awaiter(this, void 0, void 0, function () {
        var command, _a, stdout, stderr;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    command = '';
                    switch (action) {
                        case 'start':
                            command = "systemctl start ".concat(service, " || service ").concat(service, " start");
                            break;
                        case 'stop':
                            command = "systemctl stop ".concat(service, " || service ").concat(service, " stop");
                            break;
                        case 'restart':
                            command = "systemctl restart ".concat(service, " || service ").concat(service, " restart");
                            break;
                        case 'status':
                            command = "systemctl status ".concat(service, " || service ").concat(service, " status");
                            break;
                    }
                    return [4 /*yield*/, execAsync(command)];
                case 1:
                    _a = _b.sent(), stdout = _a.stdout, stderr = _a.stderr;
                    return [2 /*return*/, {
                            service: service,
                            action: action,
                            success: !stderr || stderr.length === 0,
                            output: stdout,
                            error: stderr
                        }];
            }
        });
    });
}
function notifyHub(type, data) {
    return __awaiter(this, void 0, void 0, function () {
        var error_7;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, axios_1.default.post("".concat(HUB_URL, "/api/notifications"), __assign({ type: type, agentId: AGENT_ID, timestamp: new Date().toISOString() }, data), {
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        })];
                case 1:
                    _a.sent();
                    return [3 /*break*/, 3];
                case 2:
                    error_7 = _a.sent();
                    console.error('Failed to notify hub:', error_7);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// Monitor system and send events
setInterval(function () { return __awaiter(void 0, void 0, void 0, function () {
    var currentLoad, mem, memUsage;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, si.currentLoad()];
            case 1:
                currentLoad = _a.sent();
                return [4 /*yield*/, si.mem()];
            case 2:
                mem = _a.sent();
                if (!(currentLoad.currentLoad > 80)) return [3 /*break*/, 4];
                return [4 /*yield*/, notifyHub('event', {
                        severity: 'warning',
                        message: "High CPU usage: ".concat(currentLoad.currentLoad.toFixed(1), "%"),
                        resource: 'cpu',
                        value: currentLoad.currentLoad
                    })];
            case 3:
                _a.sent();
                _a.label = 4;
            case 4:
                memUsage = (mem.used / mem.total) * 100;
                if (!(memUsage > 85)) return [3 /*break*/, 6];
                return [4 /*yield*/, notifyHub('event', {
                        severity: 'warning',
                        message: "High memory usage: ".concat(memUsage.toFixed(1), "%"),
                        resource: 'memory',
                        value: memUsage
                    })];
            case 5:
                _a.sent();
                _a.label = 6;
            case 6: return [2 /*return*/];
        }
    });
}); }, 60000); // Check every minute
profiler.mark('All routes registered');
// Start server
profiler.mark('Starting Express server');
app.listen(PORT, '0.0.0.0', function () { return __awaiter(void 0, void 0, void 0, function () {
    var error_8, report;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                profiler.mark('Express server listening');
                console.log("Enhanced HTTP Agent ".concat(AGENT_ID, " listening on port ").concat(PORT));
                console.log("Hub URL: ".concat(HUB_URL));
                console.log('Features: Authentication, Service Discovery, Command Parsing, Event Notifications');
                // Send initial registration to hub
                profiler.mark('Notifying hub - start');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, notifyHub('agent-online', {
                        capabilities: 'full'
                    })];
            case 2:
                _a.sent();
                profiler.mark('Hub notified successfully');
                return [3 /*break*/, 4];
            case 3:
                error_8 = _a.sent();
                profiler.mark('Hub notification failed');
                console.error('Failed to notify hub:', error_8);
                return [3 /*break*/, 4];
            case 4:
                report = profiler.getReport();
                console.log('\n=== STARTUP PROFILING REPORT ===');
                console.log("Total startup time: ".concat(report.totalStartupTime, "ms"));
                console.log('\nBreakdown:');
                report.events.forEach(function (e) {
                    console.log("  ".concat(e.name, ": ").concat(e.duration, "ms"));
                });
                console.log('================================\n');
                return [2 /*return*/];
        }
    });
}); });
// Handle shutdown
process.on('SIGTERM', function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log('Received SIGTERM, notifying hub and shutting down');
                return [4 /*yield*/, notifyHub('agent-offline', {})];
            case 1:
                _a.sent();
                process.exit(0);
                return [2 /*return*/];
        }
    });
}); });
process.on('SIGINT', function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log('Received SIGINT, notifying hub and shutting down');
                return [4 /*yield*/, notifyHub('agent-offline', {})];
            case 1:
                _a.sent();
                process.exit(0);
                return [2 /*return*/];
        }
    });
}); });
