"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StartupProfiler = void 0;
class StartupProfiler {
    constructor() {
        this.events = [];
        this.startTime = Date.now();
        this.lastEventTime = this.startTime;
    }
    mark(eventName) {
        const now = Date.now();
        const duration = now - this.lastEventTime;
        this.events.push({
            name: eventName,
            time: now - this.startTime,
            duration
        });
        this.lastEventTime = now;
        // Log immediately for real-time tracking
        console.log(`[PROFILE] ${eventName}: +${duration}ms (total: ${now - this.startTime}ms)`);
    }
    getReport() {
        const totalTime = Date.now() - this.startTime;
        return {
            totalStartupTime: totalTime,
            events: this.events,
            summary: this.events.map(e => `${e.name}: ${e.duration}ms`).join('\n')
        };
    }
}
exports.StartupProfiler = StartupProfiler;
//# sourceMappingURL=startup-profiler.js.map