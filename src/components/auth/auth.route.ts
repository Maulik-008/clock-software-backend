import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { authenticate } from "../../middlewares/authentication";
import {
    registerValidation,
    loginValidation,
    passwordResetRequestValidation,
    passwordResetValidation,
    emailVerificationValidation,
    sessionValidation,
} from "./auth.validation";

const authRouter = Router();

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: {
        success: false,
        message: "Too many authentication attempts, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Limit each IP to 3 password reset requests per hour
    message: {
        success: false,
        message: "Too many password reset attempts, please try again later.",
    },
});

// Initialize service and controller
const authService = new AuthService();
const authController = new AuthController(authService);

// Wrapper functions to handle typing
const handleRegister = async (req: Request, res: Response, next: NextFunction) => {
    await authController.register(req, res, next);
};

const handleLogin = async (req: Request, res: Response, next: NextFunction) => {
    await authController.login(req, res, next);
};

const handleRefreshToken = async (req: Request, res: Response, next: NextFunction) => {
    await authController.refreshToken(req, res, next);
};

const handleLogout = async (req: Request, res: Response, next: NextFunction) => {
    await authController.logout(req, res, next);
};

const handleRequestPasswordReset = async (req: Request, res: Response, next: NextFunction) => {
    await authController.requestPasswordReset(req, res, next);
};

const handleResetPassword = async (req: Request, res: Response, next: NextFunction) => {
    await authController.resetPassword(req, res, next);
};

const handleVerifyEmail = async (req: Request, res: Response, next: NextFunction) => {
    await authController.verifyEmail(req, res, next);
};

const handleGetProfile = async (req: Request, res: Response, next: NextFunction) => {
    await authController.getProfile(req, res, next);
};

const handleLogoutFromAllDevices = async (req: Request, res: Response, next: NextFunction) => {
    await authController.logoutFromAllDevices(req, res, next);
};

const handleGetSessions = async (req: Request, res: Response, next: NextFunction) => {
    await authController.getSessions(req, res, next);
};

const handleRevokeSession = async (req: Request, res: Response, next: NextFunction) => {
    await authController.revokeSession(req, res, next);
};

// Public routes
authRouter.post("/register", registerValidation, handleRegister);

authRouter.post("/login", authLimiter, loginValidation, handleLogin);

authRouter.post("/refresh-token", handleRefreshToken);

authRouter.post("/logout", handleLogout);

authRouter.post("/request-password-reset", passwordResetLimiter, passwordResetRequestValidation, handleRequestPasswordReset);

authRouter.post("/reset-password", passwordResetValidation, handleResetPassword);

authRouter.get("/verify-email/:token", emailVerificationValidation, handleVerifyEmail);

// Protected routes
// @ts-ignore
authRouter.get("/profile", authenticate, handleGetProfile);

// @ts-ignore
authRouter.post("/logout-all", authenticate, handleLogoutFromAllDevices);

// @ts-ignore
authRouter.get("/sessions", authenticate, handleGetSessions);

// @ts-ignore
authRouter.delete("/sessions/:sessionId", authenticate, sessionValidation, handleRevokeSession);

export default authRouter;