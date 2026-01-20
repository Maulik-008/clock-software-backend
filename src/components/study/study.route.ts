import { Router, Request, Response, NextFunction } from "express";
import { StudySessionController } from "./study.controller";
import { StudySessionService } from "./study.service";
import { authenticate } from "../../middlewares/authentication";
import {
    validateStartSession,
    validateSessionId,
    validateEndSession,
    validateSessionHistory,
    validateAnalytics,
    validateCleanupSessions,
} from "./study.validation";

// Initialize service and controller
const studySessionService = new StudySessionService();
const studySessionController = new StudySessionController(studySessionService);

const studyRouter = Router();

// Wrapper functions to handle typing
const handleStartSession = async (req: Request, res: Response, next: NextFunction) => {
    await studySessionController.startSession(req, res, next);
};

const handleGetActiveSession = async (req: Request, res: Response, next: NextFunction) => {
    await studySessionController.getActiveSession(req, res, next);
};

const handlePauseSession = async (req: Request, res: Response, next: NextFunction) => {
    await studySessionController.pauseSession(req, res, next);
};

const handleResumeSession = async (req: Request, res: Response, next: NextFunction) => {
    await studySessionController.resumeSession(req, res, next);
};

const handleEndSession = async (req: Request, res: Response, next: NextFunction) => {
    await studySessionController.endSession(req, res, next);
};

const handleGetSessionHistory = async (req: Request, res: Response, next: NextFunction) => {
    await studySessionController.getSessionHistory(req, res, next);
};

const handleGetStudyAnalytics = async (req: Request, res: Response, next: NextFunction) => {
    await studySessionController.getStudyAnalytics(req, res, next);
};

const handleCleanupExpiredSessions = async (req: Request, res: Response, next: NextFunction) => {
    await studySessionController.cleanupExpiredSessions(req, res, next);
};

/**
 * @route   POST /api/sessions/start
 * @desc    Start a new study session
 * @access  Private (Authenticated users)
 */
// @ts-ignore
studyRouter.post("/start", authenticate, validateStartSession, handleStartSession);

/**
 * @route   GET /api/sessions/active
 * @desc    Get currently active session for timer resume
 * @access  Private (Authenticated users)
 */
// @ts-ignore
studyRouter.get("/active", authenticate, handleGetActiveSession);

/**
 * @route   PUT /api/sessions/:id/pause
 * @desc    Pause an active study session
 * @access  Private (Authenticated users)
 */
// @ts-ignore
studyRouter.put("/:id/pause", authenticate, validateSessionId, handlePauseSession);

/**
 * @route   PUT /api/sessions/:id/resume
 * @desc    Resume a paused study session
 * @access  Private (Authenticated users)
 */
// @ts-ignore
studyRouter.put("/:id/resume", authenticate, validateSessionId, handleResumeSession);

/**
 * @route   PUT /api/sessions/:id/end
 * @desc    End a study session
 * @access  Private (Authenticated users)
 */
// @ts-ignore
studyRouter.put("/:id/end", authenticate, validateEndSession, handleEndSession);

/**
 * @route   GET /api/sessions
 * @desc    Get study session history with filtering and pagination
 * @access  Private (Authenticated users)
 */
// @ts-ignore
studyRouter.get("/", authenticate, validateSessionHistory, handleGetSessionHistory);

/**
 * @route   GET /api/sessions/analytics
 * @desc    Get study analytics and insights
 * @access  Private (Authenticated users)
 */
// @ts-ignore
studyRouter.get("/analytics", authenticate, validateAnalytics, handleGetStudyAnalytics);

/**
 * @route   POST /api/sessions/cleanup
 * @desc    Admin endpoint to cleanup expired sessions
 * @access  Private (Super Admin only)
 */
// @ts-ignore
studyRouter.post("/cleanup", authenticate, validateCleanupSessions, handleCleanupExpiredSessions);

export default studyRouter;