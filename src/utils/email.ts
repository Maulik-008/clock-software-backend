import nodemailer from "nodemailer";
import crypto from "crypto";

export class EmailService {
    private static transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || "587"),
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    static async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
        
        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: email,
            subject: "Password Reset Request - Clock Software",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Password Reset Request</h2>
                    <p>You requested a password reset for your Clock Software account.</p>
                    <p>Click the button below to reset your password:</p>
                    <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">
                        Reset Password
                    </a>
                    <p>Or copy and paste this link in your browser:</p>
                    <p style="word-break: break-all; color: #666;">${resetUrl}</p>
                    <p><strong>This link will expire in 1 hour.</strong></p>
                    <p>If you didn't request this password reset, please ignore this email.</p>
                    <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;">
                    <p style="color: #666; font-size: 12px;">Clock Software Team</p>
                </div>
            `,
        };

        await this.transporter.sendMail(mailOptions);
    }

    static async sendEmailVerification(email: string, verifyToken: string): Promise<void> {
        const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verifyToken}`;
        
        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: email,
            subject: "Verify Your Email - Clock Software",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Welcome to Clock Software!</h2>
                    <p>Thank you for signing up. Please verify your email address to complete your registration.</p>
                    <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #28a745; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">
                        Verify Email
                    </a>
                    <p>Or copy and paste this link in your browser:</p>
                    <p style="word-break: break-all; color: #666;">${verifyUrl}</p>
                    <p>If you didn't create this account, please ignore this email.</p>
                    <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;">
                    <p style="color: #666; font-size: 12px;">Clock Software Team</p>
                </div>
            `,
        };

        await this.transporter.sendMail(mailOptions);
    }

    static generateSecureToken(): string {
        return crypto.randomBytes(32).toString("hex");
    }
}