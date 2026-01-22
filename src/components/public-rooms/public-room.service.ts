import { PRISMA_DB_CLIENT } from "../../prisma";
import { SecurityService } from "./security.service";

export interface PublicRoom {
    id: string;
    name: string;
    currentOccupancy: number;
    capacity: number;
    isFull: boolean;
}

export interface Participant {
    id: string;
    displayName: string;
    isVideoEnabled: boolean;
    isAudioEnabled: boolean;
    joinedAt: Date;
}

export interface JoinRoomResult {
    success: boolean;
    room: PublicRoom;
    participants: Participant[];
    error?: string;
}

/**
 * PublicRoomService manages public study room operations including
 * room discovery, joining, leaving, and participant management.
 * 
 * Requirements: 2.1, 2.2, 2.4, 3.3, 3.4, 3.5, 11.5
 */
export class PublicRoomService {
    /**
     * Gets a list of 10 public rooms with their current occupancy.
     * 
     * Requirement 2.1: Display exactly 10 study rooms
     * Requirement 2.2: Show room name, current occupancy count, and capacity
     * Requirement 2.4: Indicate when a room is full
     * 
     * @returns Array of 10 public rooms with occupancy information
     */
    static async getPublicRooms(): Promise<PublicRoom[]> {
        // Fetch the first 10 rooms with their participant counts
        const rooms = await PRISMA_DB_CLIENT.room.findMany({
            take: 10,
            select: {
                id: true,
                name: true,
                capacity: true,
                currentOccupancy: true,
            },
            orderBy: {
                name: 'asc',
            },
        });

        // Map to PublicRoom interface with isFull flag
        return rooms.map(room => ({
            id: room.id,
            name: room.name,
            currentOccupancy: room.currentOccupancy,
            capacity: room.capacity,
            isFull: room.currentOccupancy >= room.capacity,
        }));
    }

    /**
     * Adds an anonymous user to a room with capacity checking and single room enforcement.
     * 
     * Requirement 3.3: Add the Anonymous_User to the selected Study_Room
     * Requirement 3.4: Increment the room's occupancy count when user joins
     * Requirement 3.5: Prevent additional users from joining if room is at capacity
     * Requirement 11.5: Limit to 1 active room per IP_Identifier
     * 
     * @param roomId - The ID of the room to join
     * @param userId - The ID of the anonymous user
     * @param ipAddress - The IP address of the user (for single room enforcement)
     * @returns JoinRoomResult with success status, room info, and participants
     */
    static async joinRoom(
        roomId: string,
        userId: string,
        ipAddress: string
    ): Promise<JoinRoomResult> {
        // Hash the IP address for lookup
        const hashedIp = SecurityService.hashIpAddress(ipAddress);

        // Check if user is already in another room (single room membership enforcement)
        const existingParticipation = await PRISMA_DB_CLIENT.roomParticipant.findFirst({
            where: {
                anonymousUser: {
                    hashedIp: hashedIp,
                },
            },
            include: {
                room: true,
            },
        });

        if (existingParticipation) {
            // Get room info for error response
            const room = await PRISMA_DB_CLIENT.room.findUnique({
                where: { id: roomId },
            });

            return {
                success: false,
                room: room ? {
                    id: room.id,
                    name: room.name,
                    currentOccupancy: room.currentOccupancy,
                    capacity: room.capacity,
                    isFull: room.currentOccupancy >= room.capacity,
                } : {} as PublicRoom,
                participants: [],
                error: "You are already in a room. Please leave your current room first.",
            };
        }

        // Check if room has capacity
        const hasCapacity = await this.hasCapacity(roomId);
        if (!hasCapacity) {
            const room = await PRISMA_DB_CLIENT.room.findUnique({
                where: { id: roomId },
            });

            return {
                success: false,
                room: room ? {
                    id: room.id,
                    name: room.name,
                    currentOccupancy: room.currentOccupancy,
                    capacity: room.capacity,
                    isFull: true,
                } : {} as PublicRoom,
                participants: [],
                error: "This room is at maximum capacity",
            };
        }

        // Verify user exists
        const user = await PRISMA_DB_CLIENT.anonymousUser.findUnique({
            where: { id: userId },
        });

        if (!user) {
            const room = await PRISMA_DB_CLIENT.room.findUnique({
                where: { id: roomId },
            });

            return {
                success: false,
                room: room ? {
                    id: room.id,
                    name: room.name,
                    currentOccupancy: room.currentOccupancy,
                    capacity: room.capacity,
                    isFull: room.currentOccupancy >= room.capacity,
                } : {} as PublicRoom,
                participants: [],
                error: "User not found",
            };
        }

        // Use a transaction to ensure atomicity
        const result = await PRISMA_DB_CLIENT.$transaction(async (tx) => {
            // Create room participant record
            await tx.roomParticipant.create({
                data: {
                    roomId,
                    anonymousUserId: userId,
                },
            });

            // Increment room occupancy
            const updatedRoom = await tx.room.update({
                where: { id: roomId },
                data: {
                    currentOccupancy: {
                        increment: 1,
                    },
                },
            });

            // Get all participants in the room
            const participants = await tx.roomParticipant.findMany({
                where: { roomId },
                include: {
                    anonymousUser: true,
                },
            });

            return {
                room: updatedRoom,
                participants,
            };
        });

        // Map participants to the expected format
        const participantList: Participant[] = result.participants.map(p => ({
            id: p.anonymousUser.id,
            displayName: p.anonymousUser.displayName,
            isVideoEnabled: p.isVideoEnabled,
            isAudioEnabled: p.isAudioEnabled,
            joinedAt: p.joinedAt,
        }));

        return {
            success: true,
            room: {
                id: result.room.id,
                name: result.room.name,
                currentOccupancy: result.room.currentOccupancy,
                capacity: result.room.capacity,
                isFull: result.room.currentOccupancy >= result.room.capacity,
            },
            participants: participantList,
        };
    }

    /**
     * Removes a user from a room and decrements the occupancy count.
     * 
     * Requirement 3.4: Decrement occupancy when user leaves
     * 
     * @param roomId - The ID of the room to leave
     * @param userId - The ID of the anonymous user
     */
    static async leaveRoom(roomId: string, userId: string): Promise<void> {
        // Check if user is in the room
        const participation = await PRISMA_DB_CLIENT.roomParticipant.findUnique({
            where: {
                roomId_anonymousUserId: {
                    roomId,
                    anonymousUserId: userId,
                },
            },
        });

        if (!participation) {
            // User is not in the room, nothing to do
            return;
        }

        // Use a transaction to ensure atomicity
        await PRISMA_DB_CLIENT.$transaction(async (tx) => {
            // Delete room participant record
            await tx.roomParticipant.delete({
                where: {
                    roomId_anonymousUserId: {
                        roomId,
                        anonymousUserId: userId,
                    },
                },
            });

            // Decrement room occupancy (but don't go below 0)
            await tx.room.update({
                where: { id: roomId },
                data: {
                    currentOccupancy: {
                        decrement: 1,
                    },
                },
            });
        });
    }

    /**
     * Gets the list of current participants in a room.
     * 
     * Requirement 7.1: Display the Participant_List when user joins
     * Requirement 7.2: Show each participant's display name
     * Requirement 7.5: Indicate each participant's audio and video status
     * 
     * @param roomId - The ID of the room
     * @returns Array of participants with their information
     */
    static async getRoomParticipants(roomId: string): Promise<Participant[]> {
        const participants = await PRISMA_DB_CLIENT.roomParticipant.findMany({
            where: { roomId },
            include: {
                anonymousUser: true,
            },
        });

        return participants.map(p => ({
            id: p.anonymousUser.id,
            displayName: p.anonymousUser.displayName,
            isVideoEnabled: p.isVideoEnabled,
            isAudioEnabled: p.isAudioEnabled,
            joinedAt: p.joinedAt,
        }));
    }

    /**
     * Checks if a room has available capacity.
     * 
     * Requirement 3.5: Check if room is at capacity before allowing join
     * 
     * @param roomId - The ID of the room to check
     * @returns true if room has capacity, false otherwise
     */
    static async hasCapacity(roomId: string): Promise<boolean> {
        const room = await PRISMA_DB_CLIENT.room.findUnique({
            where: { id: roomId },
            select: {
                currentOccupancy: true,
                capacity: true,
            },
        });

        if (!room) {
            return false;
        }

        return room.currentOccupancy < room.capacity;
    }
}
