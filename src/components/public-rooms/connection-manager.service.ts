import { SecurityService, SuspiciousActivityType } from "./security.service";
import logger from "../../config/logger";

/**
 * Reconnection tracking entry
 */
interface ReconnectionEntry {
    count: number;
    lastAttempt: number;
    backoffUntil: number;
}

/**
 * Queue entry for system capacity management
 */
interface QueueEntry {
    ipAddress: string;
    timestamp: number;
    resolve: (allowed: boolean) => void;
}

/**
 * ConnectionManagerService handles reconnection backoff and system capacity management
 * 
 * Requirements: 13.3, 13.4, 14.2
 */
export class ConnectionManagerService {
    // Track reconnection attempts per IP
    private static reconnectionTracking: Map<string, ReconnectionEntry> = new Map();
    
    // Track active connections for system capacity
    private static activeConnections: Set<string> = new Set();
    
    // Queue for connections when at capacity
    private static connectionQueue: QueueEntry[] = [];
    
    // Configuration
    private static readonly MAX_CONCURRENT_USERS = 100;
    private static readonly INITIAL_BACKOFF_MS = 1000; // 1 second
    private static readonly MAX_BACKOFF_MS = 60000; // 60 seconds
    private static readonly BACKOFF_MULTIPLIER = 2;
    private static readonly RECONNECTION_WINDOW_MS = 60000; // 1 minute
    private static readonly RAPID_RECONNECTION_THRESHOLD = 3; // 3 reconnections in window
    private static readonly QUEUE_TIMEOUT_MS = 30000; // 30 seconds

    /**
     * Checks if a reconnection attempt should be allowed with exponential backoff
     * Requirement 13.3: Exponential backoff for rapid reconnections
     * 
     * @param ipAddress - The IP address attempting to reconnect
     * @returns Object indicating if reconnection is allowed and backoff time
     */
    static checkReconnectionBackoff(ipAddress: string): {
        allowed: boolean;
        backoffMs?: number;
        message?: string;
    } {
        const hashedIp = SecurityService.hashIpAddress(ipAddress);
        const now = Date.now();
        const entry = this.reconnectionTracking.get(hashedIp);

        // If no entry or window expired, allow connection
        if (!entry || now - entry.lastAttempt > this.RECONNECTION_WINDOW_MS) {
            this.reconnectionTracking.set(hashedIp, {
                count: 1,
                lastAttempt: now,
                backoffUntil: 0,
            });
            return { allowed: true };
        }

        // Check if still in backoff period
        if (now < entry.backoffUntil) {
            const remainingMs = entry.backoffUntil - now;
            logger.warn(`Reconnection blocked for IP ${hashedIp.substring(0, 8)}... - backoff: ${remainingMs}ms remaining`);
            
            return {
                allowed: false,
                backoffMs: remainingMs,
                message: `Please wait ${Math.ceil(remainingMs / 1000)} seconds before reconnecting`,
            };
        }

        // Increment reconnection count
        entry.count++;
        entry.lastAttempt = now;

        // Check if rapid reconnection threshold exceeded
        if (entry.count >= this.RAPID_RECONNECTION_THRESHOLD) {
            // Calculate exponential backoff
            const backoffAttempts = entry.count - this.RAPID_RECONNECTION_THRESHOLD + 1;
            const backoffMs = Math.min(
                this.INITIAL_BACKOFF_MS * Math.pow(this.BACKOFF_MULTIPLIER, backoffAttempts - 1),
                this.MAX_BACKOFF_MS
            );
            
            entry.backoffUntil = now + backoffMs;
            
            logger.warn(`Rapid reconnection detected for IP ${hashedIp.substring(0, 8)}... - applying ${backoffMs}ms backoff (attempt ${entry.count})`);
            
            // Log suspicious activity (Requirement 13.4)
            SecurityService.logSuspiciousActivity(
                ipAddress,
                SuspiciousActivityType.RAPID_RECONNECTION,
                `${entry.count} reconnection attempts in ${this.RECONNECTION_WINDOW_MS}ms window`
            ).catch(err => logger.error('Failed to log suspicious activity:', err));
            
            return {
                allowed: false,
                backoffMs,
                message: `Too many reconnection attempts. Please wait ${Math.ceil(backoffMs / 1000)} seconds`,
            };
        }

        // Update tracking
        this.reconnectionTracking.set(hashedIp, entry);
        
        return { allowed: true };
    }

    /**
     * Resets reconnection tracking for an IP (e.g., after successful stable connection)
     * 
     * @param ipAddress - The IP address to reset
     */
    static resetReconnectionTracking(ipAddress: string): void {
        const hashedIp = SecurityService.hashIpAddress(ipAddress);
        this.reconnectionTracking.delete(hashedIp);
    }

    /**
     * Checks if system has capacity for a new connection
     * Requirement 14.2: System capacity queueing (100 concurrent users)
     * 
     * @param socketId - The socket ID attempting to connect
     * @returns Promise that resolves when connection is allowed
     */
    static async checkSystemCapacity(socketId: string, ipAddress: string): Promise<{
        allowed: boolean;
        queued: boolean;
        queuePosition?: number;
    }> {
        // Check current capacity
        if (this.activeConnections.size < this.MAX_CONCURRENT_USERS) {
            this.activeConnections.add(socketId);
            logger.info(`Connection allowed for socket ${socketId} - capacity: ${this.activeConnections.size}/${this.MAX_CONCURRENT_USERS}`);
            return { allowed: true, queued: false };
        }

        // System at capacity - queue the connection
        logger.info(`System at capacity (${this.activeConnections.size}/${this.MAX_CONCURRENT_USERS}) - queueing connection for socket ${socketId}`);
        
        return new Promise((resolve) => {
            const queueEntry: QueueEntry = {
                ipAddress,
                timestamp: Date.now(),
                resolve: (allowed) => resolve({ allowed, queued: true, queuePosition: this.connectionQueue.length }),
            };
            
            this.connectionQueue.push(queueEntry);
            
            // Set timeout for queue entry
            setTimeout(() => {
                const index = this.connectionQueue.indexOf(queueEntry);
                if (index !== -1) {
                    this.connectionQueue.splice(index, 1);
                    logger.info(`Queue timeout for socket ${socketId}`);
                    resolve({ allowed: false, queued: true });
                }
            }, this.QUEUE_TIMEOUT_MS);
        });
    }

    /**
     * Removes a connection from active tracking
     * 
     * @param socketId - The socket ID to remove
     */
    static removeConnection(socketId: string): void {
        const wasActive = this.activeConnections.delete(socketId);
        
        if (wasActive) {
            logger.info(`Connection removed for socket ${socketId} - capacity: ${this.activeConnections.size}/${this.MAX_CONCURRENT_USERS}`);
            
            // Process queue if there's capacity
            this.processQueue();
        }
    }

    /**
     * Processes the connection queue when capacity becomes available
     */
    private static processQueue(): void {
        while (this.connectionQueue.length > 0 && this.activeConnections.size < this.MAX_CONCURRENT_USERS) {
            const queueEntry = this.connectionQueue.shift();
            if (queueEntry) {
                logger.info(`Processing queued connection - queue length: ${this.connectionQueue.length}`);
                queueEntry.resolve(true);
            }
        }
    }

    /**
     * Gets current system capacity status
     * 
     * @returns Object with capacity information
     */
    static getCapacityStatus(): {
        activeConnections: number;
        maxConnections: number;
        queueLength: number;
        availableSlots: number;
    } {
        return {
            activeConnections: this.activeConnections.size,
            maxConnections: this.MAX_CONCURRENT_USERS,
            queueLength: this.connectionQueue.length,
            availableSlots: Math.max(0, this.MAX_CONCURRENT_USERS - this.activeConnections.size),
        };
    }

    /**
     * Cleans up expired reconnection tracking entries
     * Should be called periodically
     */
    static cleanupReconnectionTracking(): void {
        const now = Date.now();
        const expiredEntries: string[] = [];

        for (const [hashedIp, entry] of this.reconnectionTracking.entries()) {
            if (now - entry.lastAttempt > this.RECONNECTION_WINDOW_MS && now > entry.backoffUntil) {
                expiredEntries.push(hashedIp);
            }
        }

        for (const hashedIp of expiredEntries) {
            this.reconnectionTracking.delete(hashedIp);
        }

        if (expiredEntries.length > 0) {
            logger.debug(`Cleaned up ${expiredEntries.length} expired reconnection tracking entries`);
        }
    }

    /**
     * Gets reconnection status for an IP
     * 
     * @param ipAddress - The IP address to check
     * @returns Reconnection tracking information
     */
    static getReconnectionStatus(ipAddress: string): {
        count: number;
        lastAttempt?: Date;
        backoffUntil?: Date;
    } {
        const hashedIp = SecurityService.hashIpAddress(ipAddress);
        const entry = this.reconnectionTracking.get(hashedIp);

        if (!entry) {
            return { count: 0 };
        }

        return {
            count: entry.count,
            lastAttempt: new Date(entry.lastAttempt),
            backoffUntil: entry.backoffUntil > 0 ? new Date(entry.backoffUntil) : undefined,
        };
    }
}
