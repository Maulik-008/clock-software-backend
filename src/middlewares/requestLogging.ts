import { Request, Response, NextFunction } from "express";
import logger from "../config/logger";
import { SecurityService } from "../components/public-rooms/security.service";

/**
 * Request logging middleware for monitoring and security
 * Requirement 10.5: Add request logging for monitoring
 * Requirement 10.3, 10.4: Ensure IP privacy in logs
 */
export const requestLoggingMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const startTime = Date.now();
    const ipAddress = req.ip || req.socket.remoteAddress || "unknown";
    
    // Hash IP for privacy - never log raw IPs
    const hashedIp = SecurityService.hashIpAddress(ipAddress);
    const ipPrefix = hashedIp.substring(0, 8); // Only log first 8 chars of hash

    // Log request
    logger.info("Incoming request", {
        method: req.method,
        path: req.path,
        ipPrefix, // Only log prefix of hashed IP
        userAgent: req.get("user-agent"),
        timestamp: new Date().toISOString(),
    });

    // Capture response
    const originalSend = res.send;
    res.send = function (data): Response {
        const duration = Date.now() - startTime;
        
        logger.info("Request completed", {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            ipPrefix,
            timestamp: new Date().toISOString(),
        });

        return originalSend.call(this, data);
    };

    next();
};
