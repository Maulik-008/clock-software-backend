import bcrypt from "bcrypt";
import { PRISMA_DB_CLIENT } from "../../prisma";

export class UserService {
    async getUserById(id: number) {
        const user = await PRISMA_DB_CLIENT.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                isEmailVerified: true,
                profilePicture: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!user) {
            throw new Error("User not found");
        }

        return user;
    }

    async getAllUsers() {
        const users = await PRISMA_DB_CLIENT.user.findMany({
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                isEmailVerified: true,
                profilePicture: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: { createdAt: "desc" },
        });

        return users;
    }

    async updateProfile(userId: number, data: { firstName?: string; lastName?: string; profilePicture?: string }) {
        const user = await PRISMA_DB_CLIENT.user.update({
            where: { id: userId },
            data,
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                isEmailVerified: true,
                profilePicture: true,
                updatedAt: true,
            },
        });

        return user;
    }

    async changePassword(userId: number, currentPassword: string, newPassword: string) {
        const user = await PRISMA_DB_CLIENT.user.findUnique({
            where: { id: userId },
        });

        if (!user || !user.password) {
            throw new Error("User not found");
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            throw new Error("Current password is incorrect");
        }

        // Hash new password
        const hashedNewPassword = await bcrypt.hash(newPassword, 12);

        // Update password
        await PRISMA_DB_CLIENT.user.update({
            where: { id: userId },
            data: { password: hashedNewPassword },
        });
    }

    async deleteAccount(userId: number) {
        // This will cascade delete related records due to Prisma schema
        await PRISMA_DB_CLIENT.user.delete({
            where: { id: userId },
        });
    }

    async getStudentStats() {
        const totalStudents = await PRISMA_DB_CLIENT.user.count({
            where: { role: "STUDENT" },
        });

        const verifiedStudents = await PRISMA_DB_CLIENT.user.count({
            where: { 
                role: "STUDENT",
                isEmailVerified: true,
            },
        });

        const recentStudents = await PRISMA_DB_CLIENT.user.count({
            where: {
                role: "STUDENT",
                createdAt: {
                    gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
                },
            },
        });

        return {
            totalStudents,
            verifiedStudents,
            recentStudents,
            verificationRate: totalStudents > 0 ? (verifiedStudents / totalStudents) * 100 : 0,
        };
    }
}
