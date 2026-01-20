import { PRISMA_DB_CLIENT } from "../../prisma";

export interface StartSessionInput {
    subject: string;
    topic?: string;
    sessionType: 'POMODORO_25' | 'POMODORO_50' | 'CUSTOM' | 'DEEP_WORK' | 'REVIEW';
    plannedDuration: number; // in minutes
    notes?: string;
    deviceId?: string;
}

export interface SessionFilters {
    dateFrom?: Date;
    dateTo?: Date;
    subject?: string;
    sessionType?: string;
    status?: string;
    page?: number;
    limit?: number;
}

export class StudySessionService {
    
    /**
     * Start a new study session
     * Validates no active session exists for the user
     */
    async startSession(userId: number, data: StartSessionInput) {
        // Check for existing active session
        const activeSession = await this.getActiveSession(userId);
        if (activeSession) {
            throw new Error("You already have an active study session. Please end it before starting a new one.");
        }

        const session = await PRISMA_DB_CLIENT.studySession.create({
            data: {
                userId,
                subject: data.subject,
                topic: data.topic,
                sessionType: data.sessionType,
                plannedDuration: data.plannedDuration,
                notes: data.notes,
                deviceId: data.deviceId,
                startTime: new Date(),
                status: 'ACTIVE',
            },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        timezone: true,
                    }
                }
            }
        });

        return {
            sessionId: session.id,
            startTime: session.startTime,
            plannedDuration: session.plannedDuration,
            sessionType: session.sessionType,
            subject: session.subject,
            topic: session.topic,
            status: session.status,
            serverTime: new Date(),
        };
    }

    /**
     * Get the currently active session for a user
     * Critical for timer resume functionality
     */
    async getActiveSession(userId: number) {
        const session = await PRISMA_DB_CLIENT.studySession.findFirst({
            where: {
                userId,
                status: {
                    in: ['ACTIVE', 'PAUSED']
                }
            },
            include: {
                pauseEvents: {
                    orderBy: { pausedAt: 'desc' }
                }
            }
        });

        if (!session) {
            return null;
        }

        // Calculate current elapsed time
        const now = new Date();
        const startTime = session.startTime;
        const totalElapsedMs = now.getTime() - startTime.getTime();
        const totalPausedMs = session.totalPausedTime * 1000;
        
        // If currently paused, add current pause duration
        let currentPauseMs = 0;
        if (session.status === 'PAUSED' && session.pausedAt) {
            currentPauseMs = now.getTime() - session.pausedAt.getTime();
        }

        const activeElapsedMs = totalElapsedMs - totalPausedMs - currentPauseMs;
        const activeElapsedMinutes = Math.floor(activeElapsedMs / (1000 * 60));

        return {
            sessionId: session.id,
            subject: session.subject,
            topic: session.topic,
            sessionType: session.sessionType,
            plannedDuration: session.plannedDuration,
            startTime: session.startTime,
            status: session.status,
            pausedAt: session.pausedAt,
            totalPausedTime: session.totalPausedTime,
            pauseCount: session.pauseCount,
            elapsedMinutes: activeElapsedMinutes,
            remainingMinutes: Math.max(0, session.plannedDuration - activeElapsedMinutes),
            serverTime: now,
            notes: session.notes,
        };
    }

    /**
     * Pause an active study session
     * Idempotent operation - safe to call multiple times
     */
    async pauseSession(userId: number, sessionId: string) {
        const session = await PRISMA_DB_CLIENT.studySession.findFirst({
            where: {
                id: sessionId,
                userId,
                status: 'ACTIVE'
            }
        });

        if (!session) {
            throw new Error("No active session found to pause");
        }

        const now = new Date();

        // Create pause event and update session
        await PRISMA_DB_CLIENT.$transaction(async (tx) => {
            // Create pause event
            await tx.pauseEvent.create({
                data: {
                    sessionId,
                    pausedAt: now,
                }
            });

            // Update session status
            await tx.studySession.update({
                where: { id: sessionId },
                data: {
                    status: 'PAUSED',
                    pausedAt: now,
                    pauseCount: { increment: 1 },
                    updatedAt: now,
                }
            });
        });

        return {
            sessionId,
            status: 'PAUSED',
            pausedAt: now,
            serverTime: now,
        };
    }

    /**
     * Resume a paused study session
     * Calculates and stores pause duration
     */
    async resumeSession(userId: number, sessionId: string) {
        const session = await PRISMA_DB_CLIENT.studySession.findFirst({
            where: {
                id: sessionId,
                userId,
                status: 'PAUSED'
            }
        });

        if (!session) {
            throw new Error("No paused session found to resume");
        }

        if (!session.pausedAt) {
            throw new Error("Session pause time not found");
        }

        const now = new Date();
        const pauseDurationMs = now.getTime() - session.pausedAt.getTime();
        const pauseDurationSeconds = Math.floor(pauseDurationMs / 1000);

        // Update pause event and session
        await PRISMA_DB_CLIENT.$transaction(async (tx) => {
            // Update the latest pause event
            const latestPauseEvent = await tx.pauseEvent.findFirst({
                where: {
                    sessionId,
                    resumedAt: null,
                },
                orderBy: { pausedAt: 'desc' }
            });

            if (latestPauseEvent) {
                await tx.pauseEvent.update({
                    where: { id: latestPauseEvent.id },
                    data: {
                        resumedAt: now,
                        pauseDuration: pauseDurationSeconds,
                    }
                });
            }

            // Update session
            await tx.studySession.update({
                where: { id: sessionId },
                data: {
                    status: 'ACTIVE',
                    pausedAt: null,
                    totalPausedTime: { increment: pauseDurationSeconds },
                    updatedAt: now,
                }
            });
        });

        return {
            sessionId,
            status: 'ACTIVE',
            resumedAt: now,
            pauseDuration: pauseDurationSeconds,
            serverTime: now,
        };
    }

    /**
     * End a study session and calculate final metrics
     */
    async endSession(userId: number, sessionId: string, wasCompleted: boolean = true) {
        const session = await PRISMA_DB_CLIENT.studySession.findFirst({
            where: {
                id: sessionId,
                userId,
                status: { in: ['ACTIVE', 'PAUSED'] }
            }
        });

        if (!session) {
            throw new Error("No active session found to end");
        }

        const now = new Date();
        let finalPausedTime = session.totalPausedTime;

        // If session is currently paused, add final pause duration
        if (session.status === 'PAUSED' && session.pausedAt) {
            const finalPauseDuration = Math.floor((now.getTime() - session.pausedAt.getTime()) / 1000);
            finalPausedTime += finalPauseDuration;

            // Update the final pause event
            await PRISMA_DB_CLIENT.pauseEvent.updateMany({
                where: {
                    sessionId,
                    resumedAt: null,
                },
                data: {
                    resumedAt: now,
                    pauseDuration: finalPauseDuration,
                }
            });
        }

        // Calculate final metrics
        const totalSessionMs = now.getTime() - session.startTime.getTime();
        const totalSessionMinutes = Math.floor(totalSessionMs / (1000 * 60));
        const actualStudyMinutes = Math.floor((totalSessionMs - (finalPausedTime * 1000)) / (1000 * 60));
        
        // Calculate productivity score (actual vs planned)
        const productivityScore = session.plannedDuration > 0 
            ? Math.min(100, (actualStudyMinutes / session.plannedDuration) * 100)
            : 0;

        const finalStatus = wasCompleted ? 'COMPLETED' : 'ABANDONED';

        // Update session with final data
        const updatedSession = await PRISMA_DB_CLIENT.studySession.update({
            where: { id: sessionId },
            data: {
                status: finalStatus,
                endTime: now,
                actualStudyTime: actualStudyMinutes,
                productivityScore,
                totalPausedTime: finalPausedTime,
                updatedAt: now,
            }
        });

        return {
            sessionId,
            status: finalStatus,
            endTime: now,
            totalSessionMinutes,
            actualStudyMinutes,
            plannedDuration: session.plannedDuration,
            productivityScore: Math.round(productivityScore * 100) / 100,
            pauseCount: session.pauseCount,
            totalPausedTime: finalPausedTime,
            subject: session.subject,
            topic: session.topic,
            sessionType: session.sessionType,
        };
    }

    /**
     * Get study session history with filtering and pagination
     */
    async getSessionHistory(userId: number, filters: SessionFilters = {}) {
        const {
            dateFrom,
            dateTo,
            subject,
            sessionType,
            status,
            page = 1,
            limit = 20
        } = filters;

        const skip = (page - 1) * limit;

        const where: any = { userId };

        if (dateFrom || dateTo) {
            where.startTime = {};
            if (dateFrom) where.startTime.gte = dateFrom;
            if (dateTo) where.startTime.lte = dateTo;
        }

        if (subject) where.subject = { contains: subject, mode: 'insensitive' };
        if (sessionType) where.sessionType = sessionType;
        if (status) where.status = status;

        const [sessions, total] = await Promise.all([
            PRISMA_DB_CLIENT.studySession.findMany({
                where,
                orderBy: { startTime: 'desc' },
                skip,
                take: limit,
                select: {
                    id: true,
                    subject: true,
                    topic: true,
                    sessionType: true,
                    plannedDuration: true,
                    actualStudyTime: true,
                    productivityScore: true,
                    status: true,
                    startTime: true,
                    endTime: true,
                    pauseCount: true,
                    totalPausedTime: true,
                    notes: true,
                }
            }),
            PRISMA_DB_CLIENT.studySession.count({ where })
        ]);

        return {
            sessions,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1,
            }
        };
    }

    /**
     * Get study analytics for a user
     */
    async getStudyAnalytics(userId: number, days: number = 30) {
        const dateFrom = new Date();
        dateFrom.setDate(dateFrom.getDate() - days);

        const sessions = await PRISMA_DB_CLIENT.studySession.findMany({
            where: {
                userId,
                startTime: { gte: dateFrom },
                status: { in: ['COMPLETED', 'ABANDONED'] }
            },
            select: {
                actualStudyTime: true,
                productivityScore: true,
                status: true,
                subject: true,
                sessionType: true,
                startTime: true,
            }
        });

        const totalSessions = sessions.length;
        const completedSessions = sessions.filter(s => s.status === 'COMPLETED').length;
        const totalStudyMinutes = sessions.reduce((sum, s) => sum + (s.actualStudyTime || 0), 0);
        const avgProductivityScore = sessions.length > 0 
            ? sessions.reduce((sum, s) => sum + (s.productivityScore || 0), 0) / sessions.length
            : 0;

        // Subject breakdown
        const subjectStats = sessions.reduce((acc, session) => {
            const subject = session.subject;
            if (!acc[subject]) {
                acc[subject] = { minutes: 0, sessions: 0 };
            }
            acc[subject].minutes += session.actualStudyTime || 0;
            acc[subject].sessions += 1;
            return acc;
        }, {} as Record<string, { minutes: number; sessions: number }>);

        // Daily breakdown
        const dailyStats = sessions.reduce((acc, session) => {
            const date = session.startTime.toISOString().split('T')[0];
            if (!acc[date]) {
                acc[date] = { minutes: 0, sessions: 0 };
            }
            acc[date].minutes += session.actualStudyTime || 0;
            acc[date].sessions += 1;
            return acc;
        }, {} as Record<string, { minutes: number; sessions: number }>);

        return {
            period: { days, from: dateFrom, to: new Date() },
            summary: {
                totalSessions,
                completedSessions,
                completionRate: totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0,
                totalStudyHours: Math.round((totalStudyMinutes / 60) * 100) / 100,
                avgProductivityScore: Math.round(avgProductivityScore * 100) / 100,
                avgSessionLength: totalSessions > 0 ? Math.round(totalStudyMinutes / totalSessions) : 0,
            },
            subjectBreakdown: Object.entries(subjectStats).map(([subject, stats]) => ({
                subject,
                minutes: stats.minutes,
                hours: Math.round((stats.minutes / 60) * 100) / 100,
                sessions: stats.sessions,
            })),
            dailyBreakdown: Object.entries(dailyStats).map(([date, stats]) => ({
                date,
                minutes: stats.minutes,
                hours: Math.round((stats.minutes / 60) * 100) / 100,
                sessions: stats.sessions,
            })).sort((a, b) => a.date.localeCompare(b.date)),
        };
    }

    /**
     * Auto-expire abandoned sessions (cleanup job)
     */
    async expireAbandonedSessions(maxHours: number = 24) {
        const cutoffTime = new Date();
        cutoffTime.setHours(cutoffTime.getHours() - maxHours);

        const expiredSessions = await PRISMA_DB_CLIENT.studySession.updateMany({
            where: {
                status: { in: ['ACTIVE', 'PAUSED'] },
                startTime: { lt: cutoffTime },
            },
            data: {
                status: 'EXPIRED',
                endTime: new Date(),
                updatedAt: new Date(),
            }
        });

        return {
            expiredCount: expiredSessions.count,
            cutoffTime,
        };
    }
}