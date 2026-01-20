import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import createError from "http-errors";
import { RoomService } from "./room.service";
import { AuthenticatedRequest } from "../../middlewares/authentication";
import { PRISMA_DB_CLIENT } from "../../prisma";
import { Prisma } from "../../../prisma/src/generated/client";

/**
 * Room Controller
 * 
 * HTTP request handlers for Shared Study Rooms feature.
 * Implements REST API endpoints for room management, messaging, timer sync, and moderation.
 * 
 * Requirements: 1.1, 2.1, 3.1, 4.1, 6.1, 7.1
 */

export class RoomController {
    constructor(private roomService: RoomService) {}

    /**
     * GET /api/rooms
     * Get list of all rooms with occupancy information
     * 
     * Returns all 10 predefined rooms with their current occupancy,
     * capacity, and available spots.
     * 
     * @validates Requirements 1.1, 1.2, 1.3, 1.4, 11.5
     */
    async getRoomList(req: Request, res: Response, next: NextFunction) {
        try {
            const rooms = await this.roomService.getRooms();

            res.status(200).json({
                success: true,
                message: "Rooms retrieved successfully",
                data: {
                    rooms: rooms.map(room => ({
                        id: room.id,
                        name: room.name,
                        capacity: room.capacity,
                        current_occupancy: room.currentOccupancy,
                        available_spots: room.availableSpots,
                    })),
                },
            });
        } catch (error) {
            // Database errors return 500
            if (error instanceof Prisma.PrismaClientKnownRequestError || 
                error instanceof Prisma.PrismaClientUnknownRequestError) {
                return next(createError(500, "Internal server error"));
            }
            next(createError(500, "Internal server error"));
        }
    }

    /**
     * POST /api/rooms/:id/join
     * Join a study room
     * 
     * Allows an authenticated user to join a room if capacity is available.
     * Uses atomic transactions to prevent race conditions and enforce capacity limits.
     * 
     * @validates Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 10.4, 11.1, 11.2, 11.3, 11.4, 11.5
     */
    async joinRoom(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            // Validate request - return 400 for validation failures
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return next(createError(400, "Validation failed", { 
                    details: errors.array() 
                }));
            }

            // Check authentication - return 401 for authentication failures
            if (!req.user) {
                return next(createError(401, "Unauthorized"));
            }

            const roomId = req.params.id;
            const userId = req.user.id;

            // Attempt to join the room
            try {
                const result = await this.roomService.joinRoom(userId, roomId);

                res.status(200).json({
                    success: true,
                    message: "Successfully joined room",
                    data: {
                        participant_id: result.participantId,
                        room: {
                            id: result.room.id,
                            name: result.room.name,
                            current_occupancy: result.room.currentOccupancy,
                        },
                    },
                });
            } catch (error) {
                if (error instanceof Error) {
                    // Return 404 for room not found
                    if (error.message === 'Room not found') {
                        return next(createError(404, "Room not found"));
                    }
                    // Return 429 for room at full capacity
                    if (error.message === 'Room is at full capacity') {
                        return next(createError(429, "Room is at full capacity"));
                    }
                    // Return 400 for already a participant
                    if (error.message === 'User is already a participant in this room') {
                        return next(createError(400, "User is already a participant in this room"));
                    }
                }
                // Database errors return 500
                if (error instanceof Prisma.PrismaClientKnownRequestError || 
                    error instanceof Prisma.PrismaClientUnknownRequestError) {
                    return next(createError(500, "Internal server error"));
                }
                throw error;
            }
        } catch (error) {
            // Catch-all for unexpected errors - return 500
            next(createError(500, "Internal server error"));
        }
    }

    /**
     * POST /api/rooms/:id/leave
     * Leave a study room
     * 
     * Allows an authenticated user to leave a room they are currently in.
     * Decrements occupancy counter and logs session duration.
     * 
     * @validates Requirements 3.1, 3.2, 3.3, 3.4, 11.1, 11.3, 11.4, 11.5
     */
    async leaveRoom(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            // Validate request - return 400 for validation failures
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return next(createError(400, "Validation failed", { 
                    details: errors.array() 
                }));
            }

            // Check authentication - return 401 for authentication failures
            if (!req.user) {
                return next(createError(401, "Unauthorized"));
            }

            const roomId = req.params.id;
            const userId = req.user.id;

            // Attempt to leave the room
            try {
                const result = await this.roomService.leaveRoom(userId, roomId);

                res.status(200).json({
                    success: true,
                    message: "Successfully left room",
                    data: {
                        session_duration: result.sessionDuration,
                        room: {
                            id: result.room.id,
                            current_occupancy: result.room.currentOccupancy,
                        },
                    },
                });
            } catch (error) {
                if (error instanceof Error) {
                    // Return 404 for user not a participant or room not found
                    if (error.message === 'User is not a participant in this room') {
                        return next(createError(404, "User is not a participant in this room"));
                    }
                    if (error.message === 'Room not found') {
                        return next(createError(404, "Room not found"));
                    }
                }
                // Database errors return 500
                if (error instanceof Prisma.PrismaClientKnownRequestError || 
                    error instanceof Prisma.PrismaClientUnknownRequestError) {
                    return next(createError(500, "Internal server error"));
                }
                throw error;
            }
        } catch (error) {
            // Catch-all for unexpected errors - return 500
            next(createError(500, "Internal server error"));
        }
    }

    /**
     * POST /api/rooms/:id/chat
     * Send a message in a study room
     * 
     * Allows an authenticated participant to send a text message in a room.
     * Validates message content and stores it in the database.
     * 
     * @validates Requirements 4.1, 4.2, 4.3, 4.5, 4.6, 9.7, 11.1, 11.3, 11.4, 11.5
     */
    async sendMessage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            // Validate request - return 400 for validation failures
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return next(createError(400, "Validation failed", { 
                    details: errors.array() 
                }));
            }

            // Check authentication - return 401 for authentication failures
            if (!req.user) {
                return next(createError(401, "Unauthorized"));
            }

            const roomId = req.params.id;
            const userId = req.user.id;
            const { content, type } = req.body;

            // Verify user is a participant in the room - return 403 for insufficient privileges
            const isParticipant = await this.roomService.isParticipant(userId, roomId);
            if (!isParticipant) {
                return next(createError(403, "User is not a participant in this room"));
            }

            // Store message using service layer
            try {
                const message = await this.roomService.createMessage(
                    userId,
                    roomId,
                    content,
                    type || 'TEXT'
                );

                res.status(201).json({
                    success: true,
                    message: "Message sent successfully",
                    data: {
                        message_id: message.id,
                        user_id: message.userId,
                        user_name: message.userName,
                        content: message.content,
                        type: message.type,
                        timestamp: message.timestamp.toISOString(),
                    },
                });
            } catch (error) {
                if (error instanceof Error) {
                    // Return 400 for validation errors from service
                    if (error.message.includes('empty') || error.message.includes('exceeds')) {
                        return next(createError(400, error.message));
                    }
                }
                // Database errors return 500
                if (error instanceof Prisma.PrismaClientKnownRequestError || 
                    error instanceof Prisma.PrismaClientUnknownRequestError) {
                    return next(createError(500, "Internal server error"));
                }
                throw error;
            }
        } catch (error) {
            // Catch-all for unexpected errors - return 500
            next(createError(500, "Internal server error"));
        }
    }

    /**
     * POST /api/rooms/:id/timer-sync
     * Synchronize Pomodoro timer state
     * 
     * Allows a participant to broadcast timer state changes to all room participants.
     * Supports timer actions: start, pause, resume, complete.
     * 
     * @validates Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 11.3, 11.4, 11.5
     */
    async syncTimer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            // Validate request - return 400 for validation failures
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return next(createError(400, "Validation failed", { 
                    details: errors.array() 
                }));
            }

            // Check authentication - return 401 for authentication failures
            if (!req.user) {
                return next(createError(401, "Unauthorized"));
            }

            const roomId = req.params.id;
            const userId = req.user.id;
            const { action, duration, start_time } = req.body;

            // Verify user is a participant in the room - return 403 for insufficient privileges
            const isParticipant = await this.roomService.isParticipant(userId, roomId);
            if (!isParticipant) {
                return next(createError(403, "User is not a participant in this room"));
            }

            // Log timer event in session log
            // Note: The actual broadcasting will be handled by Socket.io layer
            // This endpoint just validates and acknowledges the timer sync request
            try {
                await PRISMA_DB_CLIENT.sessionLog.create({
                    data: {
                        roomId,
                        userId,
                        duration: 0, // Timer events don't have a session duration
                    },
                });

                res.status(200).json({
                    success: true,
                    message: "Timer sync request received",
                    data: {
                        action,
                        duration,
                        start_time,
                        synced_by: userId,
                    },
                });
            } catch (error) {
                // Database errors return 500
                if (error instanceof Prisma.PrismaClientKnownRequestError || 
                    error instanceof Prisma.PrismaClientUnknownRequestError) {
                    return next(createError(500, "Internal server error"));
                }
                throw error;
            }
        } catch (error) {
            // Catch-all for unexpected errors - return 500
            next(createError(500, "Internal server error"));
        }
    }

    /**
     * POST /api/admin/rooms/:id/moderate
     * Moderate a participant (mute or kick)
     * 
     * Allows an administrator to mute or kick a participant from a room.
     * Requires admin privileges.
     * 
     * @validates Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 11.1, 11.3, 11.4, 11.5
     */
    async moderateParticipant(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            // Validate request - return 400 for validation failures
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return next(createError(400, "Validation failed", { 
                    details: errors.array() 
                }));
            }

            // Check authentication - return 401 for authentication failures
            if (!req.user) {
                return next(createError(401, "Unauthorized"));
            }

            // Check admin privileges - return 403 for insufficient privileges
            if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'ADMIN') {
                return next(createError(403, "Insufficient permissions. Admin access required."));
            }

            const roomId = req.params.id;
            const { action, target_user_id } = req.body;

            // Convert target_user_id from string (UUID) to number
            // Note: This assumes target_user_id is the actual numeric user ID
            // If it's a UUID, we need to look up the user first
            let targetUserId: number;
            
            try {
                // Check if target_user_id is a UUID or a number
                if (isNaN(Number(target_user_id))) {
                    // It's a UUID, look up the user
                    const targetUser = await PRISMA_DB_CLIENT.user.findUnique({
                        where: { id: target_user_id },
                        select: { id: true },
                    });

                    if (!targetUser) {
                        return next(createError(404, "Target user not found"));
                    }

                    targetUserId = targetUser.id;
                } else {
                    targetUserId = Number(target_user_id);
                }

                // Verify target user is a participant in the room - return 404 if not found
                const isParticipant = await this.roomService.isParticipant(targetUserId, roomId);
                if (!isParticipant) {
                    return next(createError(404, "Target user is not a participant in this room"));
                }

                if (action === 'mute') {
                    // Update participant status to MUTED
                    await PRISMA_DB_CLIENT.participant.update({
                        where: {
                            userId_roomId: {
                                userId: targetUserId,
                                roomId,
                            },
                        },
                        data: {
                            status: 'MUTED',
                        },
                    });

                    res.status(200).json({
                        success: true,
                        message: "Participant muted successfully",
                        data: {
                            action: 'mute',
                            target_user_id: targetUserId,
                            room_id: roomId,
                        },
                    });
                } else if (action === 'kick') {
                    // Remove participant from room (this will also decrement occupancy)
                    await this.roomService.leaveRoom(targetUserId, roomId);

                    res.status(200).json({
                        success: true,
                        message: "Participant kicked successfully",
                        data: {
                            action: 'kick',
                            target_user_id: targetUserId,
                            room_id: roomId,
                        },
                    });
                } else {
                    return next(createError(400, "Invalid moderation action"));
                }
            } catch (error) {
                // Database errors return 500
                if (error instanceof Prisma.PrismaClientKnownRequestError || 
                    error instanceof Prisma.PrismaClientUnknownRequestError) {
                    return next(createError(500, "Internal server error"));
                }
                throw error;
            }
        } catch (error) {
            // Catch-all for unexpected errors - return 500
            next(createError(500, "Internal server error"));
        }
    }
}
