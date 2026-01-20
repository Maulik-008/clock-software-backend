// src/components/user/user.types.ts
export interface UpdateProfileInput {
    firstName?: string;
    lastName?: string;
    profilePicture?: string;
}

export interface ChangePasswordInput {
    currentPassword: string;
    newPassword: string;
}

export interface UserResponse {
    id: number;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    isEmailVerified: boolean;
    profilePicture: string | null;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface StudentStats {
    totalStudents: number;
    verifiedStudents: number;
    recentStudents: number;
    verificationRate: number;
}
