import { body } from "express-validator";

export const updateProfileValidation = [
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
    body("profilePicture")
        .optional()
        .isURL()
        .withMessage("Profile picture must be a valid URL"),
];

export const changePasswordValidation = [
    body("currentPassword")
        .notEmpty()
        .withMessage("Current password is required"),
    body("newPassword")
        .isLength({ min: 8 })
        .withMessage("New password must be at least 8 characters long")
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage("New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"),
];