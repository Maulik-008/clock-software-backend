import { body, param } from "express-validator";

/**
 * Validation rules for public rooms API endpoints
 */

/**
 * Validation for POST /api/public/users
 * Requirement 12.1: Validate display name is between 1 and 50 characters
 */
export const createUserValidation = [
    body("displayName")
        .trim()
        .notEmpty()
        .withMessage("Display name is required")
        .isLength({ min: 1, max: 50 })
        .withMessage("Display name must be between 1 and 50 characters"),
];

/**
 * Validation for POST /api/public/rooms/:roomId/join
 */
export const joinRoomValidation = [
    param("roomId")
        .trim()
        .notEmpty()
        .withMessage("Room ID is required")
        .isUUID()
        .withMessage("Room ID must be a valid UUID"),
    body("userId")
        .trim()
        .notEmpty()
        .withMessage("User ID is required")
        .isUUID()
        .withMessage("User ID must be a valid UUID"),
];

/**
 * Validation for POST /api/public/rooms/:roomId/leave
 */
export const leaveRoomValidation = [
    param("roomId")
        .trim()
        .notEmpty()
        .withMessage("Room ID is required")
        .isUUID()
        .withMessage("Room ID must be a valid UUID"),
    body("userId")
        .trim()
        .notEmpty()
        .withMessage("User ID is required")
        .isUUID()
        .withMessage("User ID must be a valid UUID"),
];
