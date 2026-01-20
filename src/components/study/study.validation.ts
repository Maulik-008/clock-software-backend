import { body, query, param } from "express-validator";

/**
 * Validation middleware for study session endpoints
 */

export const validateStartSession = [
    body('subject')
        .notEmpty()
        .withMessage('Subject is required')
        .isLength({ min: 1, max: 100 })
        .withMessage('Subject must be between 1 and 100 characters'),
    
    body('topic')
        .optional()
        .isLength({ max: 200 })
        .withMessage('Topic must not exceed 200 characters'),
    
    body('sessionType')
        .isIn(['POMODORO_25', 'POMODORO_50', 'CUSTOM', 'DEEP_WORK', 'REVIEW'])
        .withMessage('Invalid session type'),
    
    body('plannedDuration')
        .isInt({ min: 1, max: 480 })
        .withMessage('Planned duration must be between 1 and 480 minutes (8 hours)'),
    
    body('notes')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Notes must not exceed 1000 characters'),
    
    body('deviceId')
        .optional()
        .isLength({ max: 255 })
        .withMessage('Device ID must not exceed 255 characters'),
];

export const validateSessionId = [
    param('id')
        .isUUID()
        .withMessage('Invalid session ID format'),
];

export const validateEndSession = [
    ...validateSessionId,
    body('completed')
        .optional()
        .isBoolean()
        .withMessage('Completed must be a boolean value'),
];

export const validateSessionHistory = [
    query('dateFrom')
        .optional()
        .isISO8601()
        .withMessage('Invalid dateFrom format. Use ISO 8601 format'),
    
    query('dateTo')
        .optional()
        .isISO8601()
        .withMessage('Invalid dateTo format. Use ISO 8601 format'),
    
    query('subject')
        .optional()
        .isLength({ max: 100 })
        .withMessage('Subject filter must not exceed 100 characters'),
    
    query('sessionType')
        .optional()
        .isIn(['POMODORO_25', 'POMODORO_50', 'CUSTOM', 'DEEP_WORK', 'REVIEW'])
        .withMessage('Invalid session type filter'),
    
    query('status')
        .optional()
        .isIn(['ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED', 'EXPIRED'])
        .withMessage('Invalid status filter'),
    
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
];

export const validateAnalytics = [
    query('days')
        .optional()
        .isInt({ min: 1, max: 365 })
        .withMessage('Days must be between 1 and 365'),
];

export const validateCleanupSessions = [
    body('maxHours')
        .optional()
        .isInt({ min: 1, max: 168 })
        .withMessage('Max hours must be between 1 and 168 (1 week)'),
];