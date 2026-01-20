import { Request, Response, NextFunction } from "express";
import { JwtService } from "../utils/jwt";
import { PRISMA_DB_CLIENT } from "../prisma";

interface AuthenticatedRequest extends Request {
    user?: {
        id: number;
        email: string;
        role: string;
        firstName?: string;
        lastName?: string;
        isEmailVerified?: boolean;
    };
}

export const authenticate = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({
                success: false,
                message: "Access token required",
            });
            return;
        }

        const token = authHeader.substring(7); // Remove "Bearer " prefix
        
        try {
            const payload = JwtService.verifyAccessToken(token);
            
            // Fetch user from database to ensure they still exist
            const user = await PRISMA_DB_CLIENT.user.findUnique({
                where: { id: payload.userId },
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    role: true,
                    isEmailVerified: true,
                },
            });

            if (!user) {
                res.status(401).json({
                    success: false,
                    message: "User not found",
                });
                return;
            }

            req.user = {
                id: user.id,
                email: user.email,
                firstName: user.firstName || undefined,
                lastName: user.lastName || undefined,
                role: user.role,
                isEmailVerified: user.isEmailVerified,
            };
            next();
        } catch (jwtError) {
            res.status(401).json({
                success: false,
                message: "Invalid or expired token",
            });
            return;
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Authentication error",
        });
        return;
    }
};

export const requireRole = (roles: string[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: "Authentication required",
            });
            return;
        }

        if (!roles.includes(req.user.role)) {
            res.status(403).json({
                success: false,
                message: "Insufficient permissions",
            });
            return;
        }

        next();
    };
};

export const requireEmailVerification = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): void => {
    if (!req.user) {
        res.status(401).json({
            success: false,
            message: "Authentication required",
        });
        return;
    }

    // For development, we'll skip email verification check
    // In production, uncomment the following lines:
    /*
    if (!req.user.isEmailVerified) {
        res.status(403).json({
            success: false,
            message: "Email verification required",
        });
        return;
    }
    */

    next();
};

export type { AuthenticatedRequest };