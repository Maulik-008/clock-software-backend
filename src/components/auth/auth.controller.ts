import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { AuthService, RegisterInput, LoginInput } from "./auth.service";

export class AuthController {
    constructor(private authService: AuthService) {}

    async register(req: Request, res: Response, next: NextFunction) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: "Validation failed",
                    errors: errors.array(),
                });
            }

            const registerData: RegisterInput = req.body;
            const result = await this.authService.register(registerData);

            res.status(201).json({
                success: true,
                message: result.message,
                data: { userId: result.userId },
            });
        } catch (error) {
            next(error);
        }
    }

    async login(req: Request, res: Response, next: NextFunction) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: "Validation failed",
                    errors: errors.array(),
                });
            }

            const loginData: LoginInput = {
                ...req.body,
                deviceInfo: req.headers["user-agent"],
                ipAddress: req.ip,
                userAgent: req.headers["user-agent"],
            };

            const result = await this.authService.login(loginData);

            // Set refresh token as httpOnly cookie
            res.cookie("refreshToken", result.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            });

            res.status(200).json({
                success: true,
                message: "Login successful",
                data: {
                    user: result.user,
                    accessToken: result.accessToken,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    async refreshToken(req: Request, res: Response, next: NextFunction) {
        try {
            const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

            if (!refreshToken) {
                return res.status(401).json({
                    success: false,
                    message: "Refresh token required",
                });
            }

            const result = await this.authService.refreshToken(refreshToken);

            // Set new refresh token as httpOnly cookie
            res.cookie("refreshToken", result.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            });

            res.status(200).json({
                success: true,
                message: "Token refreshed successfully",
                data: {
                    accessToken: result.accessToken,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    async logout(req: Request, res: Response, next: NextFunction) {
        try {
            const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

            if (refreshToken) {
                await this.authService.logout(refreshToken);
            }

            // Clear refresh token cookie
            res.clearCookie("refreshToken");

            res.status(200).json({
                success: true,
                message: "Logout successful",
            });
        } catch (error) {
            next(error);
        }
    }

    async logoutFromAllDevices(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (req as any).user;
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required",
                });
            }

            await this.authService.logoutFromAllDevices(user.id);

            // Clear refresh token cookie
            res.clearCookie("refreshToken");

            res.status(200).json({
                success: true,
                message: "Logged out from all devices successfully",
            });
        } catch (error) {
            next(error);
        }
    }

    async requestPasswordReset(req: Request, res: Response, next: NextFunction) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: "Validation failed",
                    errors: errors.array(),
                });
            }

            const { email } = req.body;
            await this.authService.requestPasswordReset(email);

            res.status(200).json({
                success: true,
                message: "If an account with that email exists, a password reset link has been sent.",
            });
        } catch (error) {
            next(error);
        }
    }

    async resetPassword(req: Request, res: Response, next: NextFunction) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: "Validation failed",
                    errors: errors.array(),
                });
            }

            const { token, password } = req.body;
            await this.authService.resetPassword(token, password);

            res.status(200).json({
                success: true,
                message: "Password reset successful",
            });
        } catch (error) {
            next(error);
        }
    }

    async verifyEmail(req: Request, res: Response, next: NextFunction) {
        try {
            const { token } = req.params;
            await this.authService.verifyEmail(token);

            res.status(200).json({
                success: true,
                message: "Email verified successfully",
            });
        } catch (error) {
            next(error);
        }
    }

    async getProfile(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (req as any).user;
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required",
                });
            }

            res.status(200).json({
                success: true,
                message: "Profile retrieved successfully",
                data: user,
            });
        } catch (error) {
            next(error);
        }
    }

    async getSessions(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (req as any).user;
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required",
                });
            }

            const sessions = await this.authService.getUserSessions(user.id);

            res.status(200).json({
                success: true,
                message: "Sessions retrieved successfully",
                data: sessions,
            });
        } catch (error) {
            next(error);
        }
    }

    async revokeSession(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (req as any).user;
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required",
                });
            }

            const { sessionId } = req.params;
            await this.authService.revokeSession(user.id, sessionId);

            res.status(200).json({
                success: true,
                message: "Session revoked successfully",
            });
        } catch (error) {
            next(error);
        }
    }
}