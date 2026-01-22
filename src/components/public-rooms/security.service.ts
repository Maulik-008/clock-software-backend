import crypto from "crypto";
import logger from "../../config/logger";
import { PRISMA_DB_CLIENT } from "../../prisma";

export interface ValidationResult {
    isValid: boolean;
    error?: string;
}

/**
 * Suspicious activity types for logging
 */
export enum SuspiciousActivityType {
    RAPID_RECONNECTION = "rapid_reconnection",
    RATE_LIMIT_VIOLATION = "rate_limit_violation",
    MULTIPLE_BLOCKS = "multiple_blocks",
    EXCESSIVE_JOIN_ATTEMPTS = "excessive_join_attempts",
    MALICIOUS_INPUT = "malicious_input",
}

/**
 * SecurityService handles IP hashing, input validation, and sanitization
 * for the Public Study Rooms feature.
 * 
 * Requirements: 10.1, 10.2, 12.1, 12.2, 12.4, 12.5
 */
export class SecurityService {
    /**
     * Hashes an IP address using SHA-256 for secure storage
     * Requirement 10.1: IP addresses must be hashed before database storage
     * 
     * @param ipAddress - The raw IP address to hash
     * @returns The hashed IP address as a hex string
     */
    static hashIpAddress(ipAddress: string): string {
        return crypto
            .createHash("sha256")
            .update(ipAddress)
            .digest("hex");
    }

    /**
     * Validates a display name according to length requirements
     * Requirement 12.1: Display names must be between 1 and 50 characters
     * 
     * @param name - The display name to validate
     * @returns ValidationResult indicating if the name is valid
     */
    static validateDisplayName(name: string): ValidationResult {
        if (!name || typeof name !== "string") {
            return {
                isValid: false,
                error: "Display name is required",
            };
        }

        const trimmedName = name.trim();

        if (trimmedName.length < 1) {
            return {
                isValid: false,
                error: "Display name must be at least 1 character",
            };
        }

        if (trimmedName.length > 50) {
            return {
                isValid: false,
                error: "Display name must be at most 50 characters",
            };
        }

        return { isValid: true };
    }

    /**
     * Sanitizes user input to prevent XSS attacks and remove HTML tags
     * Requirements 12.2, 12.4: Remove HTML tags and prevent XSS
     * 
     * @param input - The user input to sanitize
     * @returns The sanitized input string
     */
    static sanitizeInput(input: string): string {
        if (!input || typeof input !== "string") {
            return "";
        }

        // Remove HTML tags
        let sanitized = input.replace(/<[^>]*>/g, "");

        // Escape special HTML characters
        sanitized = sanitized
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#x27;")
            .replace(/\//g, "&#x2F;");

        // Remove potential script injection patterns
        sanitized = sanitized
            .replace(/javascript:/gi, "")
            .replace(/on\w+\s*=/gi, "")
            .replace(/data:text\/html/gi, "");

        return sanitized.trim();
    }

    /**
     * Detects SQL injection patterns in user input
     * Requirement 12.5: Reject inputs containing SQL injection patterns
     * 
     * @param input - The user input to check
     * @returns true if SQL injection patterns are detected, false otherwise
     */
    static detectSqlInjection(input: string): boolean {
        if (!input || typeof input !== "string") {
            return false;
        }

        // Common SQL injection patterns
        const sqlPatterns = [
            /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|DECLARE)\b)/gi,
            /(--|\#|\/\*|\*\/)/g, // SQL comments
            /(\bOR\b.*=.*)/gi, // OR 1=1 patterns
            /(\bAND\b.*=.*)/gi, // AND 1=1 patterns
            /('|"|;|\||&)/g, // Special SQL characters
            /(xp_|sp_)/gi, // SQL Server stored procedures
            /(\bSCHEMA\b|\bTABLE\b|\bDATABASE\b)/gi,
        ];

        return sqlPatterns.some((pattern) => pattern.test(input));
    }

    /**
     * Validates and sanitizes a display name
     * Combines validation and sanitization for display names
     * 
     * @param name - The display name to process
     * @returns ValidationResult with sanitized name or error
     */
    static validateAndSanitizeDisplayName(name: string): ValidationResult & { sanitizedName?: string } {
        // First validate the raw input
        const validation = this.validateDisplayName(name);
        if (!validation.isValid) {
            return validation;
        }

        // Check for SQL injection
        if (this.detectSqlInjection(name)) {
            return {
                isValid: false,
                error: "Display name contains invalid characters or patterns",
            };
        }

        // Sanitize the input
        const sanitizedName = this.sanitizeInput(name);

        // Validate the sanitized name still meets length requirements
        if (sanitizedName.length < 1 || sanitizedName.length > 50) {
            return {
                isValid: false,
                error: "Display name contains too many special characters",
            };
        }

        return {
            isValid: true,
            sanitizedName,
        };
    }

    /**
     * Validates and sanitizes a chat message
     * Requirements 12.3, 12.4: Validate message length and prevent XSS
     * 
     * @param message - The chat message to process
     * @returns ValidationResult with sanitized message or error
     */
    static validateAndSanitizeChatMessage(message: string): ValidationResult & { sanitizedMessage?: string } {
        if (!message || typeof message !== "string") {
            return {
                isValid: false,
                error: "Message is required",
            };
        }

        const trimmedMessage = message.trim();

        if (trimmedMessage.length < 1) {
            return {
                isValid: false,
                error: "Message must be at least 1 character",
            };
        }

        if (trimmedMessage.length > 1000) {
            return {
                isValid: false,
                error: "Message must be at most 1000 characters",
            };
        }

        // Check for SQL injection
        if (this.detectSqlInjection(message)) {
            return {
                isValid: false,
                error: "Message contains invalid characters or patterns",
            };
        }

        // Sanitize the message
        const sanitizedMessage = this.sanitizeInput(message);

        return {
            isValid: true,
            sanitizedMessage,
        };
    }

    /**
     * Logs suspicious activity for monitoring and abuse prevention
     * Requirement 13.4: Log suspicious activity patterns
     * 
     * @param ipAddress - The IP address exhibiting suspicious behavior
     * @param activityType - The type of suspicious activity
     * @param details - Additional details about the activity
     */
    static async logSuspiciousActivity(
        ipAddress: string,
        activityType: SuspiciousActivityType,
        details?: string
    ): Promise<void> {
        const hashedIp = this.hashIpAddress(ipAddress);
        
        logger.warn(`Suspicious activity detected - Type: ${activityType}, IP: ${hashedIp.substring(0, 8)}..., Details: ${details || 'N/A'}`);

        try {
            // Store in database for analysis and tracking
            await PRISMA_DB_CLIENT.suspiciousActivityLog.create({
                data: {
                    hashedIp,
                    activityType,
                    details: details || '',
                },
            });
        } catch (error) {
            // Log error but don't fail the operation
            logger.error('Failed to store suspicious activity in database:', error);
        }
    }

    /**
     * Checks if an IP has a history of suspicious activity
     * 
     * @param ipAddress - The IP address to check
     * @param timeWindowMs - Time window to check (default: 1 hour)
     * @returns Number of suspicious activities in the time window
     */
    static async getSuspiciousActivityCount(
        ipAddress: string,
        timeWindowMs: number = 60 * 60 * 1000
    ): Promise<number> {
        const hashedIp = this.hashIpAddress(ipAddress);
        const since = new Date(Date.now() - timeWindowMs);

        try {
            const count = await PRISMA_DB_CLIENT.suspiciousActivityLog.count({
                where: {
                    hashedIp,
                    timestamp: {
                        gt: since,
                    },
                },
            });
            
            return count;
        } catch (error) {
            // If there's an error, return 0
            logger.error('Failed to get suspicious activity count:', error);
            return 0;
        }
    }
}
