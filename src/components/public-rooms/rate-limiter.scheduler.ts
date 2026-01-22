import { RateLimiterService } from "./rate-limiter.service";

/**
 * Scheduler for cleaning up expired rate limit records
 * Runs cleanup every 15 minutes to maintain database performance
 */
export class RateLimiterScheduler {
    private static cleanupInterval: NodeJS.Timeout | null = null;
    private static readonly CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

    /**
     * Starts the cleanup scheduler
     */
    static start(): void {
        if (this.cleanupInterval) {
            console.log("Rate limiter cleanup scheduler already running");
            return;
        }

        console.log("Starting rate limiter cleanup scheduler");

        // Run cleanup immediately on start
        this.runCleanup();

        // Schedule periodic cleanup
        this.cleanupInterval = setInterval(() => {
            this.runCleanup();
        }, this.CLEANUP_INTERVAL_MS);
    }

    /**
     * Stops the cleanup scheduler
     */
    static stop(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            console.log("Rate limiter cleanup scheduler stopped");
        }
    }

    /**
     * Runs the cleanup process
     */
    private static async runCleanup(): Promise<void> {
        try {
            console.log("Running rate limiter cleanup...");
            await RateLimiterService.cleanupExpiredRecords();
            console.log("Rate limiter cleanup completed");
        } catch (error) {
            console.error("Rate limiter cleanup failed:", error);
        }
    }
}
