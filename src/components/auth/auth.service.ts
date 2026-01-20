import bcrypt from "bcrypt";
import crypto from "crypto";
import { PRISMA_DB_CLIENT } from "../../prisma";
import { JwtService } from "../../utils/jwt";
import { EmailService } from "../../utils/email";

export interface RegisterInput {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
}

export interface LoginInput {
    email: string;
    password: string;
    deviceInfo?: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface AuthResponse {
    user: {
        id: number;
        email: string;
        firstName: string | null;
        lastName: string | null;
        role: string;
        isEmailVerified: boolean;
    };
    accessToken: string;
    refreshToken: string;
}

export class AuthService {
    async register(data: RegisterInput): Promise<{ message: string; userId: number }> {
        const { email, password, firstName, lastName } = data;

        // Check if user already exists
        const existingUser = await PRISMA_DB_CLIENT.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            throw new Error("User already exists with this email");
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Generate email verification token
        const emailVerifyToken = EmailService.generateSecureToken();

        // Create user
        const user = await PRISMA_DB_CLIENT.user.create({
            data: {
                email,
                password: hashedPassword,
                firstName,
                lastName,
                emailVerifyToken,
            },
        });

        // Send verification email (in production)
        if (process.env.NODE_ENV === "production") {
            try {
                await EmailService.sendEmailVerification(email, emailVerifyToken);
            } catch (emailError) {
                console.error("Failed to send verification email:", emailError);
                // Don't fail registration if email fails
            }
        }

        return {
            message: "Registration successful. Please check your email for verification.",
            userId: user.id,
        };
    }

    async login(data: LoginInput): Promise<AuthResponse> {
        const { email, password, deviceInfo, ipAddress, userAgent } = data;

        // Find user
        const user = await PRISMA_DB_CLIENT.user.findUnique({
            where: { email },
        });

        if (!user || !user.password) {
            throw new Error("Invalid email or password");
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            throw new Error("Invalid email or password");
        }

        // Update last login
        await PRISMA_DB_CLIENT.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });

        // Create session
        await PRISMA_DB_CLIENT.userSession.create({
            data: {
                userId: user.id,
                deviceInfo,
                ipAddress,
                userAgent,
            },
        });

        // Generate tokens
        const accessToken = JwtService.generateAccessToken({
            userId: user.id,
            email: user.email,
            role: user.role,
        });

        const refreshToken = await JwtService.createRefreshToken(user.id, deviceInfo);

        return {
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                isEmailVerified: user.isEmailVerified,
            },
            accessToken,
            refreshToken,
        };
    }

    async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
        // Validate refresh token
        const isValid = await JwtService.validateRefreshToken(refreshToken);
        if (!isValid) {
            throw new Error("Invalid or expired refresh token");
        }

        // Decode token to get user info
        const payload = JwtService.verifyRefreshToken(refreshToken);
        
        // Get user
        const user = await PRISMA_DB_CLIENT.user.findUnique({
            where: { id: payload.userId },
        });

        if (!user) {
            throw new Error("User not found");
        }

        // Revoke old refresh token
        await JwtService.revokeRefreshToken(payload.tokenId);

        // Generate new tokens
        const newAccessToken = JwtService.generateAccessToken({
            userId: user.id,
            email: user.email,
            role: user.role,
        });

        const newRefreshToken = await JwtService.createRefreshToken(user.id);

        return {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
        };
    }

    async logout(refreshToken: string): Promise<void> {
        try {
            const payload = JwtService.verifyRefreshToken(refreshToken);
            await JwtService.revokeRefreshToken(payload.tokenId);
        } catch (error) {
            // Token might already be invalid, which is fine for logout
        }
    }

    async logoutFromAllDevices(userId: number): Promise<void> {
        await JwtService.revokeAllUserTokens(userId);
        
        // Also clear all sessions
        await PRISMA_DB_CLIENT.userSession.deleteMany({
            where: { userId },
        });
    }

    async requestPasswordReset(email: string): Promise<void> {
        const user = await PRISMA_DB_CLIENT.user.findUnique({
            where: { email },
        });

        if (!user) {
            // Don't reveal if user exists or not
            return;
        }

        // Generate reset token
        const resetToken = EmailService.generateSecureToken();
        const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        // Save reset token
        await PRISMA_DB_CLIENT.user.update({
            where: { id: user.id },
            data: {
                passwordResetToken: resetToken,
                passwordResetExpires: resetExpires,
            },
        });

        // Send reset email
        try {
            await EmailService.sendPasswordResetEmail(email, resetToken);
        } catch (emailError) {
            console.error("Failed to send password reset email:", emailError);
            throw new Error("Failed to send password reset email");
        }
    }

    async resetPassword(token: string, newPassword: string): Promise<void> {
        const user = await PRISMA_DB_CLIENT.user.findFirst({
            where: {
                passwordResetToken: token,
                passwordResetExpires: { gt: new Date() },
            },
        });

        if (!user) {
            throw new Error("Invalid or expired reset token");
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        // Update password and clear reset token
        await PRISMA_DB_CLIENT.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                passwordResetToken: null,
                passwordResetExpires: null,
            },
        });

        // Revoke all existing tokens for security
        await this.logoutFromAllDevices(user.id);
    }

    async verifyEmail(token: string): Promise<void> {
        const user = await PRISMA_DB_CLIENT.user.findFirst({
            where: { emailVerifyToken: token },
        });

        if (!user) {
            throw new Error("Invalid verification token");
        }

        await PRISMA_DB_CLIENT.user.update({
            where: { id: user.id },
            data: {
                isEmailVerified: true,
                emailVerifyToken: null,
            },
        });
    }

    async getUserSessions(userId: number) {
        return await PRISMA_DB_CLIENT.userSession.findMany({
            where: { userId },
            orderBy: { lastActive: "desc" },
            select: {
                id: true,
                deviceInfo: true,
                ipAddress: true,
                userAgent: true,
                lastActive: true,
                createdAt: true,
            },
        });
    }

    async revokeSession(userId: number, sessionId: string): Promise<void> {
        await PRISMA_DB_CLIENT.userSession.delete({
            where: {
                id: sessionId,
                userId, // Ensure user can only revoke their own sessions
            },
        });
    }
}