"use strict";
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
exports.CapabilitiesManager = void 0;
var promises_1 = require("fs/promises");
var path_1 = require("path");
var crypto_1 = require("crypto");
var CapabilitiesManager = /** @class */ (function () {
    function CapabilitiesManager() {
        this.cacheData = null;
        // Determine capabilities directory based on environment
        var baseDir = process.env.AGENT_DIR || (process.platform === 'linux' && !process.env.container ?
            '/opt/ai-agent/agent' :
            process.cwd());
        this.capabilitiesDir = path_1.default.join(baseDir, 'capabilities');
    }
    CapabilitiesManager.prototype.ensureCapabilitiesDir = function () {
        return __awaiter(this, void 0, void 0, function () {
            var mainReadme, _a, hostname, defaultContent, error_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 7, , 8]);
                        return [4 /*yield*/, promises_1.default.mkdir(this.capabilitiesDir, { recursive: true })];
                    case 1:
                        _b.sent();
                        mainReadme = path_1.default.join(this.capabilitiesDir, 'README.md');
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 4, , 6]);
                        return [4 /*yield*/, promises_1.default.access(mainReadme)];
                    case 3:
                        _b.sent();
                        return [3 /*break*/, 6];
                    case 4:
                        _a = _b.sent();
                        hostname = require('os').hostname();
                        defaultContent = "# ".concat(hostname, " Agent Capabilities\n\nThis agent has the following capabilities installed:\n\n_No additional capabilities installed yet._\n");
                        return [4 /*yield*/, promises_1.default.writeFile(mainReadme, defaultContent)];
                    case 5:
                        _b.sent();
                        return [3 /*break*/, 6];
                    case 6: return [3 /*break*/, 8];
                    case 7:
                        error_1 = _b.sent();
                        console.error('Failed to ensure capabilities directory:', error_1);
                        return [3 /*break*/, 8];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    CapabilitiesManager.prototype.getCapabilities = function () {
        return __awaiter(this, arguments, void 0, function (includeContent) {
            var capabilities, mainReadmePath, mainContent, linkRegex, match, name_1, folder, description, capPath, capability, _a, _b, hashContent, hash, error_2;
            if (includeContent === void 0) { includeContent = false; }
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.ensureCapabilitiesDir()];
                    case 1:
                        _c.sent();
                        capabilities = [];
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 10, , 11]);
                        mainReadmePath = path_1.default.join(this.capabilitiesDir, 'README.md');
                        return [4 /*yield*/, promises_1.default.readFile(mainReadmePath, 'utf-8')];
                    case 3:
                        mainContent = _c.sent();
                        linkRegex = /\[([^\]]+)\]\(\.\/([^\/]+)\/README\.md\)\s*\n([^\n]+)/g;
                        match = void 0;
                        _c.label = 4;
                    case 4:
                        if (!((match = linkRegex.exec(mainContent)) !== null)) return [3 /*break*/, 9];
                        name_1 = match[1], folder = match[2], description = match[3];
                        capPath = path_1.default.join(this.capabilitiesDir, folder, 'README.md');
                        capability = {
                            name: name_1,
                            description: description,
                            readmePath: "".concat(folder, "/README.md")
                        };
                        if (!includeContent) return [3 /*break*/, 8];
                        _c.label = 5;
                    case 5:
                        _c.trys.push([5, 7, , 8]);
                        _a = capability;
                        return [4 /*yield*/, promises_1.default.readFile(capPath, 'utf-8')];
                    case 6:
                        _a.readmeContent = _c.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        _b = _c.sent();
                        capability.readmeContent = '_README not found_';
                        return [3 /*break*/, 8];
                    case 8:
                        capabilities.push(capability);
                        return [3 /*break*/, 4];
                    case 9:
                        hashContent = JSON.stringify(capabilities.map(function (c) { return ({
                            name: c.name,
                            path: c.readmePath
                        }); }));
                        hash = crypto_1.default.createHash('md5').update(hashContent).digest('hex');
                        this.cacheData = {
                            capabilities: capabilities,
                            hash: hash,
                            lastUpdated: new Date().toISOString()
                        };
                        return [2 /*return*/, this.cacheData];
                    case 10:
                        error_2 = _c.sent();
                        console.error('Failed to read capabilities:', error_2);
                        return [2 /*return*/, {
                                capabilities: [],
                                hash: 'error',
                                lastUpdated: new Date().toISOString()
                            }];
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    CapabilitiesManager.prototype.getCapabilityReadme = function (capabilityPath) {
        return __awaiter(this, void 0, void 0, function () {
            var fullPath, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        fullPath = path_1.default.join(this.capabilitiesDir, capabilityPath);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, promises_1.default.readFile(fullPath, 'utf-8')];
                    case 2: return [2 /*return*/, _a.sent()];
                    case 3:
                        error_3 = _a.sent();
                        throw new Error("Capability README not found: ".concat(capabilityPath));
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    CapabilitiesManager.prototype.addCapability = function (name, folder, description, readmeContent) {
        return __awaiter(this, void 0, void 0, function () {
            var capDir, mainReadmePath, mainContent, newEntry;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureCapabilitiesDir()];
                    case 1:
                        _a.sent();
                        capDir = path_1.default.join(this.capabilitiesDir, folder);
                        return [4 /*yield*/, promises_1.default.mkdir(capDir, { recursive: true })];
                    case 2:
                        _a.sent();
                        // Write capability README
                        return [4 /*yield*/, promises_1.default.writeFile(path_1.default.join(capDir, 'README.md'), readmeContent)];
                    case 3:
                        // Write capability README
                        _a.sent();
                        mainReadmePath = path_1.default.join(this.capabilitiesDir, 'README.md');
                        return [4 /*yield*/, promises_1.default.readFile(mainReadmePath, 'utf-8')];
                    case 4:
                        mainContent = _a.sent();
                        // Remove placeholder if exists
                        mainContent = mainContent.replace('_No additional capabilities installed yet._', '');
                        newEntry = "\n## [".concat(name, "](./").concat(folder, "/README.md)\n").concat(description, "\n");
                        mainContent += newEntry;
                        return [4 /*yield*/, promises_1.default.writeFile(mainReadmePath, mainContent)];
                    case 5:
                        _a.sent();
                        // Clear cache
                        this.cacheData = null;
                        return [2 /*return*/];
                }
            });
        });
    };
    return CapabilitiesManager;
}());
exports.CapabilitiesManager = CapabilitiesManager;
