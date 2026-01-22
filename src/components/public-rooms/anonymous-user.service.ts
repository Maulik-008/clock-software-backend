import { PRISMA_DB_CLIENT } from "../../prisma";
import { SecurityService } from "./security.service";

export interface AnonymousUser {
    id: string;
    hashedIp: string;
    displayName: string;
    createdAt: Date;
    lastActiveAt: Date;
}

/**
 * AnonymousUserService manages anonymous user records identified by hashed IP addresses.
 * 
 * Requirements: 1.3, 1.4, 1.5, 3.2
 */
export class AnonymousUserService {
    /**
     * Creates a new anonymous user or retrieves an existing one by IP address.
     * If a user with the hashed IP already exists, updates their display name and lastActiveAt.
     * 
     * Requirement 1.3: Create a Temporary_User_Record using the IP_Identifier
     * Requirement 1.4: Store the display name and IP_Identifier
     * Requirement 1.5: Retrieve existing Temporary_User_Record for returning users
     * Requirement 3.2: Create or retrieve the Temporary_User_Record when user submits display name
     * 
     * @param ipAddress - The raw IP address of the user
     * @param displayName - The display name provided by the user
     * @returns The created or retrieved anonymous user record
     */
    static async createOrGetUser(
        ipAddress: string,
        displayName: string
    ): Promise<AnonymousUser> {
        // Hash the IP address for secure storage
        const hashedIp = SecurityService.hashIpAddress(ipAddress);

        // Validate and sanitize the display name
        const validation = SecurityService.validateAndSanitizeDisplayName(displayName);
        if (!validation.isValid) {
            throw new Error(validation.error || "Invalid display name");
        }

        const sanitizedDisplayName = validation.sanitizedName!;

        // Try to find existing user by hashed IP
        const existingUser = await PRISMA_DB_CLIENT.anonymousUser.findUnique({
            where: { hashedIp },
        });

        if (existingUser) {
            // Update existing user's display name and last active time
            const updatedUser = await PRISMA_DB_CLIENT.anonymousUser.update({
                where: { id: existingUser.id },
                data: {
                    displayName: sanitizedDisplayName,
                    lastActiveAt: new Date(),
                },
            });

            return updatedUser;
        }

        // Create new user
        const newUser = await PRISMA_DB_CLIENT.anonymousUser.create({
            data: {
                hashedIp,
                displayName: sanitizedDisplayName,
            },
        });

        return newUser;
    }

    /**
     * Retrieves an anonymous user by their IP address.
     * 
     * Requirement 1.5: Retrieve existing Temporary_User_Record for returning users
     * 
     * @param ipAddress - The raw IP address of the user
     * @returns The anonymous user record or null if not found
     */
    static async getUserByIp(ipAddress: string): Promise<AnonymousUser | null> {
        const hashedIp = SecurityService.hashIpAddress(ipAddress);

        const user = await PRISMA_DB_CLIENT.anonymousUser.findUnique({
            where: { hashedIp },
        });

        return user;
    }

    /**
     * Updates the display name of an anonymous user.
     * 
     * Requirement 1.4: Store the display name
     * 
     * @param userId - The ID of the anonymous user
     * @param displayName - The new display name
     * @returns The updated anonymous user record
     */
    static async updateDisplayName(
        userId: string,
        displayName: string
    ): Promise<AnonymousUser> {
        // Validate and sanitize the display name
        const validation = SecurityService.validateAndSanitizeDisplayName(displayName);
        if (!validation.isValid) {
            throw new Error(validation.error || "Invalid display name");
        }

        const sanitizedDisplayName = validation.sanitizedName!;

        const updatedUser = await PRISMA_DB_CLIENT.anonymousUser.update({
            where: { id: userId },
            data: {
                displayName: sanitizedDisplayName,
                lastActiveAt: new Date(),
            },
        });

        return updatedUser;
    }

    /**
     * Removes anonymous users who have been inactive for more than 30 minutes.
     * This helps manage database size and clean up stale user records.
     * 
     * Requirement 14.3: Automatically disconnect users inactive for 30 minutes
     * 
     * @returns The number of users cleaned up
     */
    static async cleanupInactiveUsers(): Promise<number> {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

        const result = await PRISMA_DB_CLIENT.anonymousUser.deleteMany({
            where: {
                lastActiveAt: {
                    lt: thirtyMinutesAgo,
                },
            },
        });

        return result.count;
    }
}
