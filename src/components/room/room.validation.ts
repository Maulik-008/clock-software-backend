import { body, param } from "express-validator";

/**
 * Validation middleware for room endpoints
 * 
 * This module provides validation schemas for:
 * - Join room requests
 * - Leave room requests
 * - Send message requests
 * - Timer sync requests
 * - Moderation requests
 * 
 * Validates Requirements: 9.6, 4.1, 4.2
 */

/**
 * Validates room ID parameter (UUID format)
 */
export const validateRoomId = [
    param('id')
        .isUUID()
        .withMessage('Invalid room ID format. Must be a valid UUID'),
];

/**
 * Validates join room request
 * Requirements: 2.1, 9.6
 */
export const validateJoinRoom = [
    ...validateRoomId,
    // user_id is extracted from JWT token, not from request body
];

/**
 * Validates leave room request
 * Requirements: 3.1, 9.6
 */
export const validateLeaveRoom = [
    ...validateRoomId,
    // user_id is extracted from JWT token, not from request body
];

/**
 * Validates send message request
 * Requirements: 4.1, 4.2, 4.5, 9.6
 */
export const validateSendMessage = [
    ...validateRoomId,
    body('content')
        .notEmpty()
        .withMessage('Message content is required')
        .isLength({ min: 1, max: 1000 })
        .withMessage('Message content must be between 1 and 1000 characters')
        .trim(),
    
    body('type')
        .isIn(['TEXT', 'EMOJI', 'POLL'])
        .withMessage('Message type must be one of: TEXT, EMOJI, POLL'),
];

/**
 * Validates timer sync request
 * Requirements: 6.1, 9.6
 */
export const validateTimerSync = [
    ...validateRoomId,
    body('action')
        .isIn(['start', 'pause', 'resume', 'complete'])
        .withMessage('Timer action must be one of: start, pause, resume, complete'),
    
    body('duration')
        .optional()
        .isInt({ min: 1, max: 28800 })
        .withMessage('Duration must be between 1 and 28800 seconds (8 hours)'),
    
    body('start_time')
        .optional()
        .isISO8601()
        .withMessage('Start time must be a valid ISO 8601 timestamp'),
];

/**
 * Validates moderation request
 * Requirements: 7.1, 9.6
 */
export const validateModerate = [
    ...validateRoomId,
    body('action')
        .isIn(['mute', 'kick'])
        .withMessage('Moderation action must be one of: mute, kick'),
    
    body('target_user_id')
        .notEmpty()
        .withMessage('Target user ID is required')
        .isUUID()
        .withMessage('Target user ID must be a valid UUID'),
];
