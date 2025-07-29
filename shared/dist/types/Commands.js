"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandRisk = exports.CommandCategory = void 0;
var CommandCategory;
(function (CommandCategory) {
    CommandCategory["SERVICE"] = "service";
    CommandCategory["CONFIG"] = "config";
    CommandCategory["DEBUG"] = "debug";
    CommandCategory["SYSTEM"] = "system";
    CommandCategory["NETWORK"] = "network";
    CommandCategory["FILE"] = "file";
    CommandCategory["PROCESS"] = "process";
    CommandCategory["CONTAINER"] = "container";
})(CommandCategory || (exports.CommandCategory = CommandCategory = {}));
var CommandRisk;
(function (CommandRisk) {
    CommandRisk["LOW"] = "low";
    CommandRisk["MEDIUM"] = "medium";
    CommandRisk["HIGH"] = "high";
    CommandRisk["CRITICAL"] = "critical"; // System reboots, deletions
})(CommandRisk || (exports.CommandRisk = CommandRisk = {}));
//# sourceMappingURL=Commands.js.map