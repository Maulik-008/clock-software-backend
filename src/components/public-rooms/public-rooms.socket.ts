import { Server as SocketIOServer, Socket, Namespace } from 'socket.io';
import logger from '../../config/logger';
import { PublicRoomService } from './public-room.service';
import { AnonymousUserService } from './anonymous-user.service';
import { SecurityService, SuspiciousActivityType } from './security.service';
import { RateLimiterService, RateLimitAction } from './rate-limiter.service';
import { ConnectionManagerService } from './connection-manager.service';
import { PRISMA_DB_CLIENT } from '../../prisma';
import { mediasoupService } from '../room/room.mediasoup';
import { RtpCapabilities, DtlsParameters, MediaKind, RtpParameters } from 'mediasoup/node/lib/types';

/**
 * Public Rooms Socket.io Server
 * 
 * Handles real-time bidirectional communication for Public Study Rooms.
 * Implements namespace-based room isolation, IP-based identification,
 * and event broadcasting for join, leave, and disconnect events.
 * 
 * Requirements: 9.4, 13.5, 14.4, 14.5
 */

// Interface for public socket with anonymous user information
interface PublicSocket extends Socket {
    userId?: string;
    userName?: string;
    roomId?: string;
    ipAddress?: string;
    lastPingAt?: number;
    missedPings?: number;
}

// Event payload interfaces
interface JoinRoomEvent {
    userId: string;
    userName: string;
}

interface LeaveRoomEvent {
    userId: string;
}

interface ToggleVideoEvent {
    userId: string;
    enabled: boolean;
}

interface ToggleAudioEvent {
    userId: string;
    enabled: boolean;
}

interface SendMessageEvent {
    userId: string;
    content: string;
}

// Broadcast event interfaces
interface UserJoinedEvent {
    userId: string;
    userName: string;
    joinedAt: string;
    currentOccupancy: number;
}

interface UserLeftEvent {
    userId: string;
    currentOccupancy: number;
}

interface RoomOccupancyUpdateEvent {
    roomId: string;
    currentOccupancy: number;
}

interface ParticipantVideoToggleEvent {
    userId: string;
    enabled: boolean;
}

interface ParticipantAudioToggleEvent {
    userId: string;
    enabled: boolean;
}

interface NewMessageEvent {
    id: string;
    userId: string;
    userName: string;
    content: string;
    timestamp: string;
}

interface ChatMessage {
    id: string;
    userId: string;
    userName: string;
    content: string;
    timestamp: string;
}

// Connection tracking for concurrent connection limiting
interface ConnectionInfo {
    socketId: string;
    connectedAt: number;
}

export class PublicRoomSocketServer {
    private io: SocketIOServer;
    private roomNamespaces: Map<string, Namespace>;
    
    // Track connections per IP for concurrent connection limiting (Requirement 13.5)
    private connectionsByIp: Map<string, ConnectionInfo[]>;
    
    // Ping/pong health check intervals (Requirement 14.4, 14.5)
    private readonly PING_INTERVAL = 5 * 60 * 1000; // 5 minutes
    private readonly MAX_MISSED_PINGS = 3;
    private pingIntervalId?: NodeJS.Timeout;
    
    // Cleanup interval for reconnection tracking
    private cleanupIntervalId?: NodeJS.Timeout;
    private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

    constructor(io: SocketIOServer) {
        // Use existing Socket.io server instance
        this.io = io;
        this.roomNamespaces = new Map();
        this.connectionsByIp = new Map();

        logger.info('Public Rooms Socket.io server initialized with CORS configuration');
    }

    /**
     * Initialize Socket.io server and set up namespace handlers
     * 
     * Creates dynamic namespaces for each public room following the pattern /public-room/:roomId.
     * Each namespace has isolated event handling and participant tracking.
     * 
     * @validates Requirements 9.4
     */
    public initialize(): void {
        // Use dynamic namespace matching for public room namespaces
        // Pattern: /public-room/:roomId
        const publicRoomNamespaceRegex = /^\/public-room\/[a-f0-9-]{36}$/i;

        this.io.of(publicRoomNamespaceRegex).on('connection', async (socket: PublicSocket) => {
            try {
                // Extract roomId from namespace
                const namespace = socket.nsp.name;
                const roomId = namespace.replace('/public-room/', '');
                socket.roomId = roomId;

                // Get IP address from socket
                const ipAddress = this.getIpAddress(socket);
                socket.ipAddress = ipAddress;

                logger.info(`New connection attempt to public room namespace: ${namespace} from IP: ${ipAddress}`);

                // Check for repeated violations and permanent block
                const shouldBlockPermanently = await RateLimiterService.shouldBlockIpPermanently(ipAddress);
                if (shouldBlockPermanently) {
                    logger.error(`Connection rejected for permanently blocked IP ${SecurityService.hashIpAddress(ipAddress).substring(0, 8)}...`);
                    socket.emit('error', { 
                        code: 'IP_BLOCKED',
                        message: 'Your IP has been blocked due to repeated violations' 
                    });
                    socket.disconnect(true);
                    return;
                }

                // Check reconnection backoff (Requirement 13.3)
                const backoffCheck = ConnectionManagerService.checkReconnectionBackoff(ipAddress);
                if (!backoffCheck.allowed) {
                    logger.warn(`Connection rejected due to reconnection backoff for IP ${ipAddress}`);
                    socket.emit('error', { 
                        code: 'RECONNECTION_THROTTLED',
                        message: backoffCheck.message || 'Please wait before reconnecting',
                        retryAfter: Math.ceil((backoffCheck.backoffMs || 0) / 1000)
                    });
                    socket.disconnect(true);
                    return;
                }

                // Check system capacity (Requirement 14.2)
                const capacityCheck = await ConnectionManagerService.checkSystemCapacity(socket.id, ipAddress);
                if (!capacityCheck.allowed) {
                    if (capacityCheck.queued) {
                        logger.info(`Connection queued for socket ${socket.id} - position: ${capacityCheck.queuePosition}`);
                        socket.emit('system-capacity-queue', {
                            message: 'System is at maximum capacity. Your connection has been queued.',
                            queuePosition: capacityCheck.queuePosition
                        });
                        // Connection will be processed when capacity becomes available
                        // For now, we'll disconnect and let them retry
                        socket.disconnect(true);
                    } else {
                        logger.warn(`Connection rejected - queue timeout for socket ${socket.id}`);
                        socket.emit('error', { 
                            code: 'SYSTEM_AT_CAPACITY',
                            message: 'System is at maximum capacity. Please try again later.' 
                        });
                        socket.disconnect(true);
                    }
                    return;
                }

                // Check concurrent connection limit (Requirement 13.5)
                const connectionAllowed = await this.checkConnectionLimit(ipAddress, socket.id);
                
                if (!connectionAllowed) {
                    logger.warn(`Connection limit exceeded for IP ${ipAddress}`);
                    
                    // Log suspicious activity
                    await SecurityService.logSuspiciousActivity(
                        ipAddress,
                        SuspiciousActivityType.EXCESSIVE_JOIN_ATTEMPTS,
                        'Exceeded concurrent connection limit'
                    );
                    
                    socket.emit('error', { 
                        code: 'TOO_MANY_CONNECTIONS',
                        message: 'Maximum concurrent connections reached for your IP' 
                    });
                    socket.disconnect(true);
                    
                    // Remove from capacity tracking since connection was rejected
                    ConnectionManagerService.removeConnection(socket.id);
                    return;
                }

                logger.info(`Socket ${socket.id} connected to public room ${roomId}`);

                // Initialize ping tracking
                socket.lastPingAt = Date.now();
                socket.missedPings = 0;

                // Set up event listeners for this socket
                this.setupEventListeners(socket);

                // Handle disconnection with automatic cleanup (Requirement 14.5)
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
                
                // Clean up capacity tracking
                ConnectionManagerService.removeConnection(socket.id);
            }
        });

        // Start ping/pong health check interval (Requirement 14.4, 14.5)
        this.startHealthChecks();
        
        // Start cleanup interval for reconnection tracking
        this.startCleanupInterval();

        logger.info('Public Rooms Socket.io namespaces initialized with dynamic matching');
    }

    /**
     * Get IP address from socket connection
     * 
     * @param socket - Socket connection
     * @returns IP address string
     */
    private getIpAddress(socket: Socket): string {
        // Try to get real IP from headers (when behind proxy)
        const forwardedFor = socket.handshake.headers['x-forwarded-for'];
        if (forwardedFor) {
            const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
            return ips.split(',')[0].trim();
        }

        // Fallback to socket address
        return socket.handshake.address;
    }

    /**
     * Check if IP address can establish a new connection
     * Enforces limit of 2 concurrent connections per IP (Requirement 13.5)
     * 
     * @param ipAddress - IP address to check
     * @param socketId - Socket ID of the new connection
     * @returns true if connection is allowed, false otherwise
     */
    private async checkConnectionLimit(ipAddress: string, socketId: string): Promise<boolean> {
        const hashedIp = SecurityService.hashIpAddress(ipAddress);
        const connections = this.connectionsByIp.get(hashedIp) || [];

        // Clean up stale connections (older than 1 hour)
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        const activeConnections = connections.filter(conn => conn.connectedAt > oneHourAgo);

        // Check if limit exceeded (max 2 concurrent connections)
        if (activeConnections.length >= 2) {
            return false;
        }

        // Add new connection
        activeConnections.push({
            socketId,
            connectedAt: Date.now(),
        });

        this.connectionsByIp.set(hashedIp, activeConnections);
        return true;
    }

    /**
     * Remove connection from tracking
     * 
     * @param ipAddress - IP address
     * @param socketId - Socket ID to remove
     */
    private removeConnection(ipAddress: string, socketId: string): void {
        const hashedIp = SecurityService.hashIpAddress(ipAddress);
        const connections = this.connectionsByIp.get(hashedIp) || [];
        
        const updatedConnections = connections.filter(conn => conn.socketId !== socketId);
        
        if (updatedConnections.length === 0) {
            this.connectionsByIp.delete(hashedIp);
        } else {
            this.connectionsByIp.set(hashedIp, updatedConnections);
        }
    }

    /**
     * Set up event listeners for socket connection
     * 
     * Registers handlers for: join-room, leave-room, toggle-video, toggle-audio, send-message, and pong events
     * Also registers WebRTC signaling events for media streaming
     * 
     * @param socket - Socket connection
     * @validates Requirements 9.4
     */
    private setupEventListeners(socket: PublicSocket): void {
        // Handle join-room event
        socket.on('join-room', async (data: JoinRoomEvent) => {
            await this.handleJoinRoom(socket, data);
        });

        // Handle leave-room event
        socket.on('leave-room', async (data: LeaveRoomEvent) => {
            await this.handleLeaveRoom(socket, data);
        });

        // Handle toggle-video event (Requirement 8.4)
        socket.on('toggle-video', async (data: ToggleVideoEvent) => {
            await this.handleToggleVideo(socket, data);
        });

        // Handle toggle-audio event (Requirement 8.4)
        socket.on('toggle-audio', async (data: ToggleAudioEvent) => {
            await this.handleToggleAudio(socket, data);
        });

        // Handle send-message event (Requirements 6.2, 6.4, 6.5, 12.3, 12.4)
        socket.on('send-message', async (data: SendMessageEvent) => {
            await this.handleSendMessage(socket, data);
        });

        // Handle pong response for health checks (Requirement 14.4)
        socket.on('pong', () => {
            socket.lastPingAt = Date.now();
            socket.missedPings = 0;
            logger.debug(`Received pong from socket ${socket.id}`);
        });

        // WebRTC signaling events (Requirements 4.1, 4.2, 5.1, 5.2)
        
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
     * with updated occupancy information. Also broadcasts room-occupancy-update
     * to all viewers of the room list. Returns recent chat history to the joining user.
     * 
     * @param socket - Socket connection
     * @param data - Join room event data
     * @validates Requirements 6.5, 8.1, 8.3, 9.4
     */
    private async handleJoinRoom(socket: PublicSocket, data: JoinRoomEvent): Promise<void> {
        try {
            const roomId = socket.roomId;
            const userId = data.userId;

            if (!roomId || !userId) {
                socket.emit('error', { 
                    code: 'INVALID_REQUEST',
                    message: 'Room ID or User ID missing' 
                });
                return;
            }

            logger.info(`Anonymous user ${userId} joining public room ${roomId} via socket`);

            // Verify user exists
            const user = await AnonymousUserService.getUserByIp(socket.ipAddress!);
            if (!user || user.id !== userId) {
                socket.emit('error', { 
                    code: 'INVALID_USER',
                    message: 'User not found or does not match IP address' 
                });
                return;
            }

            // Store user info on socket
            socket.userId = userId;
            socket.userName = data.userName || user.displayName;

            // Get updated room information
            const rooms = await PublicRoomService.getPublicRooms();
            const room = rooms.find(r => r.id === roomId);
            
            if (!room) {
                socket.emit('error', { 
                    code: 'ROOM_NOT_FOUND',
                    message: 'Room not found' 
                });
                return;
            }

            // Get recent chat history (Requirement 6.5)
            const chatHistory = await this.getChatHistory(roomId);

            // Send chat history to the joining user
            socket.emit('chat-history', { messages: chatHistory });

            logger.info(`Sent ${chatHistory.length} chat messages to user ${userId}`);

            // Broadcast user-joined event to all participants in the room (Requirement 8.1)
            const userJoinedEvent: UserJoinedEvent = {
                userId,
                userName: socket.userName,
                joinedAt: new Date().toISOString(),
                currentOccupancy: room.currentOccupancy,
            };

            // Broadcast to all clients in this room namespace
            socket.nsp.emit('user-joined', userJoinedEvent);

            logger.info(`Broadcasted user-joined event for user ${userId} in public room ${roomId}`);

            // Broadcast room-occupancy-update to the main namespace for room list updates (Requirement 8.3)
            this.broadcastRoomOccupancyUpdate(roomId, room.currentOccupancy);

        } catch (error) {
            logger.error('Error handling join-room event:', error);
            socket.emit('error', { 
                code: 'JOIN_ERROR',
                message: 'Failed to process join request' 
            });
        }
    }

    /**
     * Handle leave-room event
     * 
     * Processes the leave request through the room service and broadcasts
     * user-left event to remaining participants. Also broadcasts room-occupancy-update
     * to all viewers of the room list.
     * 
     * @param socket - Socket connection
     * @param data - Leave room event data
     * @validates Requirements 8.2, 8.3, 9.4
     */
    private async handleLeaveRoom(socket: PublicSocket, data: LeaveRoomEvent): Promise<void> {
        try {
            const roomId = socket.roomId;
            const userId = data.userId;

            if (!roomId || !userId) {
                socket.emit('error', { 
                    code: 'INVALID_REQUEST',
                    message: 'Room ID or User ID missing' 
                });
                return;
            }

            logger.info(`Anonymous user ${userId} leaving public room ${roomId} via socket`);

            // Process leave through room service (handles occupancy decrement)
            await PublicRoomService.leaveRoom(roomId, userId);

            // Get updated room information
            const rooms = await PublicRoomService.getPublicRooms();
            const room = rooms.find(r => r.id === roomId);

            // Broadcast user-left event to remaining participants (Requirement 8.2)
            const userLeftEvent: UserLeftEvent = {
                userId,
                currentOccupancy: room?.currentOccupancy || 0,
            };

            // Broadcast to all clients in this room namespace
            socket.nsp.emit('user-left', userLeftEvent);

            logger.info(`Broadcasted user-left event for user ${userId} in public room ${roomId}`);

            // Broadcast room-occupancy-update to the main namespace for room list updates (Requirement 8.3)
            this.broadcastRoomOccupancyUpdate(roomId, room?.currentOccupancy || 0);

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
     * Handle toggle-video event
     * 
     * Updates the participant's video status in the database and broadcasts
     * the change to all participants in the room.
     * 
     * @param socket - Socket connection
     * @param data - Toggle video event data
     * @validates Requirements 8.4
     */
    private async handleToggleVideo(socket: PublicSocket, data: ToggleVideoEvent): Promise<void> {
        try {
            const roomId = socket.roomId;
            const userId = data.userId;
            const enabled = data.enabled;

            if (!roomId || !userId) {
                socket.emit('error', { 
                    code: 'INVALID_REQUEST',
                    message: 'Room ID or User ID missing' 
                });
                return;
            }

            logger.info(`User ${userId} toggling video to ${enabled} in public room ${roomId}`);

            // Update participant's video status in database
            await PRISMA_DB_CLIENT.roomParticipant.update({
                where: {
                    roomId_anonymousUserId: {
                        roomId,
                        anonymousUserId: userId,
                    },
                },
                data: {
                    isVideoEnabled: enabled,
                },
            });

            // Broadcast participant-video-toggle event to all participants (Requirement 8.4)
            const videoToggleEvent: ParticipantVideoToggleEvent = {
                userId,
                enabled,
            };

            socket.nsp.emit('participant-video-toggle', videoToggleEvent);

            logger.info(`Broadcasted participant-video-toggle event for user ${userId} in public room ${roomId}`);

        } catch (error) {
            logger.error('Error handling toggle-video event:', error);
            socket.emit('error', { 
                code: 'TOGGLE_VIDEO_ERROR',
                message: 'Failed to toggle video status' 
            });
        }
    }

    /**
     * Handle toggle-audio event
     * 
     * Updates the participant's audio status in the database and broadcasts
     * the change to all participants in the room.
     * 
     * @param socket - Socket connection
     * @param data - Toggle audio event data
     * @validates Requirements 8.4
     */
    private async handleToggleAudio(socket: PublicSocket, data: ToggleAudioEvent): Promise<void> {
        try {
            const roomId = socket.roomId;
            const userId = data.userId;
            const enabled = data.enabled;

            if (!roomId || !userId) {
                socket.emit('error', { 
                    code: 'INVALID_REQUEST',
                    message: 'Room ID or User ID missing' 
                });
                return;
            }

            logger.info(`User ${userId} toggling audio to ${enabled} in public room ${roomId}`);

            // Update participant's audio status in database
            await PRISMA_DB_CLIENT.roomParticipant.update({
                where: {
                    roomId_anonymousUserId: {
                        roomId,
                        anonymousUserId: userId,
                    },
                },
                data: {
                    isAudioEnabled: enabled,
                },
            });

            // Broadcast participant-audio-toggle event to all participants (Requirement 8.4)
            const audioToggleEvent: ParticipantAudioToggleEvent = {
                userId,
                enabled,
            };

            socket.nsp.emit('participant-audio-toggle', audioToggleEvent);

            logger.info(`Broadcasted participant-audio-toggle event for user ${userId} in public room ${roomId}`);

        } catch (error) {
            logger.error('Error handling toggle-audio event:', error);
            socket.emit('error', { 
                code: 'TOGGLE_AUDIO_ERROR',
                message: 'Failed to toggle audio status' 
            });
        }
    }

    /**
     * Handle send-message event
     * 
     * Validates and sanitizes the message, checks rate limits, stores the message
     * in the database, and broadcasts it to all participants in the room.
     * 
     * @param socket - Socket connection
     * @param data - Send message event data
     * @validates Requirements 6.2, 6.4, 12.3, 12.4
     */
    private async handleSendMessage(socket: PublicSocket, data: SendMessageEvent): Promise<void> {
        try {
            const roomId = socket.roomId;
            const userId = data.userId;
            const content = data.content;

            if (!roomId || !userId) {
                socket.emit('error', { 
                    code: 'INVALID_REQUEST',
                    message: 'Room ID or User ID missing' 
                });
                return;
            }

            if (!content) {
                socket.emit('error', { 
                    code: 'INVALID_MESSAGE',
                    message: 'Message content is required' 
                });
                return;
            }

            logger.info(`User ${userId} sending message in public room ${roomId}`);

            // Check rate limit (Requirement 11.3: 10 messages per minute)
            const rateLimitResult = await RateLimiterService.checkRateLimit(
                socket.ipAddress!,
                RateLimitAction.CHAT_MESSAGE
            );

            if (!rateLimitResult.allowed) {
                logger.warn(`Chat rate limit exceeded for user ${userId}`);
                socket.emit('rate-limit-exceeded', {
                    action: 'chat_message',
                    message: 'Too many messages. Please wait 30 seconds',
                    resetTime: rateLimitResult.blockedUntil || rateLimitResult.resetTime,
                });
                return;
            }

            // Validate and sanitize message (Requirements 12.3, 12.4)
            const validation = SecurityService.validateAndSanitizeChatMessage(content);
            
            if (!validation.isValid) {
                socket.emit('error', { 
                    code: 'INVALID_MESSAGE',
                    message: validation.error || 'Invalid message content' 
                });
                return;
            }

            const sanitizedContent = validation.sanitizedMessage!;

            // Verify user exists and get display name
            const user = await PRISMA_DB_CLIENT.anonymousUser.findUnique({
                where: { id: userId },
            });

            if (!user) {
                socket.emit('error', { 
                    code: 'INVALID_USER',
                    message: 'User not found' 
                });
                return;
            }

            // Verify user is a participant in the room
            const participant = await PRISMA_DB_CLIENT.roomParticipant.findUnique({
                where: {
                    roomId_anonymousUserId: {
                        roomId,
                        anonymousUserId: userId,
                    },
                },
            });

            if (!participant) {
                socket.emit('error', { 
                    code: 'NOT_PARTICIPANT',
                    message: 'You are not a participant in this room' 
                });
                return;
            }

            // Store message in database
            const chatMessage = await PRISMA_DB_CLIENT.chatMessage.create({
                data: {
                    roomId,
                    anonymousUserId: userId,
                    content: sanitizedContent,
                },
            });

            logger.info(`Stored chat message ${chatMessage.id} in public room ${roomId}`);

            // Broadcast new-message event to all participants (Requirement 6.2, 6.4)
            const newMessageEvent: NewMessageEvent = {
                id: chatMessage.id,
                userId: user.id,
                userName: user.displayName,
                content: sanitizedContent,
                timestamp: chatMessage.createdAt.toISOString(),
            };

            socket.nsp.emit('new-message', newMessageEvent);

            logger.info(`Broadcasted new-message event in public room ${roomId}`);

        } catch (error) {
            logger.error('Error handling send-message event:', error);
            socket.emit('error', { 
                code: 'SEND_MESSAGE_ERROR',
                message: 'Failed to send message' 
            });
        }
    }

    /**
     * Get recent chat history for a room
     * 
     * Retrieves the last 50 messages from the room to provide context
     * to users joining the room.
     * 
     * @param roomId - Room ID
     * @returns Array of recent chat messages
     * @validates Requirements 6.5
     */
    private async getChatHistory(roomId: string): Promise<ChatMessage[]> {
        try {
            // Get last 50 messages ordered by creation time
            const messages = await PRISMA_DB_CLIENT.chatMessage.findMany({
                where: { roomId },
                include: {
                    anonymousUser: {
                        select: {
                            id: true,
                            displayName: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
                take: 50,
            });

            // Reverse to get chronological order (oldest first)
            return messages.reverse().map(msg => ({
                id: msg.id,
                userId: msg.anonymousUser.id,
                userName: msg.anonymousUser.displayName,
                content: msg.content,
                timestamp: msg.createdAt.toISOString(),
            }));

        } catch (error) {
            logger.error('Error retrieving chat history:', error);
            return [];
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
     * @validates Requirements 4.1, 5.1
     */
    private async handleGetRtpCapabilities(socket: PublicSocket, callback: Function): Promise<void> {
        try {
            const roomId = socket.roomId;
            const userId = socket.userId;

            if (!roomId || !userId) {
                callback({ error: 'Room ID or User ID missing' });
                return;
            }

            logger.info(`User ${userId} requesting RTP capabilities for room ${roomId}`);

            const rtpCapabilities = await mediasoupService.getRtpCapabilities(roomId);
            
            callback({ rtpCapabilities });
            logger.info(`Sent RTP capabilities to user ${userId} in room ${roomId}`);

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
     * @validates Requirements 4.1, 5.1
     */
    private async handleCreateTransport(
        socket: PublicSocket,
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
                userId,
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
     * @validates Requirements 4.1, 5.1
     */
    private async handleConnectTransport(
        socket: PublicSocket,
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
                userId,
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
     * Creates a producer that allows a participant to send media (audio/video) to the room.
     * Other participants can then consume this media stream.
     * Notifies all other participants about the new producer.
     * 
     * @param socket - Socket connection
     * @param data - Producer creation data
     * @param callback - Callback to send response
     * @validates Requirements 4.2, 5.2
     */
    private async handleProduce(
        socket: PublicSocket,
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

            logger.info(`User ${userId} creating ${data.kind} producer in room ${roomId}`);

            const producerId = await mediasoupService.createProducer(
                roomId,
                userId,
                data.transportId,
                data.kind,
                data.rtpParameters
            );

            callback({ producerId });
            logger.info(`Created ${data.kind} producer ${producerId} for user ${userId} in room ${roomId}`);

            // Notify all other participants in the room about the new producer
            socket.nsp.emit('new-producer', {
                userId,
                producerId,
                kind: data.kind,
            });

            logger.info(`Notified room ${roomId} about new ${data.kind} producer from user ${userId}`);

        } catch (error) {
            logger.error('Error handling produce:', error);
            callback({ error: error instanceof Error ? error.message : 'Failed to create producer' });
        }
    }

    /**
     * Handle consume event
     * 
     * Creates a consumer that allows a participant to receive media from another participant's producer.
     * The consumer is created on the receiving participant's 'recv' transport.
     * 
     * @param socket - Socket connection
     * @param data - Consumer creation data
     * @param callback - Callback to send response
     * @validates Requirements 4.4, 5.4
     */
    private async handleConsume(
        socket: PublicSocket,
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
                userId,
                data.transportId,
                data.producerId,
                data.rtpCapabilities
            );

            callback({
                id: consumer.id,
                producerId: consumer.producerId,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
            });

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
     * @param data - Resume consumer data
     * @param callback - Callback to send response
     * @validates Requirements 4.4, 5.4
     */
    private async handleResumeConsumer(
        socket: PublicSocket,
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
                userId,
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
     * Closes a producer and stops sending media to the room.
     * Notifies all other participants about the closed producer.
     * 
     * @param socket - Socket connection
     * @param data - Close producer data
     * @validates Requirements 4.3, 5.3
     */
    private async handleCloseProducer(
        socket: PublicSocket,
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
                userId,
                data.producerId
            );

            // Notify all other participants about the closed producer
            socket.nsp.emit('producer-closed', {
                userId,
                producerId: data.producerId,
            });

            logger.info(`Closed producer ${data.producerId} for user ${userId} in room ${roomId}`);

        } catch (error) {
            logger.error('Error handling close-producer:', error);
        }
    }

    /**
     * Handle close-consumer event
     * 
     * Closes a consumer and stops receiving media.
     * 
     * @param socket - Socket connection
     * @param data - Close consumer data
     * @validates Requirements 4.5, 5.5
     */
    private async handleCloseConsumer(
        socket: PublicSocket,
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
                userId,
                data.consumerId
            );

            logger.info(`Closed consumer ${data.consumerId} for user ${userId} in room ${roomId}`);

        } catch (error) {
            logger.error('Error handling close-consumer:', error);
        }
    }

    /**
     * Broadcast room occupancy update to the main namespace
     * 
     * This allows clients viewing the room list to receive real-time
     * occupancy updates when users join or leave rooms.
     * 
     * @param roomId - Room ID
     * @param currentOccupancy - Current occupancy count
     * @validates Requirements 2.3, 8.3
     */
    private broadcastRoomOccupancyUpdate(roomId: string, currentOccupancy: number): void {
        const occupancyUpdateEvent: RoomOccupancyUpdateEvent = {
            roomId,
            currentOccupancy,
        };

        // Broadcast to the main namespace (not room-specific)
        // Clients on the room list page should connect to the main namespace
        this.io.emit('room-occupancy-update', occupancyUpdateEvent);

        logger.info(`Broadcasted room-occupancy-update for room ${roomId}: ${currentOccupancy}`);
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
     * @validates Requirements 14.5
     */
    private async handleDisconnection(socket: PublicSocket, reason: string): Promise<void> {
        try {
            const roomId = socket.roomId;
            const userId = socket.userId;
            const ipAddress = socket.ipAddress;

            logger.info(`Socket ${socket.id} disconnected from public room ${roomId}: ${reason}`);

            // Remove connection from tracking
            if (ipAddress) {
                this.removeConnection(ipAddress, socket.id);
                
                // Remove from capacity tracking
                ConnectionManagerService.removeConnection(socket.id);
            }

            if (!roomId || !userId) {
                logger.info(`Socket ${socket.id} disconnected without room/user context`);
                return;
            }

            // Cleanup Mediasoup resources for this participant (Requirements 4.5, 5.5)
            try {
                await mediasoupService.cleanupParticipant(roomId, userId);
                logger.info(`Cleaned up Mediasoup resources for user ${userId} in room ${roomId}`);
            } catch (error) {
                logger.error(`Error cleaning up Mediasoup resources for user ${userId}:`, error);
            }

            // Automatically trigger leave process
            logger.info(`Automatically cleaning up participant ${userId} from public room ${roomId}`);
            
            try {
                await PublicRoomService.leaveRoom(roomId, userId);

                // Get updated room information
                const rooms = await PublicRoomService.getPublicRooms();
                const room = rooms.find(r => r.id === roomId);

                // Broadcast user-left event to remaining participants (Requirement 8.2)
                const userLeftEvent: UserLeftEvent = {
                    userId,
                    currentOccupancy: room?.currentOccupancy || 0,
                };

                // Broadcast to all clients in this room namespace
                socket.nsp.emit('user-left', userLeftEvent);

                logger.info(`Cleanup completed for user ${userId} in public room ${roomId}`);

                // Broadcast room-occupancy-update to the main namespace (Requirement 8.3)
                this.broadcastRoomOccupancyUpdate(roomId, room?.currentOccupancy || 0);

            } catch (error) {
                // If user is not a participant, that's okay (they might have left already)
                logger.info(`User ${userId} was not a participant in public room ${roomId} during cleanup`);
            }

        } catch (error) {
            logger.error('Error during socket disconnection cleanup:', error);
        }
    }

    /**
     * Start WebSocket ping/pong health checks
     * 
     * Sends ping to all connected sockets every 5 minutes.
     * Terminates connections that fail to respond to 3 consecutive pings.
     * 
     * @validates Requirements 14.4, 14.5
     */
    private startHealthChecks(): void {
        this.pingIntervalId = setInterval(() => {
            logger.debug('Running WebSocket health checks');

            // Iterate through all namespaces
            const namespaces = Array.from(this.io._nsps.values());
            
            for (const namespace of namespaces) {
                // Skip if not a public room namespace
                if (!namespace.name.startsWith('/public-room/')) {
                    continue;
                }

                // Check all sockets in this namespace
                const sockets = Array.from(namespace.sockets.values()) as PublicSocket[];
                
                for (const socket of sockets) {
                    const now = Date.now();
                    const lastPing = socket.lastPingAt || now;
                    const timeSinceLastPing = now - lastPing;

                    // Check if socket has been idle for more than PING_INTERVAL
                    if (timeSinceLastPing >= this.PING_INTERVAL) {
                        // Increment missed pings
                        socket.missedPings = (socket.missedPings || 0) + 1;

                        logger.debug(`Socket ${socket.id} missed ping (${socket.missedPings}/${this.MAX_MISSED_PINGS})`);

                        // Terminate connection if max missed pings reached
                        if (socket.missedPings >= this.MAX_MISSED_PINGS) {
                            logger.warn(`Terminating socket ${socket.id} due to ${this.MAX_MISSED_PINGS} missed pings`);
                            socket.emit('error', {
                                code: 'CONNECTION_TIMEOUT',
                                message: 'Connection terminated due to inactivity'
                            });
                            socket.disconnect(true);
                        } else {
                            // Send ping
                            socket.emit('ping');
                            logger.debug(`Sent ping to socket ${socket.id}`);
                        }
                    }
                }
            }
        }, this.PING_INTERVAL);

        logger.info(`WebSocket health checks started (interval: ${this.PING_INTERVAL}ms, max missed: ${this.MAX_MISSED_PINGS})`);
    }

    /**
     * Stop WebSocket health checks
     */
    public stopHealthChecks(): void {
        if (this.pingIntervalId) {
            clearInterval(this.pingIntervalId);
            this.pingIntervalId = undefined;
            logger.info('WebSocket health checks stopped');
        }
    }

    /**
     * Start cleanup interval for reconnection tracking and rate limits
     * Periodically cleans up expired entries to prevent memory leaks
     */
    private startCleanupInterval(): void {
        this.cleanupIntervalId = setInterval(() => {
            logger.debug('Running cleanup for reconnection tracking and rate limits');
            
            // Clean up reconnection tracking
            ConnectionManagerService.cleanupReconnectionTracking();
            
            // Clean up rate limit records
            RateLimiterService.cleanupExpiredRecords().catch(error => {
                logger.error('Error cleaning up rate limit records:', error);
            });
            
        }, this.CLEANUP_INTERVAL);

        logger.info(`Cleanup interval started (interval: ${this.CLEANUP_INTERVAL}ms)`);
    }

    /**
     * Stop cleanup interval
     */
    public stopCleanupInterval(): void {
        if (this.cleanupIntervalId) {
            clearInterval(this.cleanupIntervalId);
            this.cleanupIntervalId = undefined;
            logger.info('Cleanup interval stopped');
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
     * Get a specific public room namespace
     * 
     * @param roomId - Room ID
     * @returns Namespace for the public room
     */
    public getPublicRoomNamespace(roomId: string): Namespace {
        return this.io.of(`/public-room/${roomId}`);
    }

    /**
     * Broadcast an event to all participants in a public room
     * 
     * Utility method for broadcasting events from outside the socket handlers
     * (e.g., from REST API endpoints).
     * 
     * @param roomId - Room ID
     * @param event - Event name
     * @param data - Event data
     */
    public broadcastToPublicRoom(roomId: string, event: string, data: any): void {
        const namespace = this.getPublicRoomNamespace(roomId);
        namespace.emit(event, data);
        logger.info(`Broadcasted ${event} event to public room ${roomId}`);
    }

    /**
     * Get connection count for an IP address
     * 
     * @param ipAddress - IP address to check
     * @returns Number of active connections
     */
    public getConnectionCount(ipAddress: string): number {
        const hashedIp = SecurityService.hashIpAddress(ipAddress);
        const connections = this.connectionsByIp.get(hashedIp) || [];
        return connections.length;
    }

    /**
     * Get system capacity status
     * 
     * @returns Current capacity information
     */
    public getCapacityStatus() {
        return ConnectionManagerService.getCapacityStatus();
    }

    /**
     * Get reconnection status for an IP
     * 
     * @param ipAddress - IP address to check
     * @returns Reconnection tracking information
     */
    public getReconnectionStatus(ipAddress: string) {
        return ConnectionManagerService.getReconnectionStatus(ipAddress);
    }
}

// Export singleton instance factory
let publicSocketServerInstance: PublicRoomSocketServer | null = null;

/**
 * Initialize the Public Rooms Socket.io server
 * 
 * @param io - Socket.io server instance
 * @returns PublicRoomSocketServer instance
 */
export function initializePublicRoomSocketServer(io: SocketIOServer): PublicRoomSocketServer {
    if (!publicSocketServerInstance) {
        publicSocketServerInstance = new PublicRoomSocketServer(io);
        publicSocketServerInstance.initialize();
    }
    return publicSocketServerInstance;
}

/**
 * Get the Public Rooms Socket.io server instance
 * 
 * @returns PublicRoomSocketServer instance or null if not initialized
 */
export function getPublicRoomSocketServer(): PublicRoomSocketServer | null {
    return publicSocketServerInstance;
}
