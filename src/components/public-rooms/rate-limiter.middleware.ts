import { Request, Response, NextFunction } from "express";
import { RateLimiterService, RateLimitAction } from "./rate-limiter.service";

/**
 * Express middleware for API rate limiting
 * Requirement 11.1: Limit API requests to 100 per minute per endpoint
 * Requirement 11.2: Block requests for 60 seconds after limit exceeded
 */
export const apiRateLimitMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const ipAddress = req.ip || req.socket.remoteAddress || "unknown";

        const result = await RateLimiterService.checkRateLimit(
            ipAddress,
            RateLimitAction.API_REQUEST
        );

        if (!result.allowed) {
            const retryAfter = result.blockedUntil
                ? Math.ceil((result.blockedUntil.getTime() - Date.now()) / 1000)
                : 60;

            res.status(429)
                .header("Retry-After", retryAfter.toString())
                .json({
                    error: {
                        code: "RATE_LIMIT_EXCEEDED",
                        message: `Too many requests. Please try again in ${retryAfter} seconds`,
                        retryAfter,
                    },
                });
            return;
        }

        // Add rate limit info to response headers
        res.header("X-RateLimit-Limit", "100");
        res.header("X-RateLimit-Remaining", result.remainingAttempts.toString());
        if (result.resetTime) {
            res.header("X-RateLimit-Reset", result.resetTime.toISOString());
        }

        next();
    } catch (error) {
        console.error("Rate limit middleware error:", error);
        // On error, allow the request to proceed
        next();
    }
};

/**
 * Express middleware for join attempt rate limiting
 * Requirement 13.1: Limit join attempts to 5 per minute
 * Requirement 13.2: Block IP for 5 minutes after limit exceeded
 */
export const joinAttemptRateLimitMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const ipAddress = req.ip || req.socket.remoteAddress || "unknown";

        const result = await RateLimiterService.checkRateLimit(
            ipAddress,
            RateLimitAction.JOIN_ATTEMPT
        );

        if (!result.allowed) {
            const retryAfter = result.blockedUntil
                ? Math.ceil((result.blockedUntil.getTime() - Date.now()) / 1000)
                : 300;

            res.status(429)
                .header("Retry-After", retryAfter.toString())
                .json({
                    error: {
                        code: "JOIN_LIMIT_EXCEEDED",
                        message: `Too many join attempts. Please try again in ${Math.ceil(retryAfter / 60)} minutes`,
                        retryAfter,
                    },
                });
            return;
        }

        // Add rate limit info to response headers
        res.header("X-RateLimit-Limit", "5");
        res.header("X-RateLimit-Remaining", result.remainingAttempts.toString());
        if (result.resetTime) {
            res.header("X-RateLimit-Reset", result.resetTime.toISOString());
        }

        next();
    } catch (error) {
        console.error("Join rate limit middleware error:", error);
        // On error, allow the request to proceed
        next();
    }
};

/**
 * Helper function to check chat rate limit (for Socket.io events)
 * Requirement 11.3: Limit chat messages to 10 per minute
 * Requirement 11.4: Block messages for 30 seconds after limit exceeded
 * 
 * @param ipAddress - The IP address to check
 * @returns Object indicating if chat is allowed and error details
 */
export const checkChatRateLimit = async (
    ipAddress: string
): Promise<{
    allowed: boolean;
    error?: {
        code: string;
        message: string;
        retryAfter: number;
    };
}> => {
    try {
        const result = await RateLimiterService.checkRateLimit(
            ipAddress,
            RateLimitAction.CHAT_MESSAGE
        );

        if (!result.allowed) {
            const retryAfter = result.blockedUntil
                ? Math.ceil((result.blockedUntil.getTime() - Date.now()) / 1000)
                : 30;

            return {
                allowed: false,
                error: {
                    code: "CHAT_RATE_LIMIT_EXCEEDED",
                    message: `Too many messages. Please wait ${retryAfter} seconds`,
                    retryAfter,
                },
            };
        }

        return { allowed: true };
    } catch (error) {
        console.error("Chat rate limit check error:", error);
        // On error, allow the message
        return { allowed: true };
    }
};
