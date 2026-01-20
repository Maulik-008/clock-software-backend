import { Router, Request, Response, NextFunction } from "express";
import { RoomController } from "./room.controller";
import { RoomService } from "./room.service";
import { authenticate, requireRole } from "../../middlewares/authentication";
import {
    apiRateLimiter,
    chatRateLimiter,
    roomOperationRateLimiter,
} from "../../middlewares/rateLimit";
import {
    validateJoinRoom,
    validateLeaveRoom,
    validateSendMessage,
    validateTimerSync,
    validateModerate,
} from "./room.validation";

/**
 * Room Routes
 * 
 * Express routes for Shared Study Rooms feature.
 * All routes require JWT authentication and apply rate limiting.
 * 
 * Requirements: 1.1, 2.1, 3.1, 4.1, 6.1, 7.1, 9.1
 */

// Initialize service and controller
const roomService = new RoomService();
const roomController = new RoomController(roomService);

const roomRouter = Router();

// Wrapper functions to handle typing
const handleGetRoomList = async (req: Request, res: Response, next: NextFunction) => {
    await roomController.getRoomList(req, res, next);
};

const handleJoinRoom = async (req: Request, res: Response, next: NextFunction) => {
    await roomController.joinRoom(req as any, res, next);
};

const handleLeaveRoom = async (req: Request, res: Response, next: NextFunction) => {
    await roomController.leaveRoom(req as any, res, next);
};

const handleSendMessage = async (req: Request, res: Response, next: NextFunction) => {
    await roomController.sendMessage(req as any, res, next);
};

const handleSyncTimer = async (req: Request, res: Response, next: NextFunction) => {
    await roomController.syncTimer(req as any, res, next);
};

const handleModerateParticipant = async (req: Request, res: Response, next: NextFunction) => {
    await roomController.moderateParticipant(req as any, res, next);
};

/**
 * @route   GET /api/rooms
 * @desc    Get list of all rooms with occupancy information
 * @access  Private (Authenticated users)
 * @validates Requirements 1.1, 1.2, 1.3, 1.4, 9.1
 */
// @ts-ignore
roomRouter.get("/", authenticate, apiRateLimiter, handleGetRoomList);

/**
 * @route   POST /api/rooms/:id/join
 * @desc    Join a study room
 * @access  Private (Authenticated users)
 * @validates Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 9.1, 9.4, 9.5, 9.6, 10.4, 11.2
 */
// @ts-ignore
roomRouter.post("/:id/join", authenticate, roomOperationRateLimiter, validateJoinRoom, handleJoinRoom);

/**
 * @route   POST /api/rooms/:id/leave
 * @desc    Leave a study room
 * @access  Private (Authenticated users)
 * @validates Requirements 3.1, 3.2, 3.3, 3.4, 9.1, 9.4, 9.5, 9.6, 11.1
 */
// @ts-ignore
roomRouter.post("/:id/leave", authenticate, roomOperationRateLimiter, validateLeaveRoom, handleLeaveRoom);

/**
 * @route   POST /api/rooms/:id/chat
 * @desc    Send a message in a study room
 * @access  Private (Authenticated users)
 * @validates Requirements 4.1, 4.2, 4.3, 4.5, 4.6, 9.1, 9.4, 9.5, 9.6, 9.7
 */
// @ts-ignore
roomRouter.post("/:id/chat", authenticate, chatRateLimiter, validateSendMessage, handleSendMessage);

/**
 * @route   POST /api/rooms/:id/timer-sync
 * @desc    Synchronize Pomodoro timer state
 * @access  Private (Authenticated users)
 * @validates Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 9.1, 9.4, 9.5, 9.6
 */
// @ts-ignore
roomRouter.post("/:id/timer-sync", authenticate, apiRateLimiter, validateTimerSync, handleSyncTimer);

/**
 * @route   POST /api/admin/rooms/:id/moderate
 * @desc    Moderate a participant (mute or kick)
 * @access  Private (Admin only)
 * @validates Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 9.1, 9.4, 9.5, 9.6
 */
// @ts-ignore
roomRouter.post("/admin/:id/moderate", authenticate, requireRole(['SUPER_ADMIN', 'ADMIN']), apiRateLimiter, validateModerate, handleModerateParticipant);

export default roomRouter;
