import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import app from "./app";
import logger from "./config/logger";
import { initializeSocketServer } from "./components/room/room.socket";
import { initializePublicRoomSocketServer } from "./components/public-rooms/public-rooms.socket";
import { mediasoupService } from "./components/room/room.mediasoup";
import { AnonymousUserScheduler } from "./components/public-rooms/anonymous-user.scheduler";

const startServer = async () => {
    const PORT = process.env.PORT || 8100;
    try {
        // Create HTTP server from Express app
        const httpServer = createServer(app);

        // Create a single Socket.io server instance to be shared
        const io = new SocketIOServer(httpServer, {
            cors: {
                origin: process.env.FRONTEND_URL || 'http://localhost:3000',
                credentials: true,
                methods: ['GET', 'POST'],
            },
            pingTimeout: 60000,
            pingInterval: 25000,
            transports: ['websocket', 'polling'],
        });
        logger.info("Socket.io server created");

        // Initialize Socket.io server with room handlers (shared study rooms)
        const socketServer = initializeSocketServer(io);
        logger.info("Socket.io server initialized for Shared Study Rooms");

        // Initialize Socket.io server for public rooms
        const publicSocketServer = initializePublicRoomSocketServer(io);
        logger.info("Socket.io server initialized for Public Study Rooms");

        // Initialize Mediasoup workers for WebRTC media routing
        await mediasoupService.initialize();
        logger.info("Mediasoup workers initialized successfully");

        // Start anonymous user cleanup scheduler (Requirement 14.3)
        AnonymousUserScheduler.start();
        logger.info("Anonymous user cleanup scheduler started");

        // Note: Redis connection skipped (not implemented)

        // Start the HTTP server
        httpServer.listen(PORT, () => {
            logger.info(`Server listening on port ${PORT}`);
            logger.info("Room routes mounted at /api/rooms");
            logger.info("Socket.io namespaces available at /room/:roomId");
            logger.info("Public room Socket.io namespaces available at /public-room/:roomId");
        });
    } catch (err: unknown) {
        if (err instanceof Error) {
            logger.error(err.message);
            logger.on("finish", () => {
                process.exit(1);
            });
        }
    }
};

startServer();
