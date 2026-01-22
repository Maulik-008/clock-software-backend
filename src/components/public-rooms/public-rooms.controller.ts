import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { AnonymousUserService } from "./anonymous-user.service";
import { PublicRoomService } from "./public-room.service";

/**
 * PublicRoomsController handles HTTP requests for public room endpoints.
 * These endpoints do not require authentication.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.5
 */
export class PublicRoomsController {
    /**
     * GET /api/public/rooms
     * Returns list of 10 public rooms with occupancy information.
     * No authentication required.
     * 
     * Requirement 9.1: Provide public endpoint to retrieve list of 10 study rooms
     * Requirement 9.5: Public endpoints shall not require JWT authentication
     */
    async getRooms(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const rooms = await PublicRoomService.getPublicRooms();

            res.status(200).json({
                success: true,
                data: {
                    rooms,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/public/users
     * Creates or retrieves an anonymous user by IP address and display name.
     * No authentication required.
     * 
     * Requirement 9.2: Provide public endpoint to create a Temporary_User_Record
     * Requirement 9.5: Public endpoints shall not require JWT authentication
     */
    async createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    error: {
                        code: "INVALID_INPUT",
                        message: "Validation failed",
                        details: errors.array(),
                    },
                });
                return;
            }

            const { displayName } = req.body;
            const ipAddress = req.ip || req.socket.remoteAddress || "unknown";

            // Create or get user
            const user = await AnonymousUserService.createOrGetUser(ipAddress, displayName);

            res.status(201).json({
                success: true,
                data: {
                    userId: user.id,
                    displayName: user.displayName,
                },
            });
        } catch (error) {
            // Handle validation errors from service
            if (error instanceof Error && error.message.includes("Invalid display name")) {
                res.status(400).json({
                    error: {
                        code: "INVALID_DISPLAY_NAME",
                        message: error.message,
                    },
                });
                return;
            }
            next(error);
        }
    }

    /**
     * POST /api/public/rooms/:roomId/join
     * Joins a room as an anonymous user.
     * No authentication required.
     * 
     * Requirement 9.3: Provide public endpoint to join a Study_Room
     * Requirement 9.5: Public endpoints shall not require JWT authentication
     */
    async joinRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    error: {
                        code: "INVALID_INPUT",
                        message: "Validation failed",
                        details: errors.array(),
                    },
                });
                return;
            }

            const { roomId } = req.params;
            const { userId } = req.body;
            const ipAddress = req.ip || req.socket.remoteAddress || "unknown";

            // Attempt to join room
            const result = await PublicRoomService.joinRoom(roomId, userId, ipAddress);

            if (!result.success) {
                // Determine appropriate status code based on error
                let statusCode = 400;
                let errorCode = "JOIN_FAILED";

                if (result.error?.includes("already in a room")) {
                    statusCode = 409;
                    errorCode = "ALREADY_IN_ROOM";
                } else if (result.error?.includes("maximum capacity")) {
                    statusCode = 409;
                    errorCode = "ROOM_FULL";
                } else if (result.error?.includes("not found")) {
                    statusCode = 404;
                    errorCode = "USER_NOT_FOUND";
                }

                res.status(statusCode).json({
                    error: {
                        code: errorCode,
                        message: result.error,
                    },
                });
                return;
            }

            res.status(200).json({
                success: true,
                data: {
                    room: result.room,
                    participants: result.participants,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/public/rooms/:roomId/leave
     * Leaves a room.
     * No authentication required.
     * 
     * Requirement 9.3: Provide public endpoint for room operations
     * Requirement 9.5: Public endpoints shall not require JWT authentication
     */
    async leaveRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    error: {
                        code: "INVALID_INPUT",
                        message: "Validation failed",
                        details: errors.array(),
                    },
                });
                return;
            }

            const { roomId } = req.params;
            const { userId } = req.body;

            // Leave room
            await PublicRoomService.leaveRoom(roomId, userId);

            res.status(200).json({
                success: true,
                message: "Successfully left the room",
            });
        } catch (error) {
            next(error);
        }
    }
}
