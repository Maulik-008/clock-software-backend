// Export all public rooms services and middleware
export { SecurityService } from "./security.service";
export type { ValidationResult } from "./security.service";

export { RateLimiterService, RateLimitAction } from "./rate-limiter.service";
export type { RateLimitResult } from "./rate-limiter.service";

export {
    apiRateLimitMiddleware,
    joinAttemptRateLimitMiddleware,
    checkChatRateLimit,
} from "./rate-limiter.middleware";

export { AnonymousUserService } from "./anonymous-user.service";
export type { AnonymousUser } from "./anonymous-user.service";

export { PublicRoomService } from "./public-room.service";
export type { PublicRoom, Participant, JoinRoomResult } from "./public-room.service";

export { PublicRoomsController } from "./public-rooms.controller";
export { default as publicRoomsRouter } from "./public-rooms.route";

export {
    initializePublicRoomSocketServer,
    getPublicRoomSocketServer,
    PublicRoomSocketServer,
} from "./public-rooms.socket";
