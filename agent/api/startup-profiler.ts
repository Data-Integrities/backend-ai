export class StartupProfiler {
    private startTime: number;
    private events: Array<{name: string, time: number, duration?: number}> = [];
    private lastEventTime: number;

    constructor() {
        this.startTime = Date.now();
        this.lastEventTime = this.startTime;
    }

    mark(eventName: string) {
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