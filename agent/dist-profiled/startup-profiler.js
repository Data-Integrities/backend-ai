"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StartupProfiler = void 0;
var StartupProfiler = /** @class */ (function () {
    function StartupProfiler() {
        this.events = [];
        this.startTime = Date.now();
        this.lastEventTime = this.startTime;
    }
    StartupProfiler.prototype.mark = function (eventName) {
        var now = Date.now();
        var duration = now - this.lastEventTime;
        this.events.push({
            name: eventName,
            time: now - this.startTime,
            duration: duration
        });
        this.lastEventTime = now;
        // Log immediately for real-time tracking
        console.log("[PROFILE] ".concat(eventName, ": +").concat(duration, "ms (total: ").concat(now - this.startTime, "ms)"));
    };
    StartupProfiler.prototype.getReport = function () {
        var totalTime = Date.now() - this.startTime;
        return {
            totalStartupTime: totalTime,
            events: this.events,
            summary: this.events.map(function (e) { return "".concat(e.name, ": ").concat(e.duration, "ms"); }).join('\n')
        };
    };
    return StartupProfiler;
}());
exports.StartupProfiler = StartupProfiler;
