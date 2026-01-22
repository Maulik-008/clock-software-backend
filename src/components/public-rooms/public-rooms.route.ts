import { Router, Request, Response, NextFunction } from "express";
import { PublicRoomsController } from "./public-rooms.controller";
import {
    apiRateLimitMiddleware,
    joinAttemptRateLimitMiddleware,
} from "./rate-limiter.middleware";
import {
    createUserValidation,
    joinRoomValidation,
    leaveRoomValidation,
} from "./public-rooms.validation";

/**
 * Public rooms router - all routes are accessible without authentication
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.5, 11.1, 11.2, 13.1, 13.2
 */
const publicRoomsRouter = Router();

// Initialize controller
const publicRoomsController = new PublicRoomsController();

// Wrapper functions to handle typing
const handleGetRooms = async (req: Request, res: Response, next: NextFunction) => {
    await publicRoomsController.getRooms(req, res, next);
};

const handleCreateUser = async (req: Request, res: Response, next: NextFunction) => {
    await publicRoomsController.createUser(req, res, next);
};

const handleJoinRoom = async (req: Request, res: Response, next: NextFunction) => {
    await publicRoomsController.joinRoom(req, res, next);
};

const handleLeaveRoom = async (req: Request, res: Response, next: NextFunction) => {
    await publicRoomsController.leaveRoom(req, res, next);
};

/**
 * GET /api/public/rooms
 * Returns list of 10 public rooms with occupancy
 * No authentication required
 * Rate limit: 100 requests/minute per IP
 * 
 * Requirement 9.1: Public endpoint to retrieve list of 10 study rooms
 * Requirement 9.5: No JWT authentication required
 * Requirement 11.1: API rate limiting (100 requests/minute)
 */
publicRoomsRouter.get(
    "/rooms",
    apiRateLimitMiddleware,
    handleGetRooms
);

/**
 * POST /api/public/users
 * Creates anonymous user with display name
 * No authentication required
 * Rate limit: 100 requests/minute per IP (using API rate limiter)
 * 
 * Requirement 9.2: Public endpoint to create a Temporary_User_Record
 * Requirement 9.5: No JWT authentication required
 * Requirement 11.1: API rate limiting
 */
publicRoomsRouter.post(
    "/users",
    apiRateLimitMiddleware,
    createUserValidation,
    handleCreateUser
);

/**
 * POST /api/public/rooms/:roomId/join
 * Joins a room as anonymous user
 * No authentication required
 * Rate limit: 5 join attempts/minute per IP
 * 
 * Requirement 9.3: Public endpoint to join a Study_Room
 * Requirement 9.5: No JWT authentication required
 * Requirement 13.1: Limit join attempts to 5 per minute
 * Requirement 13.2: Block IP for 5 minutes after limit exceeded
 */
publicRoomsRouter.post(
    "/rooms/:roomId/join",
    joinAttemptRateLimitMiddleware,
    joinRoomValidation,
    handleJoinRoom
);

/**
 * POST /api/public/rooms/:roomId/leave
 * Leaves a room
 * No authentication required
 * Rate limit: 100 requests/minute per IP (using API rate limiter)
 * 
 * Requirement 9.3: Public endpoint for room operations
 * Requirement 9.5: No JWT authentication required
 * Requirement 11.1: API rate limiting
 */
publicRoomsRouter.post(
    "/rooms/:roomId/leave",
    apiRateLimitMiddleware,
    leaveRoomValidation,
    handleLeaveRoom
);

export default publicRoomsRouter;
