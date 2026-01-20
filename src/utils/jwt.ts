import jwt from "jsonwebtoken";
import { PRISMA_DB_CLIENT } from "../prisma";

interface JwtPayload {
    userId: number;
    email: string;
    role: string;
}

interface RefreshTokenPayload {
    userId: number;
    tokenId: string;
}

export class JwtService {
    private static readonly JWT_SECRET = process.env.JWT_SECRET!;
    private static readonly JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
    private static readonly JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";
    private static readonly JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

    static generateAccessToken(payload: JwtPayload): string {
        if (!this.JWT_SECRET) {
            throw new Error("JWT_SECRET is not defined");
        }
        // @ts-ignore
        return jwt.sign(payload, this.JWT_SECRET, {
            expiresIn: this.JWT_EXPIRES_IN,
        });
    }

    static generateRefreshToken(payload: RefreshTokenPayload): string {
        if (!this.JWT_REFRESH_SECRET) {
            throw new Error("JWT_REFRESH_SECRET is not defined");
        }
        // @ts-ignore
        return jwt.sign(payload, this.JWT_REFRESH_SECRET, {
            expiresIn: this.JWT_REFRESH_EXPIRES_IN,
        });
    }

    static verifyAccessToken(token: string): JwtPayload {
        if (!this.JWT_SECRET) {
            throw new Error("JWT_SECRET is not defined");
        }
        return jwt.verify(token, this.JWT_SECRET) as JwtPayload;
    }

    static verifyRefreshToken(token: string): RefreshTokenPayload {
        if (!this.JWT_REFRESH_SECRET) {
            throw new Error("JWT_REFRESH_SECRET is not defined");
        }
        return jwt.verify(token, this.JWT_REFRESH_SECRET) as RefreshTokenPayload;
    }

    static async createRefreshToken(userId: number, deviceInfo?: string): Promise<string> {
        // Create refresh token record in database
        const refreshToken = await PRISMA_DB_CLIENT.refreshToken.create({
            data: {
                userId,
                token: "", // Will be updated after generating JWT
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                deviceInfo,
            },
        });

        // Generate JWT with token ID
        const jwtToken = this.generateRefreshToken({
            userId,
            tokenId: refreshToken.id,
        });

        // Update the token in database
        await PRISMA_DB_CLIENT.refreshToken.update({
            where: { id: refreshToken.id },
            data: { token: jwtToken },
        });

        return jwtToken;
    }

    static async revokeRefreshToken(tokenId: string): Promise<void> {
        await PRISMA_DB_CLIENT.refreshToken.update({
            where: { id: tokenId },
            data: { isRevoked: true },
        });
    }

    static async revokeAllUserTokens(userId: number): Promise<void> {
        await PRISMA_DB_CLIENT.refreshToken.updateMany({
            where: { userId },
            data: { isRevoked: true },
        });
    }

    static async validateRefreshToken(token: string): Promise<boolean> {
        try {
            const payload = this.verifyRefreshToken(token);
            
            const dbToken = await PRISMA_DB_CLIENT.refreshToken.findFirst({
                where: {
                    id: payload.tokenId,
                    token,
                    isRevoked: false,
                    expiresAt: { gt: new Date() },
                },
            });

            return !!dbToken;
        } catch {
            return false;
        }
    }
}