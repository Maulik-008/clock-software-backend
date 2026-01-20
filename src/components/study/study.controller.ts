import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { StudySessionService, StartSessionInput, SessionFilters } from "./study.service";

export class StudySessionController {
    constructor(private studySessionService: StudySessionService) {}

    /**
     * POST /api/sessions/start
     * Start a new study session
     */
    async startSession(req: Request, res: Response, next: NextFunction) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: "Validation failed",
                    errors: errors.array(),
                });
            }

            const user = (req as any).user;
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required",
                });
            }

            const sessionData: StartSessionInput = {
                subject: req.body.subject,
                topic: req.body.topic,
                sessionType: req.body.sessionType,
                plannedDuration: req.body.plannedDuration,
                notes: req.body.notes,
                deviceId: req.body.deviceId || req.headers['user-agent'],
            };

            const session = await this.studySessionService.startSession(user.id, sessionData);

            res.status(201).json({
                success: true,
                message: "Study session started successfully",
                data: session,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/sessions/active
     * Get the currently active session for timer resume
     */
    async getActiveSession(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (req as any).user;
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required",
                });
            }

            const activeSession = await this.studySessionService.getActiveSession(user.id);

            if (!activeSession) {
                return res.status(200).json({
                    success: true,
                    message: "No active session found",
                    data: null,
                });
            }

            res.status(200).json({
                success: true,
                message: "Active session retrieved successfully",
                data: activeSession,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * PUT /api/sessions/:id/pause
     * Pause an active study session
     */
    async pauseSession(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (req as any).user;
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required",
                });
            }

            const sessionId = req.params.id;
            const result = await this.studySessionService.pauseSession(user.id, sessionId);

            res.status(200).json({
                success: true,
                message: "Session paused successfully",
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * PUT /api/sessions/:id/resume
     * Resume a paused study session
     */
    async resumeSession(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (req as any).user;
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required",
                });
            }

            const sessionId = req.params.id;
            const result = await this.studySessionService.resumeSession(user.id, sessionId);

            res.status(200).json({
                success: true,
                message: "Session resumed successfully",
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * PUT /api/sessions/:id/end
     * End a study session
     */
    async endSession(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (req as any).user;
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required",
                });
            }

            const sessionId = req.params.id;
            const wasCompleted = req.body.completed !== false; // Default to true unless explicitly false

            const result = await this.studySessionService.endSession(user.id, sessionId, wasCompleted);

            res.status(200).json({
                success: true,
                message: "Session ended successfully",
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/sessions
     * Get study session history with filtering and pagination
     */
    async getSessionHistory(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (req as any).user;
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required",
                });
            }

            const filters: SessionFilters = {
                dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
                dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
                subject: req.query.subject as string,
                sessionType: req.query.sessionType as string,
                status: req.query.status as string,
                page: req.query.page ? parseInt(req.query.page as string) : 1,
                limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
            };

            const result = await this.studySessionService.getSessionHistory(user.id, filters);

            res.status(200).json({
                success: true,
                message: "Session history retrieved successfully",
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/sessions/analytics
     * Get study analytics and insights
     */
    async getStudyAnalytics(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (req as any).user;
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required",
                });
            }

            const days = req.query.days ? parseInt(req.query.days as string) : 30;
            const analytics = await this.studySessionService.getStudyAnalytics(user.id, days);

            res.status(200).json({
                success: true,
                message: "Study analytics retrieved successfully",
                data: analytics,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/sessions/cleanup
     * Admin endpoint to cleanup expired sessions
     */
    async cleanupExpiredSessions(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (req as any).user;
            if (!user || user.role !== 'SUPER_ADMIN') {
                return res.status(403).json({
                    success: false,
                    message: "Admin access required",
                });
            }

            const maxHours = req.body.maxHours || 24;
            const result = await this.studySessionService.expireAbandonedSessions(maxHours);

            res.status(200).json({
                success: true,
                message: "Expired sessions cleaned up successfully",
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }
}