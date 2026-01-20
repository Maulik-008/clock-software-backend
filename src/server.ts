import { createServer } from "http";
import app from "./app";
import logger from "./config/logger";
import { initializeSocketServer } from "./components/room/room.socket";
import { mediasoupService } from "./components/room/room.mediasoup";

const startServer = async () => {
    const PORT = process.env.PORT || 8100;
    try {
        // Create HTTP server from Express app
        const httpServer = createServer(app);

        // Initialize Socket.io server with room handlers
        const socketServer = initializeSocketServer(httpServer);
        logger.info("Socket.io server initialized for Shared Study Rooms");

        // Initialize Mediasoup workers for WebRTC media routing
        await mediasoupService.initialize();
        logger.info("Mediasoup workers initialized successfully");

        // Note: Redis connection skipped (not implemented)

        // Start the HTTP server
        httpServer.listen(PORT, () => {
            logger.info(`Server listening on port ${PORT}`);
            logger.info("Room routes mounted at /api/rooms");
            logger.info("Socket.io namespaces available at /room/:roomId");
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
