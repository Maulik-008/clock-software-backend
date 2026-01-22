import { AnonymousUserService } from "./anonymous-user.service";
import logger from "../../config/logger";

/**
 * Scheduler for cleaning up inactive anonymous users
 * 
 * Runs cleanup every 30 minutes to remove users who have been inactive
 * for more than 30 minutes, helping manage database size and clean up
 * stale user records.
 * 
 * Requirement 14.3: Automatically disconnect users inactive for 30 minutes
 */
export class AnonymousUserScheduler {
    private static cleanupInterval: NodeJS.Timeout | null = null;
    private static readonly CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

    /**
     * Starts the cleanup scheduler
     * 
     * Runs immediately on start, then every 30 minutes thereafter.
     */
    static start(): void {
        if (this.cleanupInterval) {
            logger.info("Anonymous user cleanup scheduler already running");
            return;
        }

        logger.info("Starting anonymous user cleanup scheduler");

        // Run cleanup immediately on start
        this.runCleanup();

        // Schedule periodic cleanup every 30 minutes
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
            logger.info("Anonymous user cleanup scheduler stopped");
        }
    }

    /**
     * Runs the cleanup process
     * 
     * Calls AnonymousUserService.cleanupInactiveUsers() to remove users
     * who have been inactive for more than 30 minutes.
     */
    private static async runCleanup(): Promise<void> {
        try {
            logger.info("Running anonymous user cleanup...");
            const cleanedUpCount = await AnonymousUserService.cleanupInactiveUsers();
            logger.info(`Anonymous user cleanup completed - removed ${cleanedUpCount} inactive users`);
        } catch (error) {
            logger.error("Anonymous user cleanup failed:", error);
        }
    }
}
