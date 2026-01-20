import { body, param } from "express-validator";

export const registerValidation = [
    body("email")
        .isEmail()
        .withMessage("Please provide a valid email")
        .normalizeEmail()
        .isLength({ max: 255 })
        .withMessage("Email must be less than 255 characters"),
    body("password")
        .isLength({ min: 8 })
        .withMessage("Password must be at least 8 characters long")
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage("Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"),
    body("firstName")
        .optional()
        .isLength({ min: 1, max: 50 })
        .withMessage("First name must be between 1 and 50 characters")
        .trim(),
    body("lastName")
        .optional()
        .isLength({ min: 1, max: 50 })
        .withMessage("Last name must be between 1 and 50 characters")
        .trim(),
];

export const loginValidation = [
    body("email")
        .isEmail()
        .withMessage("Please provide a valid email")
        .normalizeEmail(),
    body("password")
        .notEmpty()
        .withMessage("Password is required"),
];

export const passwordResetRequestValidation = [
    body("email")
        .isEmail()
        .withMessage("Please provide a valid email")
        .normalizeEmail(),
];

export const passwordResetValidation = [
    body("token")
        .notEmpty()
        .withMessage("Reset token is required")
        .isLength({ min: 64, max: 64 })
        .withMessage("Invalid reset token format"),
    body("password")
        .isLength({ min: 8 })
        .withMessage("Password must be at least 8 characters long")
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage("Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"),
];

export const emailVerificationValidation = [
    param("token")
        .notEmpty()
        .withMessage("Verification token is required")
        .isLength({ min: 64, max: 64 })
        .withMessage("Invalid verification token format"),
];

export const sessionValidation = [
    param("sessionId")
        .notEmpty()
        .withMessage("Session ID is required")
        .isUUID()
        .withMessage("Invalid session ID format"),
];