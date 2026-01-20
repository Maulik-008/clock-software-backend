import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket, Namespace } from 'socket.io';
import { JwtService } from '../../utils/jwt';
import { RoomService } from './room.service';
import logger from '../../config/logger';
import { mediasoupService } from './room.mediasoup';
import { RtpCapabilities, DtlsParameters, MediaKind, RtpParameters } from 'mediasoup/node/lib/types';

/**
 * Room Socket.io Server
 * 
 * Handles real-time bidirectional communication for Shared Study Rooms.
 * Implements namespace-based room isolation, JWT authentication, and
 * event broadcasting for join, leave, message, and timer events.
 * 
 * Requirements: 13.1, 2.7, 3.5, 4.4, 6.2, 13.7
 */

// Interface for authenticated socket with user information
interface AuthenticatedSocket extends Socket {
    userId?: number;
    userName?: string;
    roomId?: string;
}

// Event payload interfaces
interface JoinRoomEvent {
    user_id: number;
    user_name: string;
}

interface SendMessageEvent {
    content: string;
    type: 'TEXT' | 'EMOJI' | 'POLL';
}

interface TimerUpdateEvent {
    action: 'start' | 'pause' | 'resume' | 'complete';
    duration?: number;
    start_time?: string;
}

interface LeaveRoomEvent {
    user_id: number;
}

// Broadcast event interfaces
interface UserJoinedEvent {
    user_id: number;
    user_name: string;
    joined_at: string;
    current_occupancy: number;
}

interface UserLeftEvent {
    user_id: number;
    current_occupancy: number;
}

interface NewMessageEvent {
    message_id: string;
    user_id: number;
    user_name: string;
    content: string;
    type: 'TEXT' | 'EMOJI' | 'POLL';
    timestamp: string;
}

interface TimerSyncedEvent {
    action: 'start' | 'pause' | 'resume' | 'complete';
    duration?: number;
    start_time?: string;
    synced_by: number;
}

export class RoomSocketServer {
    private io: SocketIOServer;
    private roomService: RoomService;
    private roomNamespaces: Map<string, Namespace>;

    constructor(httpServer: HttpServer) {
        // Initialize Socket.io server with CORS configuration (Requirement 13.1)
        this.io = new SocketIOServer(httpServer, {
            cors: {
                origin: process.env.FRONTEND_URL || 'http://localhost:3000',
                credentials: true,
                methods: ['GET', 'POST'],
            },
            // Connection settings
            pingTimeout: 60000,
            pingInterval: 25000,
            transports: ['websocket', 'polling'],
        });

        this.roomService = new RoomService();
        this.roomNamespaces = new Map();

        logger.info('Socket.io server initialized with CORS configuration');
    }

    /**
     * Initialize Socket.io server and set up namespace handlers
     * 
     * Creates dynamic namespaces for each room following the pattern /room/:roomId.
     * Each namespace has isolated event handling and participant tracking.
     * 
     * @validates Requirements 13.1
     */
    public initialize(): void {
        // Use dynamic namespace matching for room namespaces
        // Pattern: /room/:roomId
        const roomNamespaceRegex = /^\/room\/[a-f0-9-]{36}$/i;

        this.io.of(roomNamespaceRegex).on('connection', async (socket: AuthenticatedSocket) => {
            try {
                // Extract roomId from namespace
                const namespace = socket.nsp.name;
                const roomId = namespace.replace('/room/', '');
                socket.roomId = roomId;

                logger.info(`New connection attempt to room namespace: ${namespace}`);

                // Authenticate the socket connection (Requirement 2.7, 13.1)
                const authenticated = await this.authenticateSocket(socket);
                
                if (!authenticated) {
                    logger.warn(`Authentication failed for socket ${socket.id} in room ${roomId}`);
                    socket.emit('error', { 
                        code: 'AUTHENTICATION_FAILED',
                        message: 'Authentication failed. Invalid or missing JWT token.' 
                    });
                    socket.disconnect(true);
                    return;
                }

                logger.info(`Socket ${socket.id} authenticated for user ${socket.userId} in room ${roomId}`);

                // Set up event listeners for this socket
                this.setupEventListeners(socket);

                // Handle disconnection with automatic cleanup (Requirement 3.6, 13.7)
                socket.on('disconnect', async (reason) => {
                    await this.handleDisconnection(socket, reason);
                });

            } catch (error) {
                logger.error('Error during socket connection setup:', error);
                socket.emit('error', { 
                    code: 'CONNECTION_ERROR',
                    message: 'Failed to establish connection' 
                });
                socket.disconnect(true);
            }
        });

        logger.info('Socket.io room namespaces initialized with dynamic matching');
    }

    /**
     * Authenticate socket connection using JWT token
     * 
     * Extracts JWT token from handshake auth or query parameters,
     * verifies the token, and attaches user information to the socket.
     * 
     * @param socket - Socket connection to authenticate
     * @returns True if authentication successful, false otherwise
     * @validates Requirements 2.7, 9.1, 9.2, 9.3
     */
    private async authenticateSocket(socket: AuthenticatedSocket): Promise<boolean> {
        try {
            // Extract token from auth or query parameters
            const token = socket.handshake.auth.token || socket.handshake.query.token as string;

            if (!token) {
                logger.warn(`No token provided for socket ${socket.id}`);
                return false;
            }

            // Verify JWT token
            const payload = JwtService.verifyAccessToken(token);

            if (!payload || !payload.userId) {
                logger.warn(`Invalid token payload for socket ${socket.id}`);
                return false;
            }

            // Attach user information to socket
            socket.userId = payload.userId;
            
            // Fetch user name from database for event broadcasting
            const user = await this.getUserInfo(payload.userId);
            if (user) {
                socket.userName = user.name;
            }

            logger.info(`Socket ${socket.id} authenticated for user ${payload.userId}`);
            return true;

        } catch (error) {
            logger.error(`Authentication error for socket ${socket.id}:`, error);
            return false;
        }
    }

    /**
     * Get user information from database
     * 
     * @param userId - User ID to fetch
     * @returns User information or null if not found
     */
    private async getUserInfo(userId: number): Promise<{ name: string } | null> {
        try {
            const { PRISMA_DB_CLIENT } = await import('../../prisma');
            const user = await PRISMA_DB_CLIENT.user.findUnique({
                where: { id: userId },
                select: {
                    firstName: true,
                    lastName: true,
                },
            });

            if (!user) {
                return null;
            }

            return {
                name: `${user.firstName} ${user.lastName}`.trim(),
            };
        } catch (error) {
            logger.error(`Error fetching user info for userId ${userId}:`, error);
            return null;
        }
    }

    /**
     * Set up event listeners for socket connection
     * 
     * Registers handlers for: join-room, send-message, leave-room, timer-update,
     * and WebRTC signaling events (get-rtp-capabilities, create-transport, etc.)
     * 
     * @param socket - Authenticated socket connection
     * @validates Requirements 2.7, 3.5, 4.4, 6.2, 5.3, 5.4, 5.5
     */
    private setupEventListeners(socket: AuthenticatedSocket): void {
        // Handle join-room event (Requirement 2.7, 13.2)
        socket.on('join-room', async (data: JoinRoomEvent) => {
            await this.handleJoinRoom(socket, data);
        });

        // Handle send-message event (Requirement 4.4, 13.4)
        socket.on('send-message', async (data: SendMessageEvent) => {
            await this.handleSendMessage(socket, data);
        });

        // Handle leave-room event (Requirement 3.5, 13.3)
        socket.on('leave-room', async (data: LeaveRoomEvent) => {
            await this.handleLeaveRoom(socket, data);
        });

        // Handle timer-update event (Requirement 6.2, 13.5)
        socket.on('timer-update', async (data: TimerUpdateEvent) => {
            await this.handleTimerUpdate(socket, data);
        });

        // WebRTC Signaling Events (Requirements 5.1, 5.2, 5.3, 5.4, 5.5)
        
        // Get RTP capabilities for the room
        socket.on('get-rtp-capabilities', async (callback) => {
            await this.handleGetRtpCapabilities(socket, callback);
        });

        // Create WebRTC transport (send or recv)
        socket.on('create-transport', async (data: { direction: 'send' | 'recv' }, callback) => {
            await this.handleCreateTransport(socket, data, callback);
        });

        // Connect transport with DTLS parameters
        socket.on('connect-transport', async (data: { transportId: string; dtlsParameters: DtlsParameters }, callback) => {
            await this.handleConnectTransport(socket, data, callback);
        });

        // Create producer for sending media
        socket.on('produce', async (data: { transportId: string; kind: MediaKind; rtpParameters: RtpParameters }, callback) => {
            await this.handleProduce(socket, data, callback);
        });

        // Create consumer for receiving media
        socket.on('consume', async (data: { transportId: string; producerId: string; rtpCapabilities: RtpCapabilities }, callback) => {
            await this.handleConsume(socket, data, callback);
        });

        // Resume consumer
        socket.on('resume-consumer', async (data: { consumerId: string }, callback) => {
            await this.handleResumeConsumer(socket, data, callback);
        });

        // Close producer
        socket.on('close-producer', async (data: { producerId: string }) => {
            await this.handleCloseProducer(socket, data);
        });

        // Close consumer
        socket.on('close-consumer', async (data: { consumerId: string }) => {
            await this.handleCloseConsumer(socket, data);
        });

        logger.info(`Event listeners set up for socket ${socket.id}`);
    }

    /**
     * Handle join-room event
     * 
     * Broadcasts user-joined event to all participants in the room
     * with updated occupancy information.
     * 
     * @param socket - Socket connection
     * @param data - Join room event data
     * @validates Requirements 2.7, 13.2
     */
    private async handleJoinRoom(socket: AuthenticatedSocket, data: JoinRoomEvent): Promise<void> {
        try {
            const roomId = socket.roomId;
            const userId = socket.userId;

            if (!roomId || !userId) {
                socket.emit('error', { 
                    code: 'INVALID_REQUEST',
                    message: 'Room ID or User ID missing' 
                });
                return;
            }

            logger.info(`User ${userId} joining room ${roomId} via socket`);

            // Get updated room information
            const room = await this.roomService.getRoomById(roomId);
            
            if (!room) {
                socket.emit('error', { 
                    code: 'ROOM_NOT_FOUND',
                    message: 'Room not found' 
                });
                return;
            }

            // Broadcast user-joined event to all participants in the room
            const userJoinedEvent: UserJoinedEvent = {
                user_id: userId,
                user_name: socket.userName || data.user_name || 'Unknown User',
                joined_at: new Date().toISOString(),
                current_occupancy: room.currentOccupancy,
            };

            // Broadcast to all clients in this room namespace
            socket.nsp.emit('user-joined', userJoinedEvent);

            logger.info(`Broadcasted user-joined event for user ${userId} in room ${roomId}`);

        } catch (error) {
            logger.error('Error handling join-room event:', error);
            socket.emit('error', { 
                code: 'JOIN_ERROR',
                message: 'Failed to process join request' 
            });
        }
    }

    /**
     * Handle send-message event
     * 
     * Stores the message in the database and broadcasts new-message event
     * to all participants in the room.
     * 
     * @param socket - Socket connection
     * @param data - Send message event data
     * @validates Requirements 4.4, 13.4
     */
    private async handleSendMessage(socket: AuthenticatedSocket, data: SendMessageEvent): Promise<void> {
        try {
            const roomId = socket.roomId;
            const userId = socket.userId;

            if (!roomId || !userId) {
                socket.emit('error', { 
                    code: 'INVALID_REQUEST',
                    message: 'Room ID or User ID missing' 
                });
                return;
            }

            logger.info(`User ${userId} sending message in room ${roomId}`);

            // Validate message content
            if (!data.content || data.content.trim().length === 0) {
                socket.emit('error', { 
                    code: 'INVALID_MESSAGE',
                    message: 'Message content cannot be empty' 
                });
                return;
            }

            if (data.content.length > 1000) {
                socket.emit('error', { 
                    code: 'INVALID_MESSAGE',
                    message: 'Message content exceeds maximum length of 1000 characters' 
                });
                return;
            }

            // Store message in database (includes validation and sanitization)
            const message = await this.roomService.createMessage(
                userId,
                roomId,
                data.content,
                data.type || 'TEXT'
            );

            // Broadcast new-message event to all participants in the room
            const newMessageEvent: NewMessageEvent = {
                message_id: message.id,
                user_id: message.userId,
                user_name: message.userName,
                content: message.content,
                type: message.type as 'TEXT' | 'EMOJI' | 'POLL',
                timestamp: message.timestamp.toISOString(),
            };

            // Broadcast to all clients in this room namespace
            socket.nsp.emit('new-message', newMessageEvent);

            logger.info(`Broadcasted new-message event for message ${message.id} in room ${roomId}`);

        } catch (error) {
            logger.error('Error handling send-message event:', error);
            socket.emit('error', { 
                code: 'MESSAGE_ERROR',
                message: error instanceof Error ? error.message : 'Failed to send message' 
            });
        }
    }

    /**
     * Handle leave-room event
     * 
     * Processes the leave request through the room service and broadcasts
     * user-left event to remaining participants.
     * 
     * @param socket - Socket connection
     * @param data - Leave room event data
     * @validates Requirements 3.5, 13.3
     */
    private async handleLeaveRoom(socket: AuthenticatedSocket, data: LeaveRoomEvent): Promise<void> {
        try {
            const roomId = socket.roomId;
            const userId = socket.userId;

            if (!roomId || !userId) {
                socket.emit('error', { 
                    code: 'INVALID_REQUEST',
                    message: 'Room ID or User ID missing' 
                });
                return;
            }

            logger.info(`User ${userId} leaving room ${roomId} via socket`);

            // Process leave through room service (handles occupancy decrement and session logging)
            const result = await this.roomService.leaveRoom(userId, roomId);

            // Broadcast user-left event to remaining participants
            const userLeftEvent: UserLeftEvent = {
                user_id: userId,
                current_occupancy: result.room.currentOccupancy,
            };

            // Broadcast to all clients in this room namespace
            socket.nsp.emit('user-left', userLeftEvent);

            logger.info(`Broadcasted user-left event for user ${userId} in room ${roomId}`);

            // Disconnect the socket
            socket.disconnect(true);

        } catch (error) {
            logger.error('Error handling leave-room event:', error);
            socket.emit('error', { 
                code: 'LEAVE_ERROR',
                message: error instanceof Error ? error.message : 'Failed to leave room' 
            });
        }
    }

    /**
     * Handle timer-update event
     * 
     * Broadcasts timer state changes to all participants in the room.
     * Supports timer actions: start, pause, resume, complete.
     * 
     * @param socket - Socket connection
     * @param data - Timer update event data
     * @validates Requirements 6.2, 13.5
     */
    private async handleTimerUpdate(socket: AuthenticatedSocket, data: TimerUpdateEvent): Promise<void> {
        try {
            const roomId = socket.roomId;
            const userId = socket.userId;

            if (!roomId || !userId) {
                socket.emit('error', { 
                    code: 'INVALID_REQUEST',
                    message: 'Room ID or User ID missing' 
                });
                return;
            }

            logger.info(`User ${userId} updating timer in room ${roomId}: ${data.action}`);

            // Validate timer action
            const validActions = ['start', 'pause', 'resume', 'complete'];
            if (!validActions.includes(data.action)) {
                socket.emit('error', { 
                    code: 'INVALID_TIMER_ACTION',
                    message: 'Invalid timer action. Must be start, pause, resume, or complete' 
                });
                return;
            }

            // Broadcast timer-synced event to all participants in the room
            const timerSyncedEvent: TimerSyncedEvent = {
                action: data.action,
                duration: data.duration,
                start_time: data.start_time,
                synced_by: userId,
            };

            // Broadcast to all clients in this room namespace
            socket.nsp.emit('timer-synced', timerSyncedEvent);

            logger.info(`Broadcasted timer-synced event for room ${roomId}: ${data.action}`);

        } catch (error) {
            logger.error('Error handling timer-update event:', error);
            socket.emit('error', { 
                code: 'TIMER_ERROR',
                message: 'Failed to sync timer' 
            });
        }
    }

    /**
     * Handle socket disconnection with automatic cleanup
     * 
     * Automatically triggers the leave process when a socket disconnects,
     * ensuring participant state is cleaned up and remaining participants
     * are notified. Also cleans up Mediasoup resources.
     * 
     * @param socket - Socket connection that disconnected
     * @param reason - Reason for disconnection
     * @validates Requirements 3.6, 13.7
     */
    private async handleDisconnection(socket: AuthenticatedSocket, reason: string): Promise<void> {
        try {
            const roomId = socket.roomId;
            const userId = socket.userId;

            if (!roomId || !userId) {
                logger.info(`Socket ${socket.id} disconnected without room/user context: ${reason}`);
                return;
            }

            logger.info(`Socket ${socket.id} disconnected from room ${roomId}: ${reason}`);

            // Cleanup Mediasoup resources for this participant
            try {
                await mediasoupService.cleanupParticipant(roomId, userId.toString());
                logger.info(`Cleaned up Mediasoup resources for user ${userId} in room ${roomId}`);
            } catch (error) {
                logger.error(`Error cleaning up Mediasoup resources for user ${userId}:`, error);
            }

            // Check if user is still a participant (they might have already left)
            const isParticipant = await this.roomService.isParticipant(userId, roomId);

            if (!isParticipant) {
                logger.info(`User ${userId} already left room ${roomId}, no cleanup needed`);
                return;
            }

            // Automatically trigger leave process
            logger.info(`Automatically cleaning up participant ${userId} from room ${roomId}`);
            
            try {
                const result = await this.roomService.leaveRoom(userId, roomId);

                // Broadcast user-left event to remaining participants
                const userLeftEvent: UserLeftEvent = {
                    user_id: userId,
                    current_occupancy: result.room.currentOccupancy,
                };

                // Broadcast to all clients in this room namespace
                socket.nsp.emit('user-left', userLeftEvent);

                logger.info(`Cleanup completed for user ${userId} in room ${roomId}`);
            } catch (error) {
                // If user is not a participant, that's okay (they might have left already)
                if (error instanceof Error && error.message.includes('not a participant')) {
                    logger.info(`User ${userId} was not a participant in room ${roomId} during cleanup`);
                } else {
                    throw error;
                }
            }

        } catch (error) {
            logger.error('Error during socket disconnection cleanup:', error);
        }
    }

    /**
     * Handle get-rtp-capabilities event
     * 
     * Returns the RTP capabilities of the router for the room.
     * Clients need these capabilities to configure their media producers.
     * 
     * @param socket - Socket connection
     * @param callback - Callback to send response
     * @validates Requirements 5.1
     */
    private async handleGetRtpCapabilities(socket: AuthenticatedSocket, callback: Function): Promise<void> {
        try {
            const roomId = socket.roomId;

            if (!roomId) {
                callback({ error: 'Room ID missing' });
                return;
            }

            logger.info(`User ${socket.userId} requesting RTP capabilities for room ${roomId}`);

            const rtpCapabilities = await mediasoupService.getRtpCapabilities(roomId);
            
            callback({ rtpCapabilities });
            logger.info(`Sent RTP capabilities to user ${socket.userId} in room ${roomId}`);

        } catch (error) {
            logger.error('Error handling get-rtp-capabilities:', error);
            callback({ error: error instanceof Error ? error.message : 'Failed to get RTP capabilities' });
        }
    }

    /**
     * Handle create-transport event
     * 
     * Creates a WebRTC transport for the participant.
     * Each participant needs two transports: one for sending and one for receiving.
     * 
     * @param socket - Socket connection
     * @param data - Transport creation data
     * @param callback - Callback to send response
     * @validates Requirements 5.2
     */
    private async handleCreateTransport(
        socket: AuthenticatedSocket,
        data: { direction: 'send' | 'recv' },
        callback: Function
    ): Promise<void> {
        try {
            const roomId = socket.roomId;
            const userId = socket.userId;

            if (!roomId || !userId) {
                callback({ error: 'Room ID or User ID missing' });
                return;
            }

            logger.info(`User ${userId} creating ${data.direction} transport in room ${roomId}`);

            const transport = await mediasoupService.createTransport(
                roomId,
                userId.toString(),
                data.direction
            );

            callback({ transport });
            logger.info(`Created ${data.direction} transport ${transport.id} for user ${userId} in room ${roomId}`);

        } catch (error) {
            logger.error('Error handling create-transport:', error);
            callback({ error: error instanceof Error ? error.message : 'Failed to create transport' });
        }
    }

    /**
     * Handle connect-transport event
     * 
     * Connects a transport with DTLS parameters from the client.
     * Must be called after creating the transport and before producing/consuming media.
     * 
     * @param socket - Socket connection
     * @param data - Transport connection data
     * @param callback - Callback to send response
     * @validates Requirements 5.2
     */
    private async handleConnectTransport(
        socket: AuthenticatedSocket,
        data: { transportId: string; dtlsParameters: DtlsParameters },
        callback: Function
    ): Promise<void> {
        try {
            const roomId = socket.roomId;
            const userId = socket.userId;

            if (!roomId || !userId) {
                callback({ error: 'Room ID or User ID missing' });
                return;
            }

            logger.info(`User ${userId} connecting transport ${data.transportId} in room ${roomId}`);

            await mediasoupService.connectTransport(
                roomId,
                userId.toString(),
                data.transportId,
                data.dtlsParameters
            );

            callback({ connected: true });
            logger.info(`Connected transport ${data.transportId} for user ${userId} in room ${roomId}`);

        } catch (error) {
            logger.error('Error handling connect-transport:', error);
            callback({ error: error instanceof Error ? error.message : 'Failed to connect transport' });
        }
    }

    /**
     * Handle produce event
     * 
     * Creates a producer for the participant to send media (audio/video).
     * Notifies other participants about the new producer so they can consume it.
     * 
     * @param socket - Socket connection
     * @param data - Producer creation data
     * @param callback - Callback to send response
     * @validates Requirements 5.3, 5.4
     */
    private async handleProduce(
        socket: AuthenticatedSocket,
        data: { transportId: string; kind: MediaKind; rtpParameters: RtpParameters },
        callback: Function
    ): Promise<void> {
        try {
            const roomId = socket.roomId;
            const userId = socket.userId;

            if (!roomId || !userId) {
                callback({ error: 'Room ID or User ID missing' });
                return;
            }

            logger.info(`User ${userId} producing ${data.kind} in room ${roomId}`);

            // Check occupancy and recommend audio-only if > 40 participants (Requirement 5.7)
            const room = await this.roomService.getRoomById(roomId);
            if (room && room.currentOccupancy > 40 && data.kind === 'video') {
                socket.emit('recommend-audio-only', {
                    message: 'Room has high occupancy. Consider using audio-only mode for better performance.',
                    occupancy: room.currentOccupancy,
                });
            }

            const producerId = await mediasoupService.createProducer(
                roomId,
                userId.toString(),
                data.transportId,
                data.kind,
                data.rtpParameters
            );

            // Notify other participants about the new producer
            socket.broadcast.to(roomId).emit('new-producer', {
                producerId,
                participantId: userId,
                kind: data.kind,
            });

            callback({ producerId });
            logger.info(`Created ${data.kind} producer ${producerId} for user ${userId} in room ${roomId}`);

        } catch (error) {
            logger.error('Error handling produce:', error);
            callback({ error: error instanceof Error ? error.message : 'Failed to create producer' });
        }
    }

    /**
     * Handle consume event
     * 
     * Creates a consumer for the participant to receive media from another participant.
     * The consumer is created in paused state and must be resumed by the client.
     * 
     * @param socket - Socket connection
     * @param data - Consumer creation data
     * @param callback - Callback to send response
     * @validates Requirements 5.5
     */
    private async handleConsume(
        socket: AuthenticatedSocket,
        data: { transportId: string; producerId: string; rtpCapabilities: RtpCapabilities },
        callback: Function
    ): Promise<void> {
        try {
            const roomId = socket.roomId;
            const userId = socket.userId;

            if (!roomId || !userId) {
                callback({ error: 'Room ID or User ID missing' });
                return;
            }

            logger.info(`User ${userId} consuming producer ${data.producerId} in room ${roomId}`);

            const consumer = await mediasoupService.createConsumer(
                roomId,
                userId.toString(),
                data.transportId,
                data.producerId,
                data.rtpCapabilities
            );

            callback({ consumer });
            logger.info(`Created consumer ${consumer.id} for user ${userId} in room ${roomId}`);

        } catch (error) {
            logger.error('Error handling consume:', error);
            callback({ error: error instanceof Error ? error.message : 'Failed to create consumer' });
        }
    }

    /**
     * Handle resume-consumer event
     * 
     * Resumes a paused consumer to start receiving media.
     * Consumers are created in paused state by default.
     * 
     * @param socket - Socket connection
     * @param data - Consumer resume data
     * @param callback - Callback to send response
     * @validates Requirements 5.5
     */
    private async handleResumeConsumer(
        socket: AuthenticatedSocket,
        data: { consumerId: string },
        callback: Function
    ): Promise<void> {
        try {
            const roomId = socket.roomId;
            const userId = socket.userId;

            if (!roomId || !userId) {
                callback({ error: 'Room ID or User ID missing' });
                return;
            }

            logger.info(`User ${userId} resuming consumer ${data.consumerId} in room ${roomId}`);

            await mediasoupService.resumeConsumer(
                roomId,
                userId.toString(),
                data.consumerId
            );

            callback({ resumed: true });
            logger.info(`Resumed consumer ${data.consumerId} for user ${userId} in room ${roomId}`);

        } catch (error) {
            logger.error('Error handling resume-consumer:', error);
            callback({ error: error instanceof Error ? error.message : 'Failed to resume consumer' });
        }
    }

    /**
     * Handle close-producer event
     * 
     * Closes a producer and notifies other participants.
     * 
     * @param socket - Socket connection
     * @param data - Producer close data
     * @validates Requirements 5.4
     */
    private async handleCloseProducer(
        socket: AuthenticatedSocket,
        data: { producerId: string }
    ): Promise<void> {
        try {
            const roomId = socket.roomId;
            const userId = socket.userId;

            if (!roomId || !userId) {
                return;
            }

            logger.info(`User ${userId} closing producer ${data.producerId} in room ${roomId}`);

            await mediasoupService.closeProducer(
                roomId,
                userId.toString(),
                data.producerId
            );

            // Notify other participants that the producer is closed
            socket.broadcast.to(roomId).emit('producer-closed', {
                producerId: data.producerId,
                participantId: userId,
            });

            logger.info(`Closed producer ${data.producerId} for user ${userId} in room ${roomId}`);

        } catch (error) {
            logger.error('Error handling close-producer:', error);
        }
    }

    /**
     * Handle close-consumer event
     * 
     * Closes a consumer.
     * 
     * @param socket - Socket connection
     * @param data - Consumer close data
     * @validates Requirements 5.5
     */
    private async handleCloseConsumer(
        socket: AuthenticatedSocket,
        data: { consumerId: string }
    ): Promise<void> {
        try {
            const roomId = socket.roomId;
            const userId = socket.userId;

            if (!roomId || !userId) {
                return;
            }

            logger.info(`User ${userId} closing consumer ${data.consumerId} in room ${roomId}`);

            await mediasoupService.closeConsumer(
                roomId,
                userId.toString(),
                data.consumerId
            );

            logger.info(`Closed consumer ${data.consumerId} for user ${userId} in room ${roomId}`);

        } catch (error) {
            logger.error('Error handling close-consumer:', error);
        }
    }

    /**
     * Get the Socket.io server instance
     * 
     * @returns Socket.io server instance
     */
    public getIO(): SocketIOServer {
        return this.io;
    }

    /**
     * Get a specific room namespace
     * 
     * @param roomId - Room ID
     * @returns Namespace for the room
     */
    public getRoomNamespace(roomId: string): Namespace {
        return this.io.of(`/room/${roomId}`);
    }

    /**
     * Broadcast an event to all participants in a room
     * 
     * Utility method for broadcasting events from outside the socket handlers
     * (e.g., from REST API endpoints or moderation actions).
     * 
     * @param roomId - Room ID
     * @param event - Event name
     * @param data - Event data
     */
    public broadcastToRoom(roomId: string, event: string, data: any): void {
        const namespace = this.getRoomNamespace(roomId);
        namespace.emit(event, data);
        logger.info(`Broadcasted ${event} event to room ${roomId}`);
    }
}

// Export singleton instance factory
let socketServerInstance: RoomSocketServer | null = null;

/**
 * Initialize the Socket.io server
 * 
 * @param httpServer - HTTP server instance
 * @returns RoomSocketServer instance
 */
export function initializeSocketServer(httpServer: HttpServer): RoomSocketServer {
    if (!socketServerInstance) {
        socketServerInstance = new RoomSocketServer(httpServer);
        socketServerInstance.initialize();
    }
    return socketServerInstance;
}

/**
 * Get the Socket.io server instance
 * 
 * @returns RoomSocketServer instance or null if not initialized
 */
export function getSocketServer(): RoomSocketServer | null {
    return socketServerInstance;
}
