import { NextFunction, Request, Response } from "express";
import { validationResult } from "express-validator";
import { UserService } from "./user.service";

export class UserController {
    constructor(private userService: UserService) {}

    async getUser(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = parseInt(req.params.id);
            
            if (isNaN(userId)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid user ID",
                });
            }

            const user = await this.userService.getUserById(userId);

            res.status(200).json({
                success: true,
                message: "User retrieved successfully",
                data: user,
            });
        } catch (error) {
            next(error);
        }
    }

    async getAllUsers(req: Request, res: Response, next: NextFunction) {
        try {
            const users = await this.userService.getAllUsers();

            res.status(200).json({
                success: true,
                message: "Users retrieved successfully",
                data: users,
            });
        } catch (error) {
            next(error);
        }
    }

    async updateProfile(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (req as any).user;
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required",
                });
            }

            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: "Validation failed",
                    errors: errors.array(),
                });
            }

            const { firstName, lastName, profilePicture } = req.body;
            const updatedUser = await this.userService.updateProfile(user.id, {
                firstName,
                lastName,
                profilePicture,
            });

            res.status(200).json({
                success: true,
                message: "Profile updated successfully",
                data: updatedUser,
            });
        } catch (error) {
            next(error);
        }
    }

    async changePassword(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (req as any).user;
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required",
                });
            }

            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: "Validation failed",
                    errors: errors.array(),
                });
            }

            const { currentPassword, newPassword } = req.body;
            await this.userService.changePassword(user.id, currentPassword, newPassword);

            res.status(200).json({
                success: true,
                message: "Password changed successfully",
            });
        } catch (error) {
            next(error);
        }
    }

    async deleteAccount(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (req as any).user;
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required",
                });
            }

            await this.userService.deleteAccount(user.id);

            res.status(200).json({
                success: true,
                message: "Account deleted successfully",
            });
        } catch (error) {
            next(error);
        }
    }

    async getStudentStats(req: Request, res: Response, next: NextFunction) {
        try {
            const stats = await this.userService.getStudentStats();

            res.status(200).json({
                success: true,
                message: "Student statistics retrieved successfully",
                data: stats,
            });
        } catch (error) {
            next(error);
        }
    }
}
