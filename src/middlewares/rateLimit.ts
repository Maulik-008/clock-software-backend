import rateLimit from "express-rate-limit";
import { Request, Response } from "express";

/**
 * Rate limiting middleware for API endpoints
 * Limits: 100 requests per minute per user
 * Requirements: 9.4, 9.5
 */
export const apiRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per window
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    
    // Use user ID from authenticated request as key, fallback to IP
    // Note: Using default IP handling to support IPv6
    keyGenerator: (req: Request): string => {
        const authenticatedReq = req as any;
        if (authenticatedReq.user?.id) {
            return `user:${authenticatedReq.user.id}`;
        }
        // Let express-rate-limit handle IP (including IPv6)
        return req.ip || req.socket.remoteAddress || "unknown";
    },
    
    // Custom handler for rate limit exceeded
    handler: (req: Request, res: Response): void => {
        res.status(429).json({
            success: false,
            error: {
                code: "RATE_LIMIT_EXCEEDED",
                message: "Too many requests, please try again later",
                timestamp: new Date().toISOString(),
            },
        });
    },
    
    // Skip rate limiting for successful requests (only count towards limit)
    skipSuccessfulRequests: false,
    
    // Skip rate limiting for failed requests (only count towards limit)
    skipFailedRequests: false,
});

/**
 * Rate limiting middleware for chat/messaging endpoints
 * Limits: 1000 messages per hour per user
 * Requirements: 9.4, 9.5
 */
export const chatRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 1000, // 1000 messages per window
    standardHeaders: true,
    legacyHeaders: false,
    
    // Use user ID from authenticated request as key, fallback to IP
    keyGenerator: (req: Request): string => {
        const authenticatedReq = req as any;
        if (authenticatedReq.user?.id) {
            return `user:${authenticatedReq.user.id}`;
        }
        return req.ip || req.socket.remoteAddress || "unknown";
    },
    
    // Custom handler for rate limit exceeded
    handler: (req: Request, res: Response): void => {
        res.status(429).json({
            success: false,
            error: {
                code: "CHAT_RATE_LIMIT_EXCEEDED",
                message: "Too many messages sent, please slow down",
                timestamp: new Date().toISOString(),
            },
        });
    },
    
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
});

/**
 * Rate limiting middleware for join/leave operations
 * Limits: 10 join/leave operations per minute per user
 * Requirements: 9.4, 9.5
 */
export const roomOperationRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 operations per window
    standardHeaders: true,
    legacyHeaders: false,
    
    // Use user ID from authenticated request as key, fallback to IP
    keyGenerator: (req: Request): string => {
        const authenticatedReq = req as any;
        if (authenticatedReq.user?.id) {
            return `user:${authenticatedReq.user.id}`;
        }
        return req.ip || req.socket.remoteAddress || "unknown";
    },
    
    // Custom handler for rate limit exceeded
    handler: (req: Request, res: Response): void => {
        res.status(429).json({
            success: false,
            error: {
                code: "ROOM_OPERATION_RATE_LIMIT_EXCEEDED",
                message: "Too many room operations, please wait before trying again",
                timestamp: new Date().toISOString(),
            },
        });
    },
    
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
});
