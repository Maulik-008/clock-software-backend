// @ts-nocheck
import { PRISMA_DB_CLIENT } from "../../prisma";
import { Prisma } from "../../prisma/src/generated";
import logger from "../../config/logger";

export class AdminService {
    // ============================================
    // 1. GLOBAL PLATFORM ANALYTICS
    // ============================================

    async getPlatformSummary() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [
            totalUsers,
            onlineUsers,
            todayStats,
            weekStats,
            activeRooms,
            peakConcurrent
        ] = await Promise.all([
            // Total registered users
            PRISMA_DB_CLIENT.user.count(),

            // Currently online users (in any room)
            PRISMA_DB_CLIENT.userPresence.count({
                where: {
                    lastActivityAt: {
                        gte: new Date(Date.now() - 5 * 60 * 1000) // Active in last 5 min
                    }
                }
            }),

            // Today's stats
            PRISMA_DB_CLIENT.platformStats.findUnique({
                where: { date: today }
            }),

            // Last 7 days stats
            PRISMA_DB_CLIENT.platformStats.findMany({
                where: {
                    date: {
                        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                    }
                },
                orderBy: { date: 'desc' }
            }),

            // Active rooms count
            PRISMA_DB_CLIENT.room.count({
                where: {
                    currentOccupancy: { gt: 0 }
                }
            }),

            // Peak concurrent users today
            PRISMA_DB_CLIENT.platformStats.findUnique({
                where: { date: today },
                select: { peakConcurrentUsers: true }
            })
        ]);

        // Calculate weekly aggregates
        const weeklyActiveUsers = weekStats.reduce((sum, stat) => sum + stat.activeUsers, 0);
        const weeklyTotalSessions = weekStats.reduce((sum, stat) => sum + stat.totalSessions, 0);
        const weeklyAvgDuration = weekStats.length > 0
            ? weekStats.reduce((sum, stat) => sum + stat.avgSessionDuration, 0) / weekStats.length
            : 0;

        return {
            users: {
                total: totalUsers,
                online: onlineUsers,
                dailyActive: todayStats?.activeUsers || 0,
                weeklyActive: weeklyActiveUsers
            },
            sessions: {
                today: todayStats?.totalSessions || 0,
                week: weeklyTotalSessions,
                avgDuration: todayStats?.avgSessionDuration || 0,
                weeklyAvgDuration: Math.round(weeklyAvgDuration)
            },
            rooms: {
                active: activeRooms,
                total: 10 // Fixed for now
            },
            peak: {
                concurrentUsers: peakConcurrent?.peakConcurrentUsers || 0
            }
        };
    }

    async getPlatformTrends(days: number = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

        const stats = await PRISMA_DB_CLIENT.platformStats.findMany({
            where: {
                date: { gte: startDate }
            },
            orderBy: { date: 'asc' }
        });

        return stats.map(stat => ({
            date: stat.date,
            users: {
                total: stat.totalUsers,
                new: stat.newUsers,
                active: stat.activeUsers,
                peakConcurrent: stat.peakConcurrentUsers
            },
            sessions: {
                total: stat.totalSessions,
                completed: stat.completedSessions,
                abandoned: stat.abandonedSessions,
                avgDuration: stat.avgSessionDuration
            },
            rooms: {
                totalJoins: stat.totalRoomJoins,
                failedJoins: stat.failedJoins,
                avgOccupancy: stat.avgRoomOccupancy
            },
            engagement: {
                messages: stat.totalMessages,
                cameraOnRate: stat.cameraOnRate,
                micOnRate: stat.micOnRate
            }
        }));
    }

    // ============================================
    // 2. ROOM-LEVEL ANALYTICS
    // ============================================

    async getRoomAnalytics(roomId: string, days: number = 7) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

        const analytics = await PRISMA_DB_CLIENT.roomAnalytics.findMany({
            where: {
                roomId,
                date: { gte: startDate }
            },
            orderBy: { date: 'asc' }
        });

        // Calculate aggregates
        const totals = analytics.reduce((acc, day) => ({
            totalJoins: acc.totalJoins + day.totalJoins,
            failedJoins: acc.failedJoins + day.failedJoins,
            peakOccupancy: Math.max(acc.peakOccupancy, day.peakOccupancy),
            totalMessages: acc.totalMessages + day.totalMessages,
            timeAtCapacity: acc.timeAtCapacity + day.timeAtCapacity
        }), {
            totalJoins: 0,
            failedJoins: 0,
            peakOccupancy: 0,
            totalMessages: 0,
            timeAtCapacity: 0
        });

        const avgOccupancy = analytics.length > 0
            ? analytics.reduce((sum, day) => sum + day.avgOccupancy, 0) / analytics.length
            : 0;

        return {
            roomId,
            period: { days, startDate },
            summary: {
                ...totals,
                avgOccupancy: Math.round(avgOccupancy * 10) / 10,
                failureRate: totals.totalJoins > 0
                    ? Math.round((totals.failedJoins / totals.totalJoins) * 100 * 10) / 10
                    : 0
            },
            daily: analytics.map(day => ({
                date: day.date,
                joins: day.totalJoins,
                failedJoins: day.failedJoins,
                peakOccupancy: day.peakOccupancy,
                avgOccupancy: day.avgOccupancy,
                messages: day.totalMessages,
                timeAtCapacity: day.timeAtCapacity
            }))
        };
    }

    async getAllRoomsAnalytics(days: number = 1) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

        const rooms = await PRISMA_DB_CLIENT.room.findMany({
            include: {
                analytics: {
                    where: {
                        date: { gte: startDate }
                    }
                },
                state: true
            }
        });

        return rooms.map(room => {
            const analytics = room.analytics;
            const totals = analytics.reduce((acc, day) => ({
                totalJoins: acc.totalJoins + day.totalJoins,
                failedJoins: acc.failedJoins + day.failedJoins,
                peakOccupancy: Math.max(acc.peakOccupancy, day.peakOccupancy)
            }), { totalJoins: 0, failedJoins: 0, peakOccupancy: 0 });

            return {
                roomId: room.id,
                name: room.name,
                currentOccupancy: room.currentOccupancy,
                isLocked: room.isLocked,
                ...totals,
                lastActivity: room.state?.lastActivityAt
            };
        });
    }

    // ============================================
    // 3. LIVE ROOM MONITORING
    // ============================================

    async getLiveRoomMonitoring() {
        const rooms = await PRISMA_DB_CLIENT.room.findMany({
            where: {
                currentOccupancy: { gt: 0 }
            },
            include: {
                state: true,
                presences: {
                    where: {
                        lastActivityAt: {
                            gte: new Date(Date.now() - 5 * 60 * 1000) // Active in last 5 min
                        }
                    },
                    include: {
                        user: {
                            select: {
                                id: true,
                                email: true,
                                firstName: true,
                                lastName: true
                            }
                        }
                    }
                }
            }
        });

        return rooms.map(room => ({
            roomId: room.id,
            name: room.name,
            occupancy: room.currentOccupancy,
            capacity: room.capacity,
            isLocked: room.isLocked,
            timer: room.state ? {
                active: room.state.timerActive,
                startedAt: room.state.timerStartedAt,
                duration: room.state.timerDuration,
                pausedAt: room.state.timerPausedAt
            } : null,
            users: room.presences.map(p => ({
                userId: p.userId,
                email: p.user.email,
                name: `${p.user.firstName || ''} ${p.user.lastName || ''}`.trim(),
                joinedAt: p.joinedAt,
                cameraOn: p.cameraOn,
                micOn: p.micOn,
                lastActivity: p.lastActivityAt
            })),
            activity: {
                messagesLast24h: room.state?.messagesLast24h || 0,
                joinsLast24h: room.state?.joinsLast24h || 0,
                lastActivityAt: room.state?.lastActivityAt
            }
        }));
    }

    async getRoomDetails(roomId: string) {
        const room = await PRISMA_DB_CLIENT.room.findUnique({
            where: { id: roomId },
            include: {
                state: true,
                presences: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                email: true,
                                firstName: true,
                                lastName: true,
                                role: true
                            }
                        }
                    }
                }
            }
        });

        if (!room) {
            throw new Error("Room not found");
        }

        return {
            roomId: room.id,
            name: room.name,
            occupancy: room.currentOccupancy,
            capacity: room.capacity,
            isLocked: room.isLocked,
            createdAt: room.createdAt,
            timer: room.state ? {
                active: room.state.timerActive,
                startedAt: room.state.timerStartedAt,
                duration: room.state.timerDuration,
                pausedAt: room.state.timerPausedAt
            } : null,
            users: room.presences.map(p => ({
                userId: p.userId,
                email: p.user.email,
                name: `${p.user.firstName || ''} ${p.user.lastName || ''}`.trim(),
                role: p.user.role,
                joinedAt: p.joinedAt,
                socketId: p.socketId,
                cameraOn: p.cameraOn,
                micOn: p.micOn,
                lastActivity: p.lastActivityAt
            }))
        };
    }

    // ============================================
    // 4. CAPACITY & LOAD HISTORY
    // ============================================

    async getCapacityHistory(roomId?: string, days: number = 7) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const where: Prisma.CapacityEventWhereInput = {
            timestamp: { gte: startDate }
        };

        if (roomId) {
            where.roomId = roomId;
        }

        const events = await PRISMA_DB_CLIENT.capacityEvent.findMany({
            where,
            include: {
                room: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
            orderBy: { timestamp: 'desc' },
            take: 100
        });

        // Group by room and event type
        const summary = events.reduce((acc, event) => {
            const key = event.roomId;
            if (!acc[key]) {
                acc[key] = {
                    roomId: event.roomId,
                    roomName: event.room.name,
                    capacityReached: 0,
                    joinRejected: 0,
                    totalTimeAtCapacity: 0
                };
            }

            if (event.eventType === 'CAPACITY_REACHED') {
                acc[key].capacityReached++;
                acc[key].totalTimeAtCapacity += event.duration || 0;
            } else if (event.eventType === 'JOIN_REJECTED') {
                acc[key].joinRejected++;
            }

            return acc;
        }, {} as Record<string, any>);

        return {
            period: { days, startDate },
            summary: Object.values(summary),
            events: events.map(e => ({
                roomId: e.roomId,
                roomName: e.room.name,
                eventType: e.eventType,
                occupancy: e.occupancyAtEvent,
                timestamp: e.timestamp,
                duration: e.duration
            }))
        };
    }

    async getPeakUsageSlots(days: number = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Get all capacity events
        const events = await PRISMA_DB_CLIENT.capacityEvent.findMany({
            where: {
                timestamp: { gte: startDate },
                eventType: 'CAPACITY_REACHED'
            },
            select: {
                timestamp: true,
                roomId: true
            }
        });

        // Group by hour of day
        const hourlyDistribution = events.reduce((acc, event) => {
            const hour = event.timestamp.getHours();
            acc[hour] = (acc[hour] || 0) + 1;
            return acc;
        }, {} as Record<number, number>);

        // Group by day of week
        const dayDistribution = events.reduce((acc, event) => {
            const day = event.timestamp.getDay();
            acc[day] = (acc[day] || 0) + 1;
            return acc;
        }, {} as Record<number, number>);

        return {
            hourlyDistribution: Object.entries(hourlyDistribution)
                .map(([hour, count]) => ({ hour: parseInt(hour), count }))
                .sort((a, b) => b.count - a.count),
            dayDistribution: Object.entries(dayDistribution)
                .map(([day, count]) => ({ day: parseInt(day), count }))
                .sort((a, b) => b.count - a.count),
            peakHour: Object.entries(hourlyDistribution)
                .sort(([, a], [, b]) => b - a)[0]?.[0] || 0,
            peakDay: Object.entries(dayDistribution)
                .sort(([, a], [, b]) => b - a)[0]?.[0] || 0
        };
    }

    // ============================================
    // 5. USER ENGAGEMENT ANALYTICS
    // ============================================

    async getUserEngagementMetrics(days: number = 7) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const [
            sessionStats,
            presenceStats,
            messageStats
        ] = await Promise.all([
            // Session statistics
            PRISMA_DB_CLIENT.studySession.groupBy({
                by: ['userId'],
                where: {
                    startTime: { gte: startDate }
                },
                _count: { id: true },
                _avg: { actualStudyTime: true }
            }),

            // Presence statistics (camera/mic usage)
            PRISMA_DB_CLIENT.userPresence.groupBy({
                by: ['userId'],
                where: {
                    joinedAt: { gte: startDate }
                },
                _count: { id: true },
                _avg: { cameraOn: true, micOn: true }
            }),

            // Message statistics
            PRISMA_DB_CLIENT.message.groupBy({
                by: ['userId'],
                where: {
                    timestamp: { gte: startDate }
                },
                _count: { id: true }
            })
        ]);

        // Calculate distributions
        const sessionsPerUser = sessionStats.map(s => s._count.id);
        const avgSessionsPerUser = sessionsPerUser.length > 0
            ? sessionsPerUser.reduce((a, b) => a + b, 0) / sessionsPerUser.length
            : 0;

        const avgTimePerSession = sessionStats.length > 0
            ? sessionStats.reduce((sum, s) => sum + (s._avg.actualStudyTime || 0), 0) / sessionStats.length
            : 0;

        const cameraOnRate = presenceStats.length > 0
            ? presenceStats.reduce((sum, p) => sum + (p._avg.cameraOn || 0), 0) / presenceStats.length
            : 0;

        const micOnRate = presenceStats.length > 0
            ? presenceStats.reduce((sum, p) => sum + (p._avg.micOn || 0), 0) / presenceStats.length
            : 0;

        const messagesPerUser = messageStats.map(m => m._count.id);
        const avgMessagesPerUser = messagesPerUser.length > 0
            ? messagesPerUser.reduce((a, b) => a + b, 0) / messagesPerUser.length
            : 0;

        return {
            period: { days, startDate },
            sessions: {
                avgPerUser: Math.round(avgSessionsPerUser * 10) / 10,
                avgDuration: Math.round(avgTimePerSession),
                totalUsers: sessionStats.length
            },
            media: {
                cameraOnRate: Math.round(cameraOnRate * 100 * 10) / 10,
                micOnRate: Math.round(micOnRate * 100 * 10) / 10
            },
            chat: {
                avgMessagesPerUser: Math.round(avgMessagesPerUser * 10) / 10,
                activeUsers: messageStats.length
            },
            distribution: {
                sessionsPerUser: this.calculateDistribution(sessionsPerUser),
                messagesPerUser: this.calculateDistribution(messagesPerUser)
            }
        };
    }

    private calculateDistribution(values: number[]) {
        if (values.length === 0) return { min: 0, max: 0, median: 0, p90: 0 };

        const sorted = values.sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const p90 = sorted[Math.floor(sorted.length * 0.9)];

        return {
            min: sorted[0],
            max: sorted[sorted.length - 1],
            median,
            p90
        };
    }

    // ============================================
    // 6. STUDY SESSION QUALITY METRICS
    // ============================================

    async getSessionQualityMetrics(days: number = 7) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const sessions = await PRISMA_DB_CLIENT.studySession.findMany({
            where: {
                startTime: { gte: startDate }
            },
            select: {
                status: true,
                plannedDuration: true,
                actualStudyTime: true,
                pauseCount: true,
                totalPausedTime: true
            }
        });

        const total = sessions.length;
        const completed = sessions.filter(s => s.status === 'COMPLETED').length;
        const abandoned = sessions.filter(s => s.status === 'ABANDONED').length;
        const expired = sessions.filter(s => s.status === 'EXPIRED').length;

        const completionRate = total > 0 ? (completed / total) * 100 : 0;
        const abandonmentRate = total > 0 ? (abandoned / total) * 100 : 0;

        const avgPauseCount = total > 0
            ? sessions.reduce((sum, s) => sum + s.pauseCount, 0) / total
            : 0;

        const avgPausedTime = total > 0
            ? sessions.reduce((sum, s) => sum + s.totalPausedTime, 0) / total / 60 // Convert to minutes
            : 0;

        // Calculate duration accuracy (actual vs planned)
        const durationAccuracy = sessions
            .filter(s => s.actualStudyTime && s.plannedDuration)
            .map(s => {
                const planned = s.plannedDuration;
                const actual = s.actualStudyTime!;
                return (actual / planned) * 100;
            });

        const avgDurationAccuracy = durationAccuracy.length > 0
            ? durationAccuracy.reduce((a, b) => a + b, 0) / durationAccuracy.length
            : 0;

        return {
            period: { days, startDate },
            overview: {
                totalSessions: total,
                completed,
                abandoned,
                expired,
                completionRate: Math.round(completionRate * 10) / 10,
                abandonmentRate: Math.round(abandonmentRate * 10) / 10
            },
            quality: {
                avgPauseCount: Math.round(avgPauseCount * 10) / 10,
                avgPausedTime: Math.round(avgPausedTime * 10) / 10,
                durationAccuracy: Math.round(avgDurationAccuracy * 10) / 10
            }
        };
    }

    // ============================================
    // 7. MODERATION & SAFETY DASHBOARD
    // ============================================

    async getModerationDashboard(days: number = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const [
            recentActions,
            activeMutes,
            activeBans,
            actionsByType,
            repeatOffenders
        ] = await Promise.all([
            // Recent moderation actions
            PRISMA_DB_CLIENT.moderationAction.findMany({
                where: {
                    performedAt: { gte: startDate }
                },
                include: {
                    targetUser: {
                        select: {
                            id: true,
                            email: true,
                            firstName: true,
                            lastName: true
                        }
                    },
                    admin: {
                        select: {
                            id: true,
                            email: true,
                            firstName: true,
                            lastName: true
                        }
                    },
                    room: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                },
                orderBy: { performedAt: 'desc' },
                take: 50
            }),

            // Currently muted users
            PRISMA_DB_CLIENT.moderationAction.findMany({
                where: {
                    actionType: 'MUTE',
                    isActive: true,
                    OR: [
                        { expiresAt: null },
                        { expiresAt: { gt: new Date() } }
                    ]
                },
                include: {
                    targetUser: {
                        select: {
                            id: true,
                            email: true,
                            firstName: true,
                            lastName: true
                        }
                    },
                    room: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            }),

            // Currently banned users
            PRISMA_DB_CLIENT.moderationAction.findMany({
                where: {
                    actionType: 'BAN',
                    isActive: true,
                    OR: [
                        { expiresAt: null },
                        { expiresAt: { gt: new Date() } }
                    ]
                },
                include: {
                    targetUser: {
                        select: {
                            id: true,
                            email: true,
                            firstName: true,
                            lastName: true
                        }
                    }
                }
            }),

            // Actions by type
            PRISMA_DB_CLIENT.moderationAction.groupBy({
                by: ['actionType'],
                where: {
                    performedAt: { gte: startDate }
                },
                _count: { id: true }
            }),

            // Repeat offenders (users with multiple actions)
            PRISMA_DB_CLIENT.moderationAction.groupBy({
                by: ['targetUserId'],
                where: {
                    performedAt: { gte: startDate },
                    actionType: { in: ['MUTE', 'KICK', 'BAN', 'WARN'] }
                },
                _count: { id: true },
                having: {
                    id: {
                        _count: {
                            gt: 1
                        }
                    }
                }
            })
        ]);

        return {
            period: { days, startDate },
            summary: {
                totalActions: recentActions.length,
                activeMutes: activeMutes.length,
                activeBans: activeBans.length,
                repeatOffenders: repeatOffenders.length
            },
            actionsByType: actionsByType.map(a => ({
                type: a.actionType,
                count: a._count.id
            })),
            recentActions: recentActions.map(a => ({
                id: a.id,
                type: a.actionType,
                targetUser: {
                    id: a.targetUser.id,
                    email: a.targetUser.email,
                    name: `${a.targetUser.firstName || ''} ${a.targetUser.lastName || ''}`.trim()
                },
                room: a.room ? {
                    id: a.room.id,
                    name: a.room.name
                } : null,
                reason: a.reason,
                performedBy: {
                    id: a.admin.id,
                    email: a.admin.email,
                    name: `${a.admin.firstName || ''} ${a.admin.lastName || ''}`.trim()
                },
                performedAt: a.performedAt,
                expiresAt: a.expiresAt,
                isActive: a.isActive
            })),
            activeMutes: activeMutes.map(m => ({
                userId: m.targetUser.id,
                email: m.targetUser.email,
                name: `${m.targetUser.firstName || ''} ${m.targetUser.lastName || ''}`.trim(),
                room: m.room ? {
                    id: m.room.id,
                    name: m.room.name
                } : null,
                mutedAt: m.performedAt,
                expiresAt: m.expiresAt
            })),
            activeBans: activeBans.map(b => ({
                userId: b.targetUser.id,
                email: b.targetUser.email,
                name: `${b.targetUser.firstName || ''} ${b.targetUser.lastName || ''}`.trim(),
                bannedAt: b.performedAt,
                expiresAt: b.expiresAt,
                reason: b.reason
            }))
        };
    }

    async getModerationHistory(userId: number) {
        const actions = await PRISMA_DB_CLIENT.moderationAction.findMany({
            where: { targetUserId: userId },
            include: {
                admin: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true
                    }
                },
                room: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
            orderBy: { performedAt: 'desc' }
        });

        return actions.map(a => ({
            id: a.id,
            type: a.actionType,
            reason: a.reason,
            room: a.room ? {
                id: a.room.id,
                name: a.room.name
            } : null,
            performedBy: {
                id: a.admin.id,
                email: a.admin.email,
                name: `${a.admin.firstName || ''} ${a.admin.lastName || ''}`.trim()
            },
            performedAt: a.performedAt,
            expiresAt: a.expiresAt,
            isActive: a.isActive,
            revokedAt: a.revokedAt
        }));
    }

    // ============================================
    // 8. CHAT & INTERACTION STATISTICS
    // ============================================

    async getChatStatistics(roomId?: string, days: number = 7) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const where: Prisma.MessageWhereInput = {
            timestamp: { gte: startDate }
        };

        if (roomId) {
            where.roomId = roomId;
        }

        const [
            totalMessages,
            messagesByRoom,
            messagesByType,
            topChatters
        ] = await Promise.all([
            // Total messages
            PRISMA_DB_CLIENT.message.count({ where }),

            // Messages by room
            PRISMA_DB_CLIENT.message.groupBy({
                by: ['roomId'],
                where,
                _count: { id: true }
            }),

            // Messages by type
            PRISMA_DB_CLIENT.message.groupBy({
                by: ['type'],
                where,
                _count: { id: true }
            }),

            // Top chatters
            PRISMA_DB_CLIENT.message.groupBy({
                by: ['userId'],
                where,
                _count: { id: true },
                orderBy: {
                    _count: {
                        id: 'desc'
                    }
                },
                take: 10
            })
        ]);

        // Get room names
        const roomIds = messagesByRoom.map(m => m.roomId);
        const rooms = await PRISMA_DB_CLIENT.room.findMany({
            where: { id: { in: roomIds } },
            select: { id: true, name: true }
        });

        const roomMap = new Map(rooms.map(r => [r.id, r.name]));

        return {
            period: { days, startDate },
            summary: {
                totalMessages,
                avgPerDay: Math.round(totalMessages / days)
            },
            byRoom: messagesByRoom.map(m => ({
                roomId: m.roomId,
                roomName: roomMap.get(m.roomId) || 'Unknown',
                count: m._count.id
            })).sort((a, b) => b.count - a.count),
            byType: messagesByType.map(m => ({
                type: m.type,
                count: m._count.id
            })),
            topChatters: topChatters.map(m => ({
                userId: m.userId,
                messageCount: m._count.id
            }))
        };
    }

    // ============================================
    // 9. SYSTEM HEALTH & PERFORMANCE
    // ============================================

    async getSystemHealth() {
        const now = new Date();
        const last5Min = new Date(now.getTime() - 5 * 60 * 1000);
        const last1Hour = new Date(now.getTime() - 60 * 60 * 1000);

        const [
            activeConnections,
            recentMetrics,
            errorRates
        ] = await Promise.all([
            // Active socket connections (approximated by active presences)
            PRISMA_DB_CLIENT.userPresence.count({
                where: {
                    lastActivityAt: { gte: last5Min }
                }
            }),

            // Recent system metrics
            PRISMA_DB_CLIENT.systemMetrics.findMany({
                where: {
                    timestamp: { gte: last1Hour }
                },
                orderBy: { timestamp: 'desc' },
                take: 12 // Last hour in 5-min intervals
            }),

            // Calculate error rates from recent metrics
            PRISMA_DB_CLIENT.systemMetrics.aggregate({
                where: {
                    timestamp: { gte: last1Hour }
                },
                _avg: {
                    errorRate4xx: true,
                    errorRate5xx: true,
                    avgApiResponseTime: true
                }
            })
        ]);

        const latestMetric = recentMetrics[0];

        return {
            timestamp: now,
            connections: {
                active: activeConnections,
                failed: latestMetric?.failedConnections || 0
            },
            performance: {
                avgResponseTime: Math.round(errorRates._avg.avgApiResponseTime || 0),
                errorRate4xx: Math.round((errorRates._avg.errorRate4xx || 0) * 10) / 10,
                errorRate5xx: Math.round((errorRates._avg.errorRate5xx || 0) * 10) / 10
            },
            issues: {
                timerDesyncEvents: latestMetric?.timerDesyncEvents || 0
            },
            history: recentMetrics.map(m => ({
                timestamp: m.timestamp,
                connections: m.activeSocketConnections,
                responseTime: m.avgApiResponseTime,
                errors: {
                    rate4xx: m.errorRate4xx,
                    rate5xx: m.errorRate5xx
                }
            }))
        };
    }

    async getSystemAlerts() {
        const alerts: Array<{
            severity: 'critical' | 'warning' | 'info';
            message: string;
            timestamp: Date;
        }> = [];

        // Check for rooms at capacity
        const fullRooms = await PRISMA_DB_CLIENT.room.count({
            where: { currentOccupancy: { gte: 50 } }
        });

        if (fullRooms > 0) {
            alerts.push({
                severity: 'warning',
                message: `${fullRooms} room(s) at maximum capacity`,
                timestamp: new Date()
            });
        }

        // Check for high error rates
        const recentMetrics = await PRISMA_DB_CLIENT.systemMetrics.findFirst({
            where: {
                timestamp: { gte: new Date(Date.now() - 5 * 60 * 1000) }
            },
            orderBy: { timestamp: 'desc' }
        });

        if (recentMetrics) {
            if (recentMetrics.errorRate5xx > 5) {
                alerts.push({
                    severity: 'critical',
                    message: `High server error rate: ${recentMetrics.errorRate5xx}%`,
                    timestamp: recentMetrics.timestamp
                });
            }

            if (recentMetrics.failedConnections > 10) {
                alerts.push({
                    severity: 'warning',
                    message: `${recentMetrics.failedConnections} failed socket connections`,
                    timestamp: recentMetrics.timestamp
                });
            }

            if (recentMetrics.timerDesyncEvents > 0) {
                alerts.push({
                    severity: 'warning',
                    message: `${recentMetrics.timerDesyncEvents} timer desynchronization events`,
                    timestamp: recentMetrics.timestamp
                });
            }
        }

        return alerts;
    }

    // ============================================
    // 10. ADMIN CONTROLS & OVERRIDES
    // ============================================

    async lockRoom(roomId: string, adminId: number, reason?: string) {
        const room = await PRISMA_DB_CLIENT.room.update({
            where: { id: roomId },
            data: { isLocked: true }
        });

        // Log the action
        await this.logAuditAction({
            userId: adminId,
            action: 'ROOM_LOCKED',
            resource: 'room',
            resourceId: roomId,
            description: `Room ${room.name} locked${reason ? `: ${reason}` : ''}`,
            metadata: { reason }
        });

        return room;
    }

    async unlockRoom(roomId: string, adminId: number) {
        const room = await PRISMA_DB_CLIENT.room.update({
            where: { id: roomId },
            data: { isLocked: false }
        });

        await this.logAuditAction({
            userId: adminId,
            action: 'ROOM_UNLOCKED',
            resource: 'room',
            resourceId: roomId,
            description: `Room ${room.name} unlocked`
        });

        return room;
    }

    async resetRoomTimer(roomId: string, adminId: number) {
        const state = await PRISMA_DB_CLIENT.roomState.update({
            where: { roomId },
            data: {
                timerActive: false,
                timerStartedAt: null,
                timerDuration: null,
                timerPausedAt: null
            }
        });

        await this.logAuditAction({
            userId: adminId,
            action: 'ROOM_TIMER_RESET',
            resource: 'room',
            resourceId: roomId,
            description: `Timer reset for room`
        });

        return state;
    }

    async clearRoomChat(roomId: string, adminId: number) {
        const result = await PRISMA_DB_CLIENT.message.deleteMany({
            where: { roomId }
        });

        await this.logAuditAction({
            userId: adminId,
            action: 'ROOM_CHAT_CLEARED',
            resource: 'room',
            resourceId: roomId,
            description: `Cleared ${result.count} messages from room`
        });

        return result;
    }

    async removeAllUsersFromRoom(roomId: string, adminId: number, reason?: string) {
        // Remove all presences
        const result = await PRISMA_DB_CLIENT.userPresence.deleteMany({
            where: { roomId }
        });

        // Update room occupancy
        await PRISMA_DB_CLIENT.room.update({
            where: { id: roomId },
            data: { currentOccupancy: 0 }
        });

        await this.logAuditAction({
            userId: adminId,
            action: 'ROOM_USERS_REMOVED',
            resource: 'room',
            resourceId: roomId,
            description: `Removed ${result.count} users from room${reason ? `: ${reason}` : ''}`,
            metadata: { count: result.count, reason }
        });

        return result;
    }

    async muteUser(targetUserId: number, roomId: string, adminId: number, reason?: string, duration?: number) {
        const expiresAt = duration ? new Date(Date.now() + duration * 60 * 1000) : null;

        const action = await PRISMA_DB_CLIENT.moderationAction.create({
            data: {
                targetUserId,
                roomId,
                actionType: 'MUTE',
                reason,
                duration,
                performedBy: adminId,
                expiresAt,
                isActive: true
            },
            include: {
                targetUser: {
                    select: {
                        email: true,
                        firstName: true,
                        lastName: true
                    }
                }
            }
        });

        await this.logAuditAction({
            userId: adminId,
            action: 'USER_MUTED',
            resource: 'user',
            resourceId: targetUserId.toString(),
            description: `Muted user ${action.targetUser.email}${reason ? `: ${reason}` : ''}`,
            metadata: { roomId, duration, reason }
        });

        return action;
    }

    async kickUser(targetUserId: number, roomId: string, adminId: number, reason?: string) {
        const action = await PRISMA_DB_CLIENT.moderationAction.create({
            data: {
                targetUserId,
                roomId,
                actionType: 'KICK',
                reason,
                performedBy: adminId,
                isActive: false // Kick is instant, not ongoing
            },
            include: {
                targetUser: {
                    select: {
                        email: true
                    }
                }
            }
        });

        // Remove user from room
        await PRISMA_DB_CLIENT.userPresence.deleteMany({
            where: {
                userId: targetUserId,
                roomId
            }
        });

        await this.logAuditAction({
            userId: adminId,
            action: 'USER_KICKED',
            resource: 'user',
            resourceId: targetUserId.toString(),
            description: `Kicked user ${action.targetUser.email} from room${reason ? `: ${reason}` : ''}`,
            metadata: { roomId, reason }
        });

        return action;
    }

    async banUser(targetUserId: number, adminId: number, reason?: string, duration?: number) {
        const expiresAt = duration ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) : null;

        const action = await PRISMA_DB_CLIENT.moderationAction.create({
            data: {
                targetUserId,
                actionType: 'BAN',
                reason,
                duration,
                performedBy: adminId,
                expiresAt,
                isActive: true
            },
            include: {
                targetUser: {
                    select: {
                        email: true
                    }
                }
            }
        });

        // Remove user from all rooms
        await PRISMA_DB_CLIENT.userPresence.deleteMany({
            where: { userId: targetUserId }
        });

        await this.logAuditAction({
            userId: adminId,
            action: 'USER_BANNED',
            resource: 'user',
            resourceId: targetUserId.toString(),
            description: `Banned user ${action.targetUser.email}${reason ? `: ${reason}` : ''}`,
            metadata: { duration, reason }
        });

        return action;
    }

    async unbanUser(targetUserId: number, adminId: number) {
        const action = await PRISMA_DB_CLIENT.moderationAction.updateMany({
            where: {
                targetUserId,
                actionType: 'BAN',
                isActive: true
            },
            data: {
                isActive: false,
                revokedAt: new Date(),
                revokedBy: adminId
            }
        });

        await this.logAuditAction({
            userId: adminId,
            action: 'USER_UNBANNED',
            resource: 'user',
            resourceId: targetUserId.toString(),
            description: `Unbanned user`
        });

        return action;
    }

    // ============================================
    // 11. AUDIT LOGS
    // ============================================

    async getAuditLogs(filters: {
        userId?: number;
        action?: string;
        resource?: string;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
    }) {
        const where: Prisma.AuditLogWhereInput = {};

        if (filters.userId) where.userId = filters.userId;
        if (filters.action) where.action = filters.action as any;
        if (filters.resource) where.resource = filters.resource;
        if (filters.startDate || filters.endDate) {
            where.timestamp = {};
            if (filters.startDate) where.timestamp.gte = filters.startDate;
            if (filters.endDate) where.timestamp.lte = filters.endDate;
        }

        const logs = await PRISMA_DB_CLIENT.auditLog.findMany({
            where,
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        role: true
                    }
                }
            },
            orderBy: { timestamp: 'desc' },
            take: filters.limit || 100
        });

        return logs.map(log => ({
            id: log.id,
            user: {
                id: log.user.id,
                email: log.user.email,
                name: `${log.user.firstName || ''} ${log.user.lastName || ''}`.trim(),
                role: log.user.role
            },
            action: log.action,
            resource: log.resource,
            resourceId: log.resourceId,
            description: log.description,
            metadata: log.metadata,
            timestamp: log.timestamp,
            ipAddress: log.ipAddress
        }));
    }

    private async logAuditAction(data: {
        userId: number;
        action: string;
        resource: string;
        resourceId?: string;
        description: string;
        metadata?: any;
        ipAddress?: string;
        userAgent?: string;
    }) {
        const user = await PRISMA_DB_CLIENT.user.findUnique({
            where: { id: data.userId },
            select: { role: true }
        });

        return PRISMA_DB_CLIENT.auditLog.create({
            data: {
                userId: data.userId,
                userRole: user?.role || 'STUDENT',
                action: data.action as any,
                resource: data.resource,
                resourceId: data.resourceId,
                description: data.description,
                metadata: data.metadata,
                ipAddress: data.ipAddress,
                userAgent: data.userAgent
            }
        });
    }

    // ============================================
    // 12. DATA EXPORT
    // ============================================

    async exportRoomUsageCSV(startDate: Date, endDate: Date) {
        const analytics = await PRISMA_DB_CLIENT.roomAnalytics.findMany({
            where: {
                date: {
                    gte: startDate,
                    lte: endDate
                }
            },
            include: {
                room: {
                    select: {
                        name: true
                    }
                }
            },
            orderBy: [
                { date: 'asc' },
                { roomId: 'asc' }
            ]
        });

        const headers = [
            'Date',
            'Room ID',
            'Room Name',
            'Total Joins',
            'Failed Joins',
            'Peak Occupancy',
            'Avg Occupancy',
            'Time at Capacity (min)',
            'Total Messages',
            'Avg Time Per User (min)'
        ];

        const rows = analytics.map(a => [
            a.date.toISOString().split('T')[0],
            a.roomId,
            a.room.name,
            a.totalJoins,
            a.failedJoins,
            a.peakOccupancy,
            a.avgOccupancy.toFixed(2),
            a.timeAtCapacity,
            a.totalMessages,
            a.avgTimePerUser.toFixed(2)
        ]);

        return {
            headers,
            rows,
            csv: [headers, ...rows].map(row => row.join(',')).join('\n')
        };
    }

    async exportModerationLogsCSV(startDate: Date, endDate: Date) {
        const actions = await PRISMA_DB_CLIENT.moderationAction.findMany({
            where: {
                performedAt: {
                    gte: startDate,
                    lte: endDate
                }
            },
            include: {
                targetUser: {
                    select: {
                        email: true
                    }
                },
                admin: {
                    select: {
                        email: true
                    }
                },
                room: {
                    select: {
                        name: true
                    }
                }
            },
            orderBy: { performedAt: 'asc' }
        });

        const headers = [
            'Timestamp',
            'Action Type',
            'Target User',
            'Room',
            'Reason',
            'Performed By',
            'Duration (min)',
            'Expires At',
            'Is Active'
        ];

        const rows = actions.map(a => [
            a.performedAt.toISOString(),
            a.actionType,
            a.targetUser.email,
            a.room?.name || 'N/A',
            a.reason || '',
            a.admin.email,
            a.duration || '',
            a.expiresAt?.toISOString() || '',
            a.isActive ? 'Yes' : 'No'
        ]);

        return {
            headers,
            rows,
            csv: [headers, ...rows].map(row => row.join(',')).join('\n')
        };
    }
}

export const adminService = new AdminService();
