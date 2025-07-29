export declare class StartupProfiler {
    private startTime;
    private events;
    private lastEventTime;
    constructor();
    mark(eventName: string): void;
    getReport(): {
        totalStartupTime: number;
        events: {
            name: string;
            time: number;
            duration?: number;
        }[];
        summary: string;
    };
}
//# sourceMappingURL=startup-profiler.d.ts.map