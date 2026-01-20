import { PRISMA_DB_CLIENT } from "../../prisma";
import logger from "../../config/logger";

/**
 * Cron service for automated data aggregation and cleanup
 * Run these functions on a schedule (e.g., using node-cron or external scheduler)
 */

export class AdminCronService {
    /**
     * Aggregate daily platform statistics
     * Should run once per day at midnight
     */
    async aggregateDailyPlatformStats() {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            logger.info(`Aggregating platform stats for ${yesterday.toISOString().split('T')[0]}`);

            // Get total users
            const totalUsers = await PRISMA_DB_CLIENT.user.count();

            // Get new users (registered yesterday)
            const newUsers = await PRISMA_DB_CLIENT.user.count({
                where: {
                    createdAt: {
                        gte: yesterday,
                        lt: today
                    }
                }
            });

            // Get active users (had at least one session)
            const activeUsers = await PRISMA_DB_CLIENT.studySession.groupBy({
                by: ['userId'],
                where: {
                    startTime: {
                        gte: yesterday,
                        lt: today
                    }
                }
            });

            // Get session statistics
            const sessions = await PRISMA_DB_CLIENT.studySession.findMany({
                where: {
                    startTime: {
                        gte: yesterday,
                        lt: today
                    }
                },
                select: {
                    status: true,
                    actualStudyTime: true
                }
            });

            const totalSessions = sessions.length;
            const completedSessions = sessions.filter(s => s.status === 'COMPLETED').length;
            const abandonedSessions = sessions.filter(s => s.status === 'ABANDONED').length;

            const avgSessionDuration = sessions.length > 0
                ? sessions.reduce((sum, s) => sum + (s.actualStudyTime || 0), 0) / sessions.length
                : 0;

            const totalStudyTime = sessions.reduce((sum, s) => sum + (s.actualStudyTime || 0), 0) / 60; // Convert to hours

            // Get room statistics
            const roomJoins = await PRISMA_DB_CLIENT.sessionLog.count({
                where: {
                    createdAt: {
                        gte: yesterday,
                        lt: today
                    }
                }
            });

            const failedJoins = await PRISMA_DB_CLIENT.capacityEvent.count({
                where: {
                    eventType: 'JOIN_REJECTED',
                    timestamp: {
                        gte: yesterday,
                        lt: today
                    }
                }
            });

            // Get room analytics for average occupancy
            const roomAnalytics = await PRISMA_DB_CLIENT.roomAnalytics.findMany({
                where: {
                    date: yesterday
                },
                select: {
                    avgOccupancy: true,
                    peakOccupancy: true
                }
            });

            const avgRoomOccupancy = roomAnalytics.length > 0
                ? roomAnalytics.reduce((sum, r) => sum + r.avgOccupancy, 0) / roomAnalytics.length
                : 0;

            const peakRoomOccupancy = roomAnalytics.length > 0
                ? Math.max(...roomAnalytics.map(r => r.peakOccupancy))
                : 0;

            // Get peak concurrent users (from user presence)
            const peakConcurrentUsers = await this.calculatePeakConcurrentUsers(yesterday, today);

            // Get engagement metrics
            const totalMessages = await PRISMA_DB_CLIENT.message.count({
                where: {
                    timestamp: {
                        gte: yesterday,
                        lt: today
                    }
                }
            });

            // Calculate camera/mic on rates
            const presences = await PRISMA_DB_CLIENT.userPresence.findMany({
                where: {
                    joinedAt: {
                        gte: yesterday,
                        lt: today
                    }
                },
                select: {
                    cameraOn: true,
                    micOn: true
                }
            });

            const cameraOnRate = presences.length > 0
                ? presences.filter(p => p.cameraOn).length / presences.length
                : 0;

            const micOnRate = presences.length > 0
                ? presences.filter(p => p.micOn).length / presences.length
                : 0;

            // Upsert platform stats
            await PRISMA_DB_CLIENT.platformStats.upsert({
                where: { date: yesterday },
                create: {
                    date: yesterday,
                    totalUsers,
                    newUsers,
                    activeUsers: activeUsers.length,
                    peakConcurrentUsers,
                    totalSessions,
                    completedSessions,
                    abandonedSessions,
                    avgSessionDuration,
                    totalStudyTime,
                    totalRoomJoins: roomJoins,
                    failedJoins,
                    avgRoomOccupancy,
                    peakRoomOccupancy,
                    totalMessages,
                    cameraOnRate,
                    micOnRate
                },
                update: {
                    totalUsers,
                    newUsers,
                    activeUsers: activeUsers.length,
                    peakConcurrentUsers,
                    totalSessions,
                    completedSessions,
                    abandonedSessions,
                    avgSessionDuration,
                    totalStudyTime,
                    totalRoomJoins: roomJoins,
                    failedJoins,
                    avgRoomOccupancy,
                    peakRoomOccupancy,
                    totalMessages,
                    cameraOnRate,
                    micOnRate
                }
            });

            logger.info(`Platform stats aggregated successfully for ${yesterday.toISOString().split('T')[0]}`);
        } catch (error) {
            logger.error('Error aggregating platform stats:', error);
            throw error;
        }
    }

    /**
     * Aggregate daily room analytics
     * Should run once per day at midnight
     */
    async aggregateDailyRoomAnalytics() {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            logger.info(`Aggregating room analytics for ${yesterday.toISOString().split('T')[0]}`);

            // Get all rooms
            const rooms = await PRISMA_DB_CLIENT.room.findMany({
                select: { id: true }
            });

            for (const room of rooms) {
                // Get session logs for this room
                const sessionLogs = await PRISMA_DB_CLIENT.sessionLog.findMany({
                    where: {
                        roomId: room.id,
                        createdAt: {
                            gte: yesterday,
                            lt: today
                        }
                    },
                    select: {
                        duration: true
                    }
                });

                const totalJoins = sessionLogs.length;

                // Get failed joins
                const failedJoins = await PRISMA_DB_CLIENT.capacityEvent.count({
                    where: {
                        roomId: room.id,
                        eventType: 'JOIN_REJECTED',
                        timestamp: {
                            gte: yesterday,
                            lt: today
                        }
                    }
                });

                // Calculate peak and average occupancy
                const { peakOccupancy, avgOccupancy } = await this.calculateRoomOccupancy(
                    room.id,
                    yesterday,
                    today
                );

                // Calculate time at capacity
                const timeAtCapacity = await this.calculateTimeAtCapacity(
                    room.id,
                    yesterday,
                    today
                );

                // Get message count
                const totalMessages = await PRISMA_DB_CLIENT.message.count({
                    where: {
                        roomId: room.id,
                        timestamp: {
                            gte: yesterday,
                            lt: today
                        }
                    }
                });

                // Calculate average time per user
                const avgTimePerUser = totalJoins > 0
                    ? sessionLogs.reduce((sum, log) => sum + log.duration, 0) / totalJoins / 60 // Convert to minutes
                    : 0;

                const totalSessionTime = sessionLogs.reduce((sum, log) => sum + log.duration, 0) / 3600; // Convert to hours

                const avgMessagesPerUser = totalJoins > 0 ? totalMessages / totalJoins : 0;

                // Upsert room analytics
                await PRISMA_DB_CLIENT.roomAnalytics.upsert({
                    where: {
                        roomId_date: {
                            roomId: room.id,
                            date: yesterday
                        }
                    },
                    create: {
                        roomId: room.id,
                        date: yesterday,
                        totalJoins,
                        totalLeaves: totalJoins, // Assuming all who joined also left
                        failedJoins,
                        peakOccupancy,
                        avgOccupancy,
                        timeAtCapacity,
                        avgTimePerUser,
                        totalSessionTime,
                        totalMessages,
                        avgMessagesPerUser
                    },
                    update: {
                        totalJoins,
                        totalLeaves: totalJoins,
                        failedJoins,
                        peakOccupancy,
                        avgOccupancy,
                        timeAtCapacity,
                        avgTimePerUser,
                        totalSessionTime,
                        totalMessages,
                        avgMessagesPerUser
                    }
                });
            }

            logger.info(`Room analytics aggregated successfully for ${yesterday.toISOString().split('T')[0]}`);
        } catch (error) {
            logger.error('Error aggregating room analytics:', error);
            throw error;
        }
    }

    /**
     * Update room states based on current activity
     * Should run every 5 minutes
     */
    async updateRoomStates() {
        try {
            const rooms = await PRISMA_DB_CLIENT.room.findMany({
                include: {
                    presences: {
                        where: {
                            lastActivityAt: {
                                gte: new Date(Date.now() - 5 * 60 * 1000) // Active in last 5 min
                            }
                        }
                    }
                }
            });

            for (const room of rooms) {
                const currentOccupancy = room.presences.length;

                // Get message count in last 24h
                const messagesLast24h = await PRISMA_DB_CLIENT.message.count({
                    where: {
                        roomId: room.id,
                        timestamp: {
                            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
                        }
                    }
                });

                // Get joins in last 24h
                const joinsLast24h = await PRISMA_DB_CLIENT.sessionLog.count({
                    where: {
                        roomId: room.id,
                        createdAt: {
                            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
                        }
                    }
                });

                // Update or create room state
                await PRISMA_DB_CLIENT.roomState.upsert({
                    where: { roomId: room.id },
                    create: {
                        roomId: room.id,
                        currentOccupancy,
                        activeUsers: room.presences.map(p => p.userId),
                        messagesLast24h,
                        joinsLast24h,
                        lastActivityAt: new Date()
                    },
                    update: {
                        currentOccupancy,
                        activeUsers: room.presences.map(p => p.userId),
                        messagesLast24h,
                        joinsLast24h,
                        lastActivityAt: new Date()
                    }
                });

                // Update room occupancy
                await PRISMA_DB_CLIENT.room.update({
                    where: { id: room.id },
                    data: { currentOccupancy }
                });
            }

            logger.info('Room states updated successfully');
        } catch (error) {
            logger.error('Error updating room states:', error);
            throw error;
        }
    }

    /**
     * Expire temporary moderation actions
     * Should run every hour
     */
    async expireModerationActions() {
        try {
            const now = new Date();

            const result = await PRISMA_DB_CLIENT.moderationAction.updateMany({
                where: {
                    isActive: true,
                    expiresAt: {
                        lte: now
                    }
                },
                data: {
                    isActive: false
                }
            });

            if (result.count > 0) {
                logger.info(`Expired ${result.count} moderation actions`);
            }
        } catch (error) {
            logger.error('Error expiring moderation actions:', error);
            throw error;
        }
    }

    /**
     * Record system metrics
     * Should run every 5 minutes
     */
    async recordSystemMetrics() {
        try {
            // Get active connections
            const activeSocketConnections = await PRISMA_DB_CLIENT.userPresence.count({
                where: {
                    lastActivityAt: {
                        gte: new Date(Date.now() - 5 * 60 * 1000)
                    }
                }
            });

            // For now, we'll use placeholder values for other metrics
            // In production, these would come from actual monitoring
            await PRISMA_DB_CLIENT.systemMetrics.create({
                data: {
                    activeSocketConnections,
                    failedConnections: 0, // Would be tracked by socket server
                    avgApiResponseTime: 0, // Would be tracked by middleware
                    errorRate4xx: 0, // Would be tracked by middleware
                    errorRate5xx: 0, // Would be tracked by middleware
                    timerDesyncEvents: 0 // Would be tracked by timer service
                }
            });

            logger.info('System metrics recorded');
        } catch (error) {
            logger.error('Error recording system metrics:', error);
            throw error;
        }
    }

    /**
     * Cleanup old data
     * Should run once per day
     */
    async cleanupOldData() {
        try {
            const retentionDays = 90; // Keep data for 90 days
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

            // Delete old system metrics
            const metricsDeleted = await PRISMA_DB_CLIENT.systemMetrics.deleteMany({
                where: {
                    timestamp: {
                        lt: cutoffDate
                    }
                }
            });

            // Delete old capacity events
            const eventsDeleted = await PRISMA_DB_CLIENT.capacityEvent.deleteMany({
                where: {
                    timestamp: {
                        lt: cutoffDate
                    }
                }
            });

            logger.info(`Cleanup completed: ${metricsDeleted.count} metrics, ${eventsDeleted.count} events deleted`);
        } catch (error) {
            logger.error('Error cleaning up old data:', error);
            throw error;
        }
    }

    // ============================================
    // HELPER METHODS
    // ============================================

    private async calculatePeakConcurrentUsers(startDate: Date, endDate: Date): Promise<number> {
        // This is a simplified calculation
        // In production, you'd track this in real-time
        const presences = await PRISMA_DB_CLIENT.userPresence.groupBy({
            by: ['joinedAt'],
            where: {
                joinedAt: {
                    gte: startDate,
                    lt: endDate
                }
            },
            _count: { id: true }
        });

        return presences.length > 0
            ? Math.max(...presences.map(p => p._count.id))
            : 0;
    }

    private async calculateRoomOccupancy(roomId: string, startDate: Date, endDate: Date) {
        // Simplified calculation based on session logs
        const logs = await PRISMA_DB_CLIENT.sessionLog.findMany({
            where: {
                roomId,
                createdAt: {
                    gte: startDate,
                    lt: endDate
                }
            }
        });

        // Group by hour to estimate occupancy
        const hourlyOccupancy = new Map<number, number>();

        logs.forEach(log => {
            const hour = log.createdAt.getHours();
            hourlyOccupancy.set(hour, (hourlyOccupancy.get(hour) || 0) + 1);
        });

        const occupancies = Array.from(hourlyOccupancy.values());

        return {
            peakOccupancy: occupancies.length > 0 ? Math.max(...occupancies) : 0,
            avgOccupancy: occupancies.length > 0
                ? occupancies.reduce((a, b) => a + b, 0) / occupancies.length
                : 0
        };
    }

    private async calculateTimeAtCapacity(roomId: string, startDate: Date, endDate: Date): Promise<number> {
        const events = await PRISMA_DB_CLIENT.capacityEvent.findMany({
            where: {
                roomId,
                eventType: 'CAPACITY_REACHED',
                timestamp: {
                    gte: startDate,
                    lt: endDate
                }
            },
            select: {
                duration: true
            }
        });

        return events.reduce((sum, event) => sum + (event.duration || 0), 0) / 60; // Convert to minutes
    }
}

export const adminCronService = new AdminCronService();

// Example: How to schedule these jobs (using node-cron or similar)
/*
import cron from 'node-cron';

// Run daily at midnight
cron.schedule('0 0 * * *', async () => {
    await adminCronService.aggregateDailyPlatformStats();
    await adminCronService.aggregateDailyRoomAnalytics();
    await adminCronService.cleanupOldData();
});

// Run every 5 minutes
cron.schedule('*\/5 * * * *', async () => {
    await adminCronService.updateRoomStates();
    await adminCronService.recordSystemMetrics();
});

// Run every hour
cron.schedule('0 * * * *', async () => {
    await adminCronService.expireModerationActions();
});
*/
