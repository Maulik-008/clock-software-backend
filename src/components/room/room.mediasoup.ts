import * as mediasoup from 'mediasoup';
import { Worker, Router, WebRtcTransport, Producer, Consumer, RtpCapabilities, DtlsParameters, MediaKind, RtpParameters } from 'mediasoup/node/lib/types';
import * as os from 'os';
import logger from './logger';

/**
 * Mediasoup Integration for Shared Study Rooms
 * 
 * Implements SFU (Selective Forwarding Unit) architecture for WebRTC media streaming.
 * Manages worker pool, routers per room, transports, producers, and consumers.
 * Designed to support 50 concurrent participants per room across 10 rooms.
 * 
 * Requirements: 5.1, 5.2
 */

// Mediasoup configuration
const mediasoupConfig = {
    // Worker settings
    worker: {
        rtcMinPort: 10000,
        rtcMaxPort: 10100,
        logLevel: 'warn' as const,
        logTags: [
            'info',
            'ice',
            'dtls',
            'rtp',
            'srtp',
            'rtcp',
        ] as mediasoup.types.WorkerLogTag[],
    },
    // Router settings
    router: {
        mediaCodecs: [
            {
                kind: 'audio' as MediaKind,
                mimeType: 'audio/opus',
                clockRate: 48000,
                channels: 2,
            },
            {
                kind: 'video' as MediaKind,
                mimeType: 'video/VP8',
                clockRate: 90000,
                parameters: {
                    'x-google-start-bitrate': 1000,
                },
            },
        ],
    },
    // WebRTC transport settings
    webRtcTransport: {
        listenIps: [
            {
                ip: '0.0.0.0',
                announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1',
            },
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate: 1000000,
        maxSctpMessageSize: 262144,
    },
};

// Interface for room router data
interface RoomRouterData {
    roomId: string;
    router: Router;
    transports: Map<string, WebRtcTransport>; // participantId -> transport
    producers: Map<string, Producer[]>; // participantId -> producers
    consumers: Map<string, Consumer[]>; // participantId -> consumers
}

// Interface for transport options
export interface TransportOptions {
    id: string;
    iceParameters: any;
    iceCandidates: any[];
    dtlsParameters: DtlsParameters;
}

// Interface for producer options
export interface ProducerOptions {
    kind: MediaKind;
    rtpParameters: RtpParameters;
    appData?: any;
}

// Interface for consumer options
export interface ConsumerOptions {
    producerId: string;
    rtpCapabilities: RtpCapabilities;
    appData?: any;
}

/**
 * MediasoupService
 * 
 * Singleton service that manages Mediasoup workers, routers, and media streams.
 * Implements worker pool with one worker per CPU core for optimal performance.
 */
export class MediasoupService {
    private static instance: MediasoupService;
    private workers: Worker[] = [];
    private nextWorkerIndex: number = 0;
    private roomRouters: Map<string, RoomRouterData> = new Map();
    private initialized: boolean = false;

    private constructor() {}

    /**
     * Get singleton instance
     */
    public static getInstance(): MediasoupService {
        if (!MediasoupService.instance) {
            MediasoupService.instance = new MediasoupService();
        }
        return MediasoupService.instance;
    }

    /**
     * Initialize Mediasoup workers
     * 
     * Creates one worker per CPU core for optimal load distribution.
     * Workers handle the actual media processing and routing.
     * 
     * @validates Requirements 5.1
     */
    public async initialize(): Promise<void> {
        if (this.initialized) {
            logger.info('Mediasoup service already initialized');
            return;
        }

        try {
            const numWorkers = os.cpus().length;
            logger.info(`Initializing ${numWorkers} Mediasoup workers (one per CPU core)`);

            for (let i = 0; i < numWorkers; i++) {
                const worker = await mediasoup.createWorker({
                    logLevel: mediasoupConfig.worker.logLevel,
                    logTags: mediasoupConfig.worker.logTags,
                    rtcMinPort: mediasoupConfig.worker.rtcMinPort,
                    rtcMaxPort: mediasoupConfig.worker.rtcMaxPort,
                });

                worker.on('died', () => {
                    logger.error(`Mediasoup worker ${worker.pid} died, exiting in 2 seconds...`);
                    setTimeout(() => process.exit(1), 2000);
                });

                this.workers.push(worker);
                logger.info(`Mediasoup worker ${i + 1}/${numWorkers} created (PID: ${worker.pid})`);
            }

            this.initialized = true;
            logger.info('Mediasoup service initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Mediasoup service:', error);
            throw error;
        }
    }

    /**
     * Get next worker using round-robin strategy
     * 
     * Distributes load evenly across all workers.
     * 
     * @returns Next worker in the pool
     */
    private getNextWorker(): Worker {
        const worker = this.workers[this.nextWorkerIndex];
        this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
        return worker;
    }

    /**
     * Create or get router for a room
     * 
     * Creates a new Mediasoup router for the room if one doesn't exist.
     * Routers handle media routing between participants in a room.
     * Uses round-robin worker selection for load balancing.
     * 
     * @param roomId - Room ID
     * @returns Router for the room
     * @validates Requirements 5.1
     */
    public async createRouter(roomId: string): Promise<Router> {
        if (!this.initialized) {
            throw new Error('Mediasoup service not initialized. Call initialize() first.');
        }

        // Check if router already exists for this room
        const existingRouterData = this.roomRouters.get(roomId);
        if (existingRouterData) {
            logger.info(`Reusing existing router for room ${roomId}`);
            return existingRouterData.router;
        }

        try {
            // Get next worker using round-robin
            const worker = this.getNextWorker();
            
            // Create router with media codecs
            const router = await worker.createRouter({
                mediaCodecs: mediasoupConfig.router.mediaCodecs,
            });

            // Initialize room router data
            const roomRouterData: RoomRouterData = {
                roomId,
                router,
                transports: new Map(),
                producers: new Map(),
                consumers: new Map(),
            };

            this.roomRouters.set(roomId, roomRouterData);
            
            logger.info(`Created new router for room ${roomId} on worker ${worker.pid}`);
            return router;
        } catch (error) {
            logger.error(`Failed to create router for room ${roomId}:`, error);
            throw error;
        }
    }

    /**
     * Get router for a room
     * 
     * @param roomId - Room ID
     * @returns Router for the room or undefined if not found
     */
    public getRouter(roomId: string): Router | undefined {
        const roomRouterData = this.roomRouters.get(roomId);
        return roomRouterData?.router;
    }

    /**
     * Get RTP capabilities for a room
     * 
     * Returns the RTP capabilities of the router for the room.
     * Clients need these capabilities to configure their media producers.
     * 
     * @param roomId - Room ID
     * @returns RTP capabilities
     */
    public async getRtpCapabilities(roomId: string): Promise<RtpCapabilities> {
        const router = await this.createRouter(roomId);
        return router.rtpCapabilities;
    }

    /**
     * Create WebRTC transport for a participant
     * 
     * Creates a WebRTC transport that allows a participant to send or receive media.
     * Each participant typically needs two transports: one for producing and one for consuming.
     * 
     * @param roomId - Room ID
     * @param participantId - Participant ID (user ID or socket ID)
     * @param direction - Transport direction ('send' for producer, 'recv' for consumer)
     * @returns Transport options for client-side connection
     * @validates Requirements 5.2
     */
    public async createTransport(
        roomId: string,
        participantId: string,
        direction: 'send' | 'recv'
    ): Promise<TransportOptions> {
        if (!this.initialized) {
            throw new Error('Mediasoup service not initialized. Call initialize() first.');
        }

        try {
            // Get or create router for the room
            const router = await this.createRouter(roomId);
            const roomRouterData = this.roomRouters.get(roomId);
            
            if (!roomRouterData) {
                throw new Error(`Room router data not found for room ${roomId}`);
            }

            // Create WebRTC transport
            const transport = await router.createWebRtcTransport({
                listenIps: mediasoupConfig.webRtcTransport.listenIps,
                enableUdp: mediasoupConfig.webRtcTransport.enableUdp,
                enableTcp: mediasoupConfig.webRtcTransport.enableTcp,
                preferUdp: mediasoupConfig.webRtcTransport.preferUdp,
                initialAvailableOutgoingBitrate: mediasoupConfig.webRtcTransport.initialAvailableOutgoingBitrate,
                maxSctpMessageSize: mediasoupConfig.webRtcTransport.maxSctpMessageSize,
                appData: { participantId, direction },
            });

            // Store transport in room data
            const transportKey = `${participantId}-${direction}`;
            roomRouterData.transports.set(transportKey, transport);

            // Handle transport close
            transport.on('dtlsstatechange', (dtlsState: string) => {
                if (dtlsState === 'closed') {
                    logger.info(`Transport ${transport.id} closed for participant ${participantId}`);
                    roomRouterData.transports.delete(transportKey);
                }
            });

            logger.info(`Created ${direction} transport ${transport.id} for participant ${participantId} in room ${roomId}`);

            // Return transport options for client
            return {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            };
        } catch (error) {
            logger.error(`Failed to create transport for participant ${participantId} in room ${roomId}:`, error);
            throw error;
        }
    }

    /**
     * Connect transport
     * 
     * Completes the transport connection by providing DTLS parameters from the client.
     * Must be called after creating the transport and before producing/consuming media.
     * 
     * @param roomId - Room ID
     * @param participantId - Participant ID
     * @param transportId - Transport ID
     * @param dtlsParameters - DTLS parameters from client
     */
    public async connectTransport(
        roomId: string,
        participantId: string,
        transportId: string,
        dtlsParameters: DtlsParameters
    ): Promise<void> {
        try {
            const roomRouterData = this.roomRouters.get(roomId);
            if (!roomRouterData) {
                throw new Error(`Room router data not found for room ${roomId}`);
            }

            // Find the transport
            let transport: WebRtcTransport | undefined;
            for (const [key, t] of roomRouterData.transports.entries()) {
                if (t.id === transportId) {
                    transport = t;
                    break;
                }
            }

            if (!transport) {
                throw new Error(`Transport ${transportId} not found for participant ${participantId}`);
            }

            // Connect the transport
            await transport.connect({ dtlsParameters });
            
            logger.info(`Connected transport ${transportId} for participant ${participantId} in room ${roomId}`);
        } catch (error) {
            logger.error(`Failed to connect transport ${transportId}:`, error);
            throw error;
        }
    }

    /**
     * Create producer
     * 
     * Creates a producer that allows a participant to send media (audio/video) to the room.
     * Other participants can then consume this media stream.
     * 
     * @param roomId - Room ID
     * @param participantId - Participant ID
     * @param transportId - Transport ID (must be a 'send' transport)
     * @param kind - Media kind ('audio' or 'video')
     * @param rtpParameters - RTP parameters from client
     * @returns Producer ID
     */
    public async createProducer(
        roomId: string,
        participantId: string,
        transportId: string,
        kind: MediaKind,
        rtpParameters: RtpParameters
    ): Promise<string> {
        try {
            const roomRouterData = this.roomRouters.get(roomId);
            if (!roomRouterData) {
                throw new Error(`Room router data not found for room ${roomId}`);
            }

            // Find the transport
            let transport: WebRtcTransport | undefined;
            for (const [key, t] of roomRouterData.transports.entries()) {
                if (t.id === transportId) {
                    transport = t;
                    break;
                }
            }

            if (!transport) {
                throw new Error(`Transport ${transportId} not found`);
            }

            // Create producer
            const producer = await transport.produce({
                kind,
                rtpParameters,
                appData: { participantId },
            });

            // Store producer
            const producers = roomRouterData.producers.get(participantId) || [];
            producers.push(producer);
            roomRouterData.producers.set(participantId, producers);

            // Handle producer close
            producer.on('transportclose', () => {
                logger.info(`Producer ${producer.id} transport closed for participant ${participantId}`);
                this.removeProducer(roomId, participantId, producer.id);
            });

            logger.info(`Created ${kind} producer ${producer.id} for participant ${participantId} in room ${roomId}`);
            
            return producer.id;
        } catch (error) {
            logger.error(`Failed to create producer for participant ${participantId}:`, error);
            throw error;
        }
    }

    /**
     * Create consumer
     * 
     * Creates a consumer that allows a participant to receive media from another participant's producer.
     * The consumer is created on the receiving participant's 'recv' transport.
     * 
     * @param roomId - Room ID
     * @param participantId - Participant ID (consumer)
     * @param transportId - Transport ID (must be a 'recv' transport)
     * @param producerId - Producer ID to consume
     * @param rtpCapabilities - RTP capabilities of the consuming client
     * @returns Consumer data (id, kind, rtpParameters, producerId)
     */
    public async createConsumer(
        roomId: string,
        participantId: string,
        transportId: string,
        producerId: string,
        rtpCapabilities: RtpCapabilities
    ): Promise<{
        id: string;
        producerId: string;
        kind: MediaKind;
        rtpParameters: RtpParameters;
    }> {
        try {
            const roomRouterData = this.roomRouters.get(roomId);
            if (!roomRouterData) {
                throw new Error(`Room router data not found for room ${roomId}`);
            }

            const router = roomRouterData.router;

            // Check if router can consume the producer
            if (!router.canConsume({ producerId, rtpCapabilities })) {
                throw new Error(`Router cannot consume producer ${producerId}`);
            }

            // Find the transport
            let transport: WebRtcTransport | undefined;
            for (const [key, t] of roomRouterData.transports.entries()) {
                if (t.id === transportId) {
                    transport = t;
                    break;
                }
            }

            if (!transport) {
                throw new Error(`Transport ${transportId} not found`);
            }

            // Create consumer
            const consumer = await transport.consume({
                producerId,
                rtpCapabilities,
                paused: true, // Start paused, client will resume
                appData: { participantId },
            });

            // Store consumer
            const consumers = roomRouterData.consumers.get(participantId) || [];
            consumers.push(consumer);
            roomRouterData.consumers.set(participantId, consumers);

            // Handle consumer close
            consumer.on('transportclose', () => {
                logger.info(`Consumer ${consumer.id} transport closed for participant ${participantId}`);
                this.removeConsumer(roomId, participantId, consumer.id);
            });

            consumer.on('producerclose', () => {
                logger.info(`Consumer ${consumer.id} producer closed for participant ${participantId}`);
                this.removeConsumer(roomId, participantId, consumer.id);
            });

            logger.info(`Created consumer ${consumer.id} for participant ${participantId} in room ${roomId}`);

            return {
                id: consumer.id,
                producerId: consumer.producerId,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
            };
        } catch (error) {
            logger.error(`Failed to create consumer for participant ${participantId}:`, error);
            throw error;
        }
    }

    /**
     * Resume consumer
     * 
     * Resumes a paused consumer to start receiving media.
     * Consumers are created in paused state by default.
     * 
     * @param roomId - Room ID
     * @param participantId - Participant ID
     * @param consumerId - Consumer ID
     */
    public async resumeConsumer(
        roomId: string,
        participantId: string,
        consumerId: string
    ): Promise<void> {
        try {
            const roomRouterData = this.roomRouters.get(roomId);
            if (!roomRouterData) {
                throw new Error(`Room router data not found for room ${roomId}`);
            }

            const consumers = roomRouterData.consumers.get(participantId);
            if (!consumers) {
                throw new Error(`No consumers found for participant ${participantId}`);
            }

            const consumer = consumers.find(c => c.id === consumerId);
            if (!consumer) {
                throw new Error(`Consumer ${consumerId} not found`);
            }

            await consumer.resume();
            logger.info(`Resumed consumer ${consumerId} for participant ${participantId} in room ${roomId}`);
        } catch (error) {
            logger.error(`Failed to resume consumer ${consumerId}:`, error);
            throw error;
        }
    }

    /**
     * Pause consumer
     * 
     * Pauses a consumer to stop receiving media temporarily.
     * 
     * @param roomId - Room ID
     * @param participantId - Participant ID
     * @param consumerId - Consumer ID
     */
    public async pauseConsumer(
        roomId: string,
        participantId: string,
        consumerId: string
    ): Promise<void> {
        try {
            const roomRouterData = this.roomRouters.get(roomId);
            if (!roomRouterData) {
                throw new Error(`Room router data not found for room ${roomId}`);
            }

            const consumers = roomRouterData.consumers.get(participantId);
            if (!consumers) {
                throw new Error(`No consumers found for participant ${participantId}`);
            }

            const consumer = consumers.find(c => c.id === consumerId);
            if (!consumer) {
                throw new Error(`Consumer ${consumerId} not found`);
            }

            await consumer.pause();
            logger.info(`Paused consumer ${consumerId} for participant ${participantId} in room ${roomId}`);
        } catch (error) {
            logger.error(`Failed to pause consumer ${consumerId}:`, error);
            throw error;
        }
    }

    /**
     * Get all producers in a room
     * 
     * Returns all active producers in the room, useful for notifying
     * new participants about existing media streams.
     * 
     * @param roomId - Room ID
     * @returns Array of producer information
     */
    public getProducers(roomId: string): Array<{
        participantId: string;
        producerId: string;
        kind: MediaKind;
    }> {
        const roomRouterData = this.roomRouters.get(roomId);
        if (!roomRouterData) {
            return [];
        }

        const producers: Array<{
            participantId: string;
            producerId: string;
            kind: MediaKind;
        }> = [];

        for (const [participantId, participantProducers] of roomRouterData.producers.entries()) {
            for (const producer of participantProducers) {
                producers.push({
                    participantId,
                    producerId: producer.id,
                    kind: producer.kind,
                });
            }
        }

        return producers;
    }

    /**
     * Get producers for a specific participant
     * 
     * @param roomId - Room ID
     * @param participantId - Participant ID
     * @returns Array of producer IDs
     */
    public getParticipantProducers(roomId: string, participantId: string): string[] {
        const roomRouterData = this.roomRouters.get(roomId);
        if (!roomRouterData) {
            return [];
        }

        const producers = roomRouterData.producers.get(participantId);
        if (!producers) {
            return [];
        }

        return producers.map(p => p.id);
    }

    /**
     * Remove producer
     * 
     * Closes and removes a producer from the room.
     * 
     * @param roomId - Room ID
     * @param participantId - Participant ID
     * @param producerId - Producer ID
     */
    private removeProducer(roomId: string, participantId: string, producerId: string): void {
        const roomRouterData = this.roomRouters.get(roomId);
        if (!roomRouterData) {
            return;
        }

        const producers = roomRouterData.producers.get(participantId);
        if (!producers) {
            return;
        }

        const index = producers.findIndex(p => p.id === producerId);
        if (index !== -1) {
            producers.splice(index, 1);
            if (producers.length === 0) {
                roomRouterData.producers.delete(participantId);
            }
            logger.info(`Removed producer ${producerId} for participant ${participantId} in room ${roomId}`);
        }
    }

    /**
     * Remove consumer
     * 
     * Closes and removes a consumer from the room.
     * 
     * @param roomId - Room ID
     * @param participantId - Participant ID
     * @param consumerId - Consumer ID
     */
    private removeConsumer(roomId: string, participantId: string, consumerId: string): void {
        const roomRouterData = this.roomRouters.get(roomId);
        if (!roomRouterData) {
            return;
        }

        const consumers = roomRouterData.consumers.get(participantId);
        if (!consumers) {
            return;
        }

        const index = consumers.findIndex(c => c.id === consumerId);
        if (index !== -1) {
            consumers.splice(index, 1);
            if (consumers.length === 0) {
                roomRouterData.consumers.delete(participantId);
            }
            logger.info(`Removed consumer ${consumerId} for participant ${participantId} in room ${roomId}`);
        }
    }

    /**
     * Close producer
     * 
     * Explicitly closes a producer and removes it from the room.
     * 
     * @param roomId - Room ID
     * @param participantId - Participant ID
     * @param producerId - Producer ID
     */
    public async closeProducer(
        roomId: string,
        participantId: string,
        producerId: string
    ): Promise<void> {
        try {
            const roomRouterData = this.roomRouters.get(roomId);
            if (!roomRouterData) {
                throw new Error(`Room router data not found for room ${roomId}`);
            }

            const producers = roomRouterData.producers.get(participantId);
            if (!producers) {
                throw new Error(`No producers found for participant ${participantId}`);
            }

            const producer = producers.find(p => p.id === producerId);
            if (!producer) {
                throw new Error(`Producer ${producerId} not found`);
            }

            producer.close();
            this.removeProducer(roomId, participantId, producerId);
            
            logger.info(`Closed producer ${producerId} for participant ${participantId} in room ${roomId}`);
        } catch (error) {
            logger.error(`Failed to close producer ${producerId}:`, error);
            throw error;
        }
    }

    /**
     * Close consumer
     * 
     * Explicitly closes a consumer and removes it from the room.
     * 
     * @param roomId - Room ID
     * @param participantId - Participant ID
     * @param consumerId - Consumer ID
     */
    public async closeConsumer(
        roomId: string,
        participantId: string,
        consumerId: string
    ): Promise<void> {
        try {
            const roomRouterData = this.roomRouters.get(roomId);
            if (!roomRouterData) {
                throw new Error(`Room router data not found for room ${roomId}`);
            }

            const consumers = roomRouterData.consumers.get(participantId);
            if (!consumers) {
                throw new Error(`No consumers found for participant ${participantId}`);
            }

            const consumer = consumers.find(c => c.id === consumerId);
            if (!consumer) {
                throw new Error(`Consumer ${consumerId} not found`);
            }

            consumer.close();
            this.removeConsumer(roomId, participantId, consumerId);
            
            logger.info(`Closed consumer ${consumerId} for participant ${participantId} in room ${roomId}`);
        } catch (error) {
            logger.error(`Failed to close consumer ${consumerId}:`, error);
            throw error;
        }
    }

    /**
     * Cleanup participant
     * 
     * Closes all transports, producers, and consumers for a participant.
     * Called when a participant leaves the room or disconnects.
     * 
     * @param roomId - Room ID
     * @param participantId - Participant ID
     */
    public async cleanupParticipant(roomId: string, participantId: string): Promise<void> {
        try {
            const roomRouterData = this.roomRouters.get(roomId);
            if (!roomRouterData) {
                logger.warn(`Room router data not found for room ${roomId} during cleanup`);
                return;
            }

            // Close all producers
            const producers = roomRouterData.producers.get(participantId);
            if (producers) {
                for (const producer of producers) {
                    try {
                        producer.close();
                    } catch (error) {
                        logger.error(`Error closing producer ${producer.id}:`, error);
                    }
                }
                roomRouterData.producers.delete(participantId);
            }

            // Close all consumers
            const consumers = roomRouterData.consumers.get(participantId);
            if (consumers) {
                for (const consumer of consumers) {
                    try {
                        consumer.close();
                    } catch (error) {
                        logger.error(`Error closing consumer ${consumer.id}:`, error);
                    }
                }
                roomRouterData.consumers.delete(participantId);
            }

            // Close all transports
            const transportsToClose: WebRtcTransport[] = [];
            for (const [key, transport] of roomRouterData.transports.entries()) {
                if (key.startsWith(participantId)) {
                    transportsToClose.push(transport);
                }
            }

            for (const transport of transportsToClose) {
                try {
                    transport.close();
                    // Remove from map
                    for (const [key, t] of roomRouterData.transports.entries()) {
                        if (t.id === transport.id) {
                            roomRouterData.transports.delete(key);
                            break;
                        }
                    }
                } catch (error) {
                    logger.error(`Error closing transport ${transport.id}:`, error);
                }
            }

            logger.info(`Cleaned up all media resources for participant ${participantId} in room ${roomId}`);
        } catch (error) {
            logger.error(`Error during participant cleanup for ${participantId} in room ${roomId}:`, error);
        }
    }

    /**
     * Cleanup room
     * 
     * Closes the router and all associated resources for a room.
     * Called when a room is closed or no longer needed.
     * 
     * @param roomId - Room ID
     */
    public async cleanupRoom(roomId: string): Promise<void> {
        try {
            const roomRouterData = this.roomRouters.get(roomId);
            if (!roomRouterData) {
                logger.warn(`Room router data not found for room ${roomId} during cleanup`);
                return;
            }

            // Close all transports (this will also close producers and consumers)
            for (const [key, transport] of roomRouterData.transports.entries()) {
                try {
                    transport.close();
                } catch (error) {
                    logger.error(`Error closing transport ${transport.id}:`, error);
                }
            }

            // Close the router
            try {
                roomRouterData.router.close();
            } catch (error) {
                logger.error(`Error closing router for room ${roomId}:`, error);
            }

            // Remove room data
            this.roomRouters.delete(roomId);

            logger.info(`Cleaned up all resources for room ${roomId}`);
        } catch (error) {
            logger.error(`Error during room cleanup for ${roomId}:`, error);
        }
    }

    /**
     * Get statistics for a room
     * 
     * Returns statistics about media resources in a room.
     * 
     * @param roomId - Room ID
     * @returns Room statistics
     */
    public getRoomStats(roomId: string): {
        participantCount: number;
        transportCount: number;
        producerCount: number;
        consumerCount: number;
    } {
        const roomRouterData = this.roomRouters.get(roomId);
        if (!roomRouterData) {
            return {
                participantCount: 0,
                transportCount: 0,
                producerCount: 0,
                consumerCount: 0,
            };
        }

        let producerCount = 0;
        for (const producers of roomRouterData.producers.values()) {
            producerCount += producers.length;
        }

        let consumerCount = 0;
        for (const consumers of roomRouterData.consumers.values()) {
            consumerCount += consumers.length;
        }

        return {
            participantCount: roomRouterData.producers.size,
            transportCount: roomRouterData.transports.size,
            producerCount,
            consumerCount,
        };
    }

    /**
     * Get worker statistics
     * 
     * Returns statistics about all workers.
     * 
     * @returns Array of worker statistics
     */
    public async getWorkerStats(): Promise<Array<{
        pid: number;
        routerCount: number;
    }>> {
        const stats: Array<{ pid: number; routerCount: number }> = [];

        for (const worker of this.workers) {
            // Count routers for this worker by checking room router data
            let routerCount = 0;
            for (const roomData of this.roomRouters.values()) {
                // Check if this router belongs to this worker
                // Note: There's no direct way to get router IDs from worker in mediasoup v3
                // We count routers we've created for this worker
                routerCount++;
            }
            
            stats.push({
                pid: worker.pid,
                routerCount: Math.floor(routerCount / this.workers.length), // Approximate distribution
            });
        }

        return stats;
    }

    /**
     * Check if service is initialized
     * 
     * @returns True if initialized, false otherwise
     */
    public isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Shutdown the service
     * 
     * Closes all workers and cleans up all resources.
     * Should be called when the application is shutting down.
     */
    public async shutdown(): Promise<void> {
        logger.info('Shutting down Mediasoup service...');

        // Cleanup all rooms
        const roomIds = Array.from(this.roomRouters.keys());
        for (const roomId of roomIds) {
            await this.cleanupRoom(roomId);
        }

        // Close all workers
        for (const worker of this.workers) {
            try {
                worker.close();
                logger.info(`Closed worker ${worker.pid}`);
            } catch (error) {
                logger.error(`Error closing worker ${worker.pid}:`, error);
            }
        }

        this.workers = [];
        this.roomRouters.clear();
        this.initialized = false;

        logger.info('Mediasoup service shutdown complete');
    }
}

// Export singleton instance
export const mediasoupService = MediasoupService.getInstance();
