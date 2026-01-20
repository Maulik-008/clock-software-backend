import winston from "winston";

/**
 * Winston logger configuration for Shared Study Rooms feature
 * 
 * Provides structured logging with context (user_id, room_id, endpoint)
 * Supports log levels: error, warn, info, debug
 * Outputs to: error.log (errors only), combined.log (all levels)
 */

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: {
        service: "shared-study-rooms"
    },
    transports: [
        // Error log - only errors
        new winston.transports.File({
            filename: "logs/error.log",
            level: "error",
            silent: process.env.NODE_ENV === "test"
        }),
        // Combined log - all levels
        new winston.transports.File({
            filename: "logs/combined.log",
            silent: process.env.NODE_ENV === "test"
        }),
        // Console output for development
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            ),
            silent: process.env.NODE_ENV === "test"
        })
    ]
});

/**
 * Context interface for structured logging
 */
export interface LogContext {
    user_id?: string;
    room_id?: string;
    endpoint?: string;
    [key: string]: any;
}

/**
 * Helper function to log with context
 * @param level - Log level (error, warn, info, debug)
 * @param message - Log message
 * @param context - Additional context (user_id, room_id, endpoint, etc.)
 */
export const logWithContext = (
    level: "error" | "warn" | "info" | "debug",
    message: string,
    context: LogContext = {}
): void => {
    logger.log(level, message, context);
};

/**
 * Log error with context
 * @param message - Error message
 * @param context - Additional context
 */
export const logError = (message: string, context: LogContext = {}): void => {
    logger.error(message, context);
};

/**
 * Log warning with context
 * @param message - Warning message
 * @param context - Additional context
 */
export const logWarn = (message: string, context: LogContext = {}): void => {
    logger.warn(message, context);
};

/**
 * Log info with context
 * @param message - Info message
 * @param context - Additional context
 */
export const logInfo = (message: string, context: LogContext = {}): void => {
    logger.info(message, context);
};

/**
 * Log debug with context
 * @param message - Debug message
 * @param context - Additional context
 */
export const logDebug = (message: string, context: LogContext = {}): void => {
    logger.debug(message, context);
};

/**
 * Log room join event
 * @param user_id - User ID
 * @param room_id - Room ID
 * @param endpoint - API endpoint
 */
export const logRoomJoin = (user_id: string, room_id: string, endpoint: string): void => {
    logInfo("User joined room", { user_id, room_id, endpoint });
};

/**
 * Log room leave event
 * @param user_id - User ID
 * @param room_id - Room ID
 * @param endpoint - API endpoint
 */
export const logRoomLeave = (user_id: string, room_id: string, endpoint: string): void => {
    logInfo("User left room", { user_id, room_id, endpoint });
};

/**
 * Log message sent event
 * @param user_id - User ID
 * @param room_id - Room ID
 * @param message_type - Message type (TEXT, EMOJI, POLL)
 */
export const logMessageSent = (user_id: string, room_id: string, message_type: string): void => {
    logInfo("Message sent", { user_id, room_id, message_type });
};

/**
 * Log moderation action
 * @param admin_id - Admin user ID
 * @param target_user_id - Target user ID
 * @param room_id - Room ID
 * @param action - Moderation action (mute, kick)
 */
export const logModerationAction = (
    admin_id: string,
    target_user_id: string,
    room_id: string,
    action: string
): void => {
    logInfo("Moderation action performed", {
        admin_id,
        target_user_id,
        room_id,
        action
    });
};

/**
 * Log timer event
 * @param user_id - User ID
 * @param room_id - Room ID
 * @param action - Timer action (start, pause, resume, complete)
 */
export const logTimerEvent = (user_id: string, room_id: string, action: string): void => {
    logInfo("Timer event", { user_id, room_id, action });
};

/**
 * Log capacity warning
 * @param room_id - Room ID
 * @param current_occupancy - Current occupancy
 * @param capacity - Room capacity
 */
export const logCapacityWarning = (
    room_id: string,
    current_occupancy: number,
    capacity: number
): void => {
    logWarn("Room approaching capacity", { room_id, current_occupancy, capacity });
};

/**
 * Log rate limit violation
 * @param user_id - User ID
 * @param endpoint - API endpoint
 * @param ip - Client IP address
 */
export const logRateLimitViolation = (user_id: string, endpoint: string, ip?: string): void => {
    logWarn("Rate limit exceeded", { user_id, endpoint, ip });
};

/**
 * Log database error
 * @param message - Error message
 * @param context - Additional context
 */
export const logDatabaseError = (message: string, context: LogContext = {}): void => {
    logError(`Database error: ${message}`, { ...context, error_type: "database" });
};

/**
 * Log WebRTC signaling event
 * @param user_id - User ID
 * @param room_id - Room ID
 * @param event_type - Signaling event type (offer, answer, ice-candidate)
 */
export const logWebRTCSignaling = (user_id: string, room_id: string, event_type: string): void => {
    logDebug("WebRTC signaling event", { user_id, room_id, event_type });
};

/**
 * Log socket disconnection
 * @param user_id - User ID
 * @param room_id - Room ID
 * @param reason - Disconnection reason
 */
export const logSocketDisconnection = (user_id: string, room_id: string, reason?: string): void => {
    logInfo("Socket disconnected", { user_id, room_id, reason });
};

export default logger;
