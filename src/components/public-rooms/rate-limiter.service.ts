import { PRISMA_DB_CLIENT } from "../../prisma";
import { SecurityService, SuspiciousActivityType } from "./security.service";
import logger from "../../config/logger";

/**
 * Rate limit action types
 */
export enum RateLimitAction {
    API_REQUEST = "api_request",
    CHAT_MESSAGE = "chat_message",
    JOIN_ATTEMPT = "join_attempt",
}

/**
 * Rate limit configuration for different actions
 */
interface RateLimitConfig {
    maxAttempts: number;
    windowMs: number;
    blockDurationMs: number;
}

/**
 * Rate limit result returned to callers
 */
export interface RateLimitResult {
    allowed: boolean;
    remainingAttempts: number;
    resetTime?: Date;
    blockedUntil?: Date;
}

/**
 * In-memory cache entry for rate limiting
 */
interface RateLimitCacheEntry {
    attempts: number;
    windowStart: number;
    blockedUntil?: number;
}

/**
 * RateLimiterService handles rate limiting for public study rooms
 * Implements in-memory caching with database persistence
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4, 13.1, 13.2
 */
export class RateLimiterService {
    // In-memory cache for fast lookups
    private static cache: Map<string, RateLimitCacheEntry> = new Map();

    // Rate limit configurations
    private static readonly configs: Record<RateLimitAction, RateLimitConfig> = {
        [RateLimitAction.API_REQUEST]: {
            maxAttempts: 100,
            windowMs: 60 * 1000, // 1 minute
            blockDurationMs: 60 * 1000, // 60 seconds
        },
        [RateLimitAction.CHAT_MESSAGE]: {
            maxAttempts: 10,
            windowMs: 60 * 1000, // 1 minute
            blockDurationMs: 30 * 1000, // 30 seconds
        },
        [RateLimitAction.JOIN_ATTEMPT]: {
            maxAttempts: 5,
            windowMs: 60 * 1000, // 1 minute
            blockDurationMs: 5 * 60 * 1000, // 5 minutes
        },
    };

    /**
     * Checks if an IP address is allowed to perform an action
     * Requirement 11.1: API rate limiting (100 requests/minute per endpoint)
     * Requirement 11.3: Chat rate limiting (10 messages/minute)
     * Requirement 13.1: Join attempt limiting (5 attempts/minute)
     * 
     * @param ipAddress - The IP address to check
     * @param action - The action being performed
     * @returns RateLimitResult indicating if the action is allowed
     */
    static async checkRateLimit(
        ipAddress: string,
        action: RateLimitAction
    ): Promise<RateLimitResult> {
        const hashedIp = SecurityService.hashIpAddress(ipAddress);
        const config = this.configs[action];
        const cacheKey = `${hashedIp}:${action}`;
        const now = Date.now();

        // Check if IP is blocked
        const blockStatus = await this.isIpBlocked(hashedIp, action);
        if (blockStatus.isBlocked) {
            return {
                allowed: false,
                remainingAttempts: 0,
                blockedUntil: blockStatus.blockedUntil,
            };
        }

        // Get or create cache entry
        let cacheEntry = this.cache.get(cacheKey);

        // If no cache entry or window expired, create new one
        if (!cacheEntry || now - cacheEntry.windowStart > config.windowMs) {
            cacheEntry = {
                attempts: 0,
                windowStart: now,
            };
            this.cache.set(cacheKey, cacheEntry);
        }

        // Check if limit exceeded
        if (cacheEntry.attempts >= config.maxAttempts) {
            // Block the IP
            const blockedUntil = new Date(now + config.blockDurationMs);
            await this.blockIp(hashedIp, action, blockedUntil);

            // Log suspicious activity for rate limit violation
            await SecurityService.logSuspiciousActivity(
                ipAddress,
                SuspiciousActivityType.RATE_LIMIT_VIOLATION,
                `Exceeded ${action} limit: ${config.maxAttempts} attempts in ${config.windowMs}ms`
            );

            logger.warn(`Rate limit exceeded for IP ${hashedIp.substring(0, 8)}... on action ${action}`);

            return {
                allowed: false,
                remainingAttempts: 0,
                blockedUntil,
            };
        }

        // Increment attempts
        cacheEntry.attempts++;

        // Persist to database (async, don't wait)
        this.persistRateLimit(hashedIp, action, cacheEntry).catch((error) => {
            console.error("Failed to persist rate limit:", error);
        });

        const remainingAttempts = config.maxAttempts - cacheEntry.attempts;
        const resetTime = new Date(cacheEntry.windowStart + config.windowMs);

        return {
            allowed: true,
            remainingAttempts,
            resetTime,
        };
    }

    /**
     * Records a rate limit violation
     * Requirement 11.2: Block requests for 60 seconds after API rate limit exceeded
     * Requirement 11.4: Block messages for 30 seconds after chat rate limit exceeded
     * Requirement 13.2: Block IP for 5 minutes after join attempt limit exceeded
     * 
     * @param ipAddress - The IP address that violated the limit
     * @param action - The action that was rate limited
     */
    static async recordRateLimitViolation(
        ipAddress: string,
        action: RateLimitAction
    ): Promise<void> {
        const hashedIp = SecurityService.hashIpAddress(ipAddress);
        const config = this.configs[action];
        const blockedUntil = new Date(Date.now() + config.blockDurationMs);

        await this.blockIp(hashedIp, action, blockedUntil);

        // Log suspicious activity
        await SecurityService.logSuspiciousActivity(
            ipAddress,
            SuspiciousActivityType.RATE_LIMIT_VIOLATION,
            `Rate limit violation for action: ${action}`
        );
    }

    /**
     * Checks if an IP should be permanently blocked due to repeated violations
     * Implements IP blocking for repeated violations (Requirement 13.4)
     * 
     * @param ipAddress - The IP address to check
     * @returns true if IP should be blocked, false otherwise
     */
    static async shouldBlockIpPermanently(ipAddress: string): Promise<boolean> {
        const suspiciousActivityCount = await SecurityService.getSuspiciousActivityCount(ipAddress);
        
        // Block if more than 10 suspicious activities in the last hour
        if (suspiciousActivityCount > 10) {
            logger.warn(`IP ${SecurityService.hashIpAddress(ipAddress).substring(0, 8)}... flagged for permanent block due to ${suspiciousActivityCount} violations`);
            
            await SecurityService.logSuspiciousActivity(
                ipAddress,
                SuspiciousActivityType.MULTIPLE_BLOCKS,
                `${suspiciousActivityCount} violations in the last hour`
            );
            
            return true;
        }
        
        return false;
    }

    /**
     * Checks if an IP is currently blocked for an action
     * 
     * @param hashedIp - The hashed IP address
     * @param action - The action to check
     * @returns Object indicating if IP is blocked and until when
     */
    private static async isIpBlocked(
        hashedIp: string,
        action: RateLimitAction
    ): Promise<{ isBlocked: boolean; blockedUntil?: Date }> {
        const now = new Date();

        // Check database for block status
        const record = await PRISMA_DB_CLIENT.rateLimitRecord.findUnique({
            where: {
                hashedIp_action: {
                    hashedIp,
                    action,
                },
            },
        });

        if (record?.blockedUntil && record.blockedUntil > now) {
            return {
                isBlocked: true,
                blockedUntil: record.blockedUntil,
            };
        }

        return { isBlocked: false };
    }

    /**
     * Blocks an IP address for a specific action
     * 
     * @param hashedIp - The hashed IP address to block
     * @param action - The action to block
     * @param blockedUntil - When the block expires
     */
    private static async blockIp(
        hashedIp: string,
        action: RateLimitAction,
        blockedUntil: Date
    ): Promise<void> {
        await PRISMA_DB_CLIENT.rateLimitRecord.upsert({
            where: {
                hashedIp_action: {
                    hashedIp,
                    action,
                },
            },
            update: {
                blockedUntil,
                attempts: 0,
                windowStart: new Date(),
            },
            create: {
                hashedIp,
                action,
                blockedUntil,
                attempts: 0,
                windowStart: new Date(),
            },
        });

        // Update cache to reflect block
        const cacheKey = `${hashedIp}:${action}`;
        const cacheEntry = this.cache.get(cacheKey);
        if (cacheEntry) {
            cacheEntry.blockedUntil = blockedUntil.getTime();
        }
    }

    /**
     * Persists rate limit data to database
     * 
     * @param hashedIp - The hashed IP address
     * @param action - The action being tracked
     * @param cacheEntry - The cache entry to persist
     */
    private static async persistRateLimit(
        hashedIp: string,
        action: RateLimitAction,
        cacheEntry: RateLimitCacheEntry
    ): Promise<void> {
        await PRISMA_DB_CLIENT.rateLimitRecord.upsert({
            where: {
                hashedIp_action: {
                    hashedIp,
                    action,
                },
            },
            update: {
                attempts: cacheEntry.attempts,
                windowStart: new Date(cacheEntry.windowStart),
            },
            create: {
                hashedIp,
                action,
                attempts: cacheEntry.attempts,
                windowStart: new Date(cacheEntry.windowStart),
            },
        });
    }

    /**
     * Cleans up expired rate limit records from database
     * Should be called periodically (e.g., via cron job)
     */
    static async cleanupExpiredRecords(): Promise<void> {
        const now = new Date();

        // Delete records where block has expired and window has passed
        await PRISMA_DB_CLIENT.rateLimitRecord.deleteMany({
            where: {
                OR: [
                    {
                        blockedUntil: {
                            lt: now,
                        },
                    },
                    {
                        windowStart: {
                            lt: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour old
                        },
                    },
                ],
            },
        });

        // Clean up cache entries
        const configs = Object.values(this.configs);
        const maxWindowMs = Math.max(...configs.map((c) => c.windowMs));

        for (const [key, entry] of this.cache.entries()) {
            if (now.getTime() - entry.windowStart > maxWindowMs) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Resets rate limit for a specific IP and action
     * Useful for testing or manual intervention
     * 
     * @param ipAddress - The IP address to reset
     * @param action - The action to reset
     */
    static async resetRateLimit(
        ipAddress: string,
        action: RateLimitAction
    ): Promise<void> {
        const hashedIp = SecurityService.hashIpAddress(ipAddress);
        const cacheKey = `${hashedIp}:${action}`;

        // Remove from cache
        this.cache.delete(cacheKey);

        // Remove from database
        await PRISMA_DB_CLIENT.rateLimitRecord.delete({
            where: {
                hashedIp_action: {
                    hashedIp,
                    action,
                },
            },
        }).catch(() => {
            // Ignore if record doesn't exist
        });
    }

    /**
     * Gets current rate limit status for an IP and action
     * 
     * @param ipAddress - The IP address to check
     * @param action - The action to check
     * @returns Current rate limit status
     */
    static async getRateLimitStatus(
        ipAddress: string,
        action: RateLimitAction
    ): Promise<{
        attempts: number;
        maxAttempts: number;
        windowStart: Date;
        blockedUntil?: Date;
    }> {
        const hashedIp = SecurityService.hashIpAddress(ipAddress);
        const config = this.configs[action];
        const cacheKey = `${hashedIp}:${action}`;

        // Check cache first
        const cacheEntry = this.cache.get(cacheKey);
        if (cacheEntry) {
            return {
                attempts: cacheEntry.attempts,
                maxAttempts: config.maxAttempts,
                windowStart: new Date(cacheEntry.windowStart),
                blockedUntil: cacheEntry.blockedUntil
                    ? new Date(cacheEntry.blockedUntil)
                    : undefined,
            };
        }

        // Check database
        const record = await PRISMA_DB_CLIENT.rateLimitRecord.findUnique({
            where: {
                hashedIp_action: {
                    hashedIp,
                    action,
                },
            },
        });

        if (record) {
            return {
                attempts: record.attempts,
                maxAttempts: config.maxAttempts,
                windowStart: record.windowStart,
                blockedUntil: record.blockedUntil || undefined,
            };
        }

        // No record found
        return {
            attempts: 0,
            maxAttempts: config.maxAttempts,
            windowStart: new Date(),
        };
    }
}
