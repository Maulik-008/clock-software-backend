import { PRISMA_DB_CLIENT } from "../../prisma";
import { Prisma } from "../../../prisma/src/generated/client";

/**
 * Room Service
 * 
 * Core business logic for Shared Study Rooms feature.
 * Implements room management, capacity enforcement, and participant tracking
 * with atomic operations using Prisma transactions.
 * 
 * Requirements: 1.1, 1.2, 1.3, 2.3, 2.4, 3.3, 10.1, 10.2, 10.3
 */

export interface RoomWithOccupancy {
    id: string;
    name: string;
    capacity: number;
    currentOccupancy: number;
    availableSpots: number;
}

export interface JoinRoomResult {
    success: boolean;
    participantId: string;
    room: {
        id: string;
        name: string;
        currentOccupancy: number;
    };
}

export interface LeaveRoomResult {
    success: boolean;
    sessionDuration: number; // in seconds
    room: {
        id: string;
        currentOccupancy: number;
    };
}

export class RoomService {
    
    /**
     * Get all rooms with occupancy information
     * 
     * Fetches all rooms from the database and calculates available spots
     * for each room using the helper function.
     * 
     * @returns Array of rooms with occupancy data
     * @validates Requirements 1.1, 1.2
     */
    async getRooms(): Promise<RoomWithOccupancy[]> {
        const rooms = await PRISMA_DB_CLIENT.room.findMany({
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

        return rooms.map(room => ({
            ...room,
            availableSpots: this.calculateAvailableSpots(room.capacity, room.currentOccupancy),
        }));
    }

    /**
     * Calculate available spots in a room
     * 
     * Helper function that computes available capacity as (capacity - current_occupancy).
     * Ensures the result is never negative.
     * 
     * @param capacity - Maximum room capacity
     * @param currentOccupancy - Current number of participants
     * @returns Number of available spots (always >= 0)
     * @validates Requirements 1.3
     */
    calculateAvailableSpots(capacity: number, currentOccupancy: number): number {
        return Math.max(0, capacity - currentOccupancy);
    }

    /**
     * Join a room with atomic capacity enforcement
     * 
     * Uses Prisma transaction with SELECT FOR UPDATE to ensure atomic operations
     * and prevent race conditions. The transaction:
     * 1. Locks the room row with SELECT FOR UPDATE
     * 2. Checks if capacity is available
     * 3. Increments occupancy counter
     * 4. Creates participant record
     * 
     * All operations succeed together or fail together (atomicity).
     * 
     * @param userId - ID of the user joining the room
     * @param roomId - ID of the room to join
     * @returns Join result with participant and room information
     * @throws Error if room is full or room doesn't exist
     * @validates Requirements 2.3, 2.4, 10.1, 10.2, 10.3
     */
    async joinRoom(userId: number, roomId: string): Promise<JoinRoomResult> {
        try {
            const result = await PRISMA_DB_CLIENT.$transaction(async (tx) => {
                // Step 1: Lock the room row with SELECT FOR UPDATE
                // This prevents concurrent join requests from causing race conditions
                const room = await tx.$queryRaw<Array<{
                    id: string;
                    name: string;
                    capacity: number;
                    current_occupancy: number;
                }>>`
                    SELECT id, name, capacity, current_occupancy
                    FROM rooms
                    WHERE id = ${roomId}::text::uuid
                    FOR UPDATE
                `;

                if (!room || room.length === 0) {
                    throw new Error('Room not found');
                }

                const lockedRoom = room[0];

                // Step 2: Check if room has available capacity
                if (lockedRoom.current_occupancy >= lockedRoom.capacity) {
                    throw new Error('Room is at full capacity');
                }

                // Step 3: Check if user is already a participant in this room
                const existingParticipant = await tx.participant.findUnique({
                    where: {
                        userId_roomId: {
                            userId,
                            roomId,
                        },
                    },
                });

                if (existingParticipant) {
                    throw new Error('User is already a participant in this room');
                }

                // Step 4: Increment occupancy counter atomically
                const updatedRoom = await tx.room.update({
                    where: { id: roomId },
                    data: {
                        currentOccupancy: {
                            increment: 1,
                        },
                    },
                    select: {
                        id: true,
                        name: true,
                        currentOccupancy: true,
                    },
                });

                // Step 5: Create participant record with ACTIVE status
                const participant = await tx.participant.create({
                    data: {
                        userId,
                        roomId,
                        status: 'ACTIVE',
                    },
                    select: {
                        id: true,
                    },
                });

                return {
                    success: true,
                    participantId: participant.id,
                    room: updatedRoom,
                };
            }, {
                isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
                timeout: 10000, // 10 second timeout
            });

            return result;
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Failed to join room');
        }
    }

    /**
     * Leave a room with occupancy decrement
     * 
     * Removes the participant from the room and decrements the occupancy counter.
     * Calculates session duration for logging purposes.
     * Ensures occupancy never goes below zero.
     * 
     * @param userId - ID of the user leaving the room
     * @param roomId - ID of the room to leave
     * @returns Leave result with session duration and updated occupancy
     * @throws Error if user is not a participant in the room
     * @validates Requirements 3.3, 10.3
     */
    async leaveRoom(userId: number, roomId: string): Promise<LeaveRoomResult> {
        try {
            const result = await PRISMA_DB_CLIENT.$transaction(async (tx) => {
                // Step 1: Find the participant record
                const participant = await tx.participant.findUnique({
                    where: {
                        userId_roomId: {
                            userId,
                            roomId,
                        },
                    },
                });

                if (!participant) {
                    throw new Error('User is not a participant in this room');
                }

                // Step 2: Calculate session duration
                const now = new Date();
                const sessionDurationMs = now.getTime() - participant.joinedAt.getTime();
                const sessionDurationSeconds = Math.floor(sessionDurationMs / 1000);

                // Step 3: Delete the participant record
                await tx.participant.delete({
                    where: {
                        id: participant.id,
                    },
                });

                // Step 4: Decrement occupancy counter (with safety check)
                // Get current occupancy first
                const room = await tx.room.findUnique({
                    where: { id: roomId },
                    select: { currentOccupancy: true },
                });

                if (!room) {
                    throw new Error('Room not found');
                }

                // Only decrement if occupancy is greater than 0
                const newOccupancy = Math.max(0, room.currentOccupancy - 1);

                const updatedRoom = await tx.room.update({
                    where: { id: roomId },
                    data: {
                        currentOccupancy: newOccupancy,
                    },
                    select: {
                        id: true,
                        currentOccupancy: true,
                    },
                });

                // Step 5: Create session log entry
                await tx.sessionLog.create({
                    data: {
                        userId,
                        roomId,
                        duration: sessionDurationSeconds,
                    },
                });

                return {
                    success: true,
                    sessionDuration: sessionDurationSeconds,
                    room: updatedRoom,
                };
            }, {
                isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
                timeout: 10000, // 10 second timeout
            });

            return result;
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Failed to leave room');
        }
    }

    /**
     * Get a specific room by ID
     * 
     * @param roomId - ID of the room to retrieve
     * @returns Room with occupancy information or null if not found
     */
    async getRoomById(roomId: string): Promise<RoomWithOccupancy | null> {
        const room = await PRISMA_DB_CLIENT.room.findUnique({
            where: { id: roomId },
            select: {
                id: true,
                name: true,
                capacity: true,
                currentOccupancy: true,
            },
        });

        if (!room) {
            return null;
        }

        return {
            ...room,
            availableSpots: this.calculateAvailableSpots(room.capacity, room.currentOccupancy),
        };
    }

    /**
     * Check if a user is a participant in a room
     * 
     * @param userId - ID of the user
     * @param roomId - ID of the room
     * @returns True if user is a participant, false otherwise
     */
    async isParticipant(userId: number, roomId: string): Promise<boolean> {
        const participant = await PRISMA_DB_CLIENT.participant.findUnique({
            where: {
                userId_roomId: {
                    userId,
                    roomId,
                },
            },
        });

        return participant !== null;
    }

    /**
     * Get all participants in a room
     * 
     * @param roomId - ID of the room
     * @returns Array of participants with user information
     */
    async getRoomParticipants(roomId: string) {
        const participants = await PRISMA_DB_CLIENT.participant.findMany({
            where: { roomId },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
            orderBy: {
                joinedAt: 'asc',
            },
        });

        return participants.map(p => ({
            id: p.id,
            userId: p.userId,
            userName: `${p.user.firstName} ${p.user.lastName}`.trim(),
            joinedAt: p.joinedAt,
            status: p.status,
        }));
    }

    /**
     * Get participant count for a room
     * 
     * @param roomId - ID of the room
     * @returns Current number of participants
     */
    async getParticipantCount(roomId: string): Promise<number> {
        const count = await PRISMA_DB_CLIENT.participant.count({
            where: { roomId },
        });

        return count;
    }

    /**
     * Create a message in a room
     * 
     * Stores a message in the database with validation and sanitization.
     * Validates that message content is not empty, sanitizes content to remove
     * XSS patterns, and supports TEXT, EMOJI, and POLL message types.
     * 
     * @param userId - ID of the user sending the message
     * @param roomId - ID of the room where message is sent
     * @param content - Raw message content
     * @param type - Message type (TEXT, EMOJI, or POLL)
     * @returns Created message with user information
     * @throws Error if content is empty or message creation fails
     * @validates Requirements 4.1, 4.2, 4.3, 4.5, 4.6, 9.7
     */
    async createMessage(
        userId: number,
        roomId: string,
        content: string,
        type: 'TEXT' | 'EMOJI' | 'POLL' = 'TEXT'
    ) {
        // Validate message content is not empty (Requirement 4.1)
        if (!content || content.trim().length === 0) {
            throw new Error('Message content cannot be empty');
        }

        // Validate message content length (Requirement 4.2)
        if (content.length > 1000) {
            throw new Error('Message content exceeds maximum length of 1000 characters');
        }

        // Sanitize message content to remove XSS patterns (Requirement 9.7)
        const sanitizedContent = this.sanitizeMessageContent(content);

        // Validate message type (Requirement 4.5)
        const validTypes: Array<'TEXT' | 'EMOJI' | 'POLL'> = ['TEXT', 'EMOJI', 'POLL'];
        if (!validTypes.includes(type)) {
            throw new Error('Invalid message type. Must be TEXT, EMOJI, or POLL');
        }

        try {
            // Store message in database with all required fields (Requirements 4.3, 4.6)
            const message = await PRISMA_DB_CLIENT.message.create({
                data: {
                    roomId,
                    userId,
                    content: sanitizedContent,
                    type,
                    // timestamp is automatically set by default(now()) in schema
                },
                select: {
                    id: true,
                    content: true,
                    type: true,
                    timestamp: true,
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                        },
                    },
                },
            });

            return {
                id: message.id,
                userId: message.user.id,
                userName: `${message.user.firstName} ${message.user.lastName}`.trim(),
                content: message.content,
                type: message.type,
                timestamp: message.timestamp,
            };
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Failed to create message');
        }
    }

    /**
     * Sanitize message content to prevent XSS attacks
     * 
     * Removes or escapes potentially dangerous HTML/JavaScript patterns including:
     * - <script> tags and their content
     * - javascript: protocol
     * - on* event handlers (onclick, onerror, etc.)
     * - <iframe> tags
     * - <object> and <embed> tags
     * - Remaining HTML tags (converted to entities)
     * 
     * @param content - Raw message content
     * @returns Sanitized content safe from XSS attacks
     * @validates Requirements 9.7
     */
    private sanitizeMessageContent(content: string): string {
        // Remove script tags and their content
        let sanitized = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        
        // Remove javascript: protocol
        sanitized = sanitized.replace(/javascript:/gi, '');
        
        // Remove on* event handlers (onclick, onerror, etc.)
        sanitized = sanitized.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
        sanitized = sanitized.replace(/\son\w+\s*=\s*[^\s>]*/gi, '');
        
        // Remove iframe tags
        sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
        
        // Remove object and embed tags
        sanitized = sanitized.replace(/<(object|embed)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, '');
        
        // Escape remaining HTML tags (convert < and > to entities)
        sanitized = sanitized.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        return sanitized.trim();
    }

    /**
     * Query session logs by user ID
     * 
     * Retrieves all session logs for a specific user across all rooms.
     * Results are ordered by creation date (most recent first).
     * 
     * @param userId - ID of the user
     * @returns Array of session logs for the user
     * @validates Requirements 12.6
     */
    async getSessionLogsByUserId(userId: number) {
        const sessionLogs = await PRISMA_DB_CLIENT.sessionLog.findMany({
            where: { userId },
            include: {
                room: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return sessionLogs.map(log => ({
            id: log.id,
            userId: log.userId,
            roomId: log.roomId,
            roomName: log.room.name,
            duration: log.duration,
            createdAt: log.createdAt,
        }));
    }

    /**
     * Query session logs by room ID
     * 
     * Retrieves all session logs for a specific room across all users.
     * Results are ordered by creation date (most recent first).
     * 
     * @param roomId - ID of the room
     * @returns Array of session logs for the room
     * @validates Requirements 12.6
     */
    async getSessionLogsByRoomId(roomId: string) {
        const sessionLogs = await PRISMA_DB_CLIENT.sessionLog.findMany({
            where: { roomId },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return sessionLogs.map(log => ({
            id: log.id,
            userId: log.userId,
            userName: `${log.user.firstName} ${log.user.lastName}`.trim(),
            roomId: log.roomId,
            duration: log.duration,
            createdAt: log.createdAt,
        }));
    }

    /**
     * Query session logs by date range
     * 
     * Retrieves all session logs within a specified date range.
     * Can optionally filter by user ID or room ID.
     * Results are ordered by creation date (most recent first).
     * 
     * @param startDate - Start of the date range (inclusive)
     * @param endDate - End of the date range (inclusive)
     * @param userId - Optional user ID filter
     * @param roomId - Optional room ID filter
     * @returns Array of session logs within the date range
     * @validates Requirements 12.6
     */
    async getSessionLogsByDateRange(
        startDate: Date,
        endDate: Date,
        userId?: number,
        roomId?: string
    ) {
        const where: any = {
            createdAt: {
                gte: startDate,
                lte: endDate,
            },
        };

        if (userId !== undefined) {
            where.userId = userId;
        }

        if (roomId !== undefined) {
            where.roomId = roomId;
        }

        const sessionLogs = await PRISMA_DB_CLIENT.sessionLog.findMany({
            where,
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
                room: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return sessionLogs.map(log => ({
            id: log.id,
            userId: log.userId,
            userName: `${log.user.firstName} ${log.user.lastName}`.trim(),
            roomId: log.roomId,
            roomName: log.room.name,
            duration: log.duration,
            createdAt: log.createdAt,
        }));
    }
}
