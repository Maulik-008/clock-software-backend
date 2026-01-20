import { Response } from "express";
import { AuthenticatedRequest } from "../../middlewares/authentication";
import { adminService } from "./admin.service";
import { asyncHandler } from "../../utils/asyncHandler";
import logger from "../../config/logger";

export class AdminController {
    // ============================================
    // ANALYTICS ENDPOINTS
    // ============================================

    getPlatformSummary = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const summary = await adminService.getPlatformSummary();

        res.json({
            success: true,
            data: summary
        });
    });

    getPlatformTrends = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const days = parseInt(req.query.days as string) || 30;

        if (days < 1 || days > 365) {
            res.status(400).json({
                success: false,
                message: "Days must be between 1 and 365"
            });
            return;
        }

        const trends = await adminService.getPlatformTrends(days);

        res.json({
            success: true,
            data: trends
        });
    });

    getRoomAnalytics = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { roomId } = req.params;
        const days = parseInt(req.query.days as string) || 7;

        if (days < 1 || days > 90) {
            res.status(400).json({
                success: false,
                message: "Days must be between 1 and 90"
            });
            return;
        }

        const analytics = await adminService.getRoomAnalytics(roomId, days);

        res.json({
            success: true,
            data: analytics
        });
    });

    getAllRoomsAnalytics = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const days = parseInt(req.query.days as string) || 1;

        const analytics = await adminService.getAllRoomsAnalytics(days);

        res.json({
            success: true,
            data: analytics
        });
    });

    getUserEngagementMetrics = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const days = parseInt(req.query.days as string) || 7;

        const metrics = await adminService.getUserEngagementMetrics(days);

        res.json({
            success: true,
            data: metrics
        });
    });

    getSessionQualityMetrics = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const days = parseInt(req.query.days as string) || 7;

        const metrics = await adminService.getSessionQualityMetrics(days);

        res.json({
            success: true,
            data: metrics
        });
    });

    getChatStatistics = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const roomId = req.query.roomId as string | undefined;
        const days = parseInt(req.query.days as string) || 7;

        const stats = await adminService.getChatStatistics(roomId, days);

        res.json({
            success: true,
            data: stats
        });
    });

    // ============================================
    // LIVE MONITORING ENDPOINTS
    // ============================================

    getLiveRoomMonitoring = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const rooms = await adminService.getLiveRoomMonitoring();

        res.json({
            success: true,
            data: rooms
        });
    });

    getRoomDetails = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { roomId } = req.params;

        try {
            const details = await adminService.getRoomDetails(roomId);

            res.json({
                success: true,
                data: details
            });
        } catch (error) {
            res.status(404).json({
                success: false,
                message: error instanceof Error ? error.message : "Room not found"
            });
        }
    });

    // ============================================
    // CAPACITY & LOAD ENDPOINTS
    // ============================================

    getCapacityHistory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const roomId = req.query.roomId as string | undefined;
        const days = parseInt(req.query.days as string) || 7;

        const history = await adminService.getCapacityHistory(roomId, days);

        res.json({
            success: true,
            data: history
        });
    });

    getPeakUsageSlots = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const days = parseInt(req.query.days as string) || 30;

        const slots = await adminService.getPeakUsageSlots(days);

        res.json({
            success: true,
            data: slots
        });
    });

    // ============================================
    // MODERATION ENDPOINTS
    // ============================================

    getModerationDashboard = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const days = parseInt(req.query.days as string) || 30;

        const dashboard = await adminService.getModerationDashboard(days);

        res.json({
            success: true,
            data: dashboard
        });
    });

    getModerationHistory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const userId = parseInt(req.params.userId);

        if (isNaN(userId)) {
            res.status(400).json({
                success: false,
                message: "Invalid user ID"
            });
            return;
        }

        const history = await adminService.getModerationHistory(userId);

        res.json({
            success: true,
            data: history
        });
    });

    muteUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { userId, roomId, reason, duration } = req.body;
        const adminId = req.user!.id;

        if (!userId || !roomId) {
            res.status(400).json({
                success: false,
                message: "userId and roomId are required"
            });
            return;
        }

        const action = await adminService.muteUser(
            parseInt(userId),
            roomId,
            adminId,
            reason,
            duration
        );

        logger.info(`Admin ${adminId} muted user ${userId} in room ${roomId}`);

        res.json({
            success: true,
            message: "User muted successfully",
            data: action
        });
    });

    kickUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { userId, roomId, reason } = req.body;
        const adminId = req.user!.id;

        if (!userId || !roomId) {
            res.status(400).json({
                success: false,
                message: "userId and roomId are required"
            });
            return;
        }

        const action = await adminService.kickUser(
            parseInt(userId),
            roomId,
            adminId,
            reason
        );

        logger.info(`Admin ${adminId} kicked user ${userId} from room ${roomId}`);

        res.json({
            success: true,
            message: "User kicked successfully",
            data: action
        });
    });

    banUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { userId, reason, duration } = req.body;
        const adminId = req.user!.id;

        if (!userId) {
            res.status(400).json({
                success: false,
                message: "userId is required"
            });
            return;
        }

        const action = await adminService.banUser(
            parseInt(userId),
            adminId,
            reason,
            duration
        );

        logger.info(`Admin ${adminId} banned user ${userId}`);

        res.json({
            success: true,
            message: "User banned successfully",
            data: action
        });
    });

    unbanUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { userId } = req.body;
        const adminId = req.user!.id;

        if (!userId) {
            res.status(400).json({
                success: false,
                message: "userId is required"
            });
            return;
        }

        const action = await adminService.unbanUser(parseInt(userId), adminId);

        logger.info(`Admin ${adminId} unbanned user ${userId}`);

        res.json({
            success: true,
            message: "User unbanned successfully",
            data: action
        });
    });

    // ============================================
    // SYSTEM HEALTH ENDPOINTS
    // ============================================

    getSystemHealth = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const health = await adminService.getSystemHealth();

        res.json({
            success: true,
            data: health
        });
    });

    getSystemAlerts = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const alerts = await adminService.getSystemAlerts();

        res.json({
            success: true,
            data: alerts
        });
    });

    // ============================================
    // ROOM CONTROL ENDPOINTS
    // ============================================

    lockRoom = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { roomId } = req.params;
        const { reason } = req.body;
        const adminId = req.user!.id;

        const room = await adminService.lockRoom(roomId, adminId, reason);

        logger.info(`Admin ${adminId} locked room ${roomId}`);

        res.json({
            success: true,
            message: "Room locked successfully",
            data: room
        });
    });

    unlockRoom = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { roomId } = req.params;
        const adminId = req.user!.id;

        const room = await adminService.unlockRoom(roomId, adminId);

        logger.info(`Admin ${adminId} unlocked room ${roomId}`);

        res.json({
            success: true,
            message: "Room unlocked successfully",
            data: room
        });
    });

    resetRoomTimer = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { roomId } = req.params;
        const adminId = req.user!.id;

        const state = await adminService.resetRoomTimer(roomId, adminId);

        logger.info(`Admin ${adminId} reset timer for room ${roomId}`);

        res.json({
            success: true,
            message: "Room timer reset successfully",
            data: state
        });
    });

    clearRoomChat = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { roomId } = req.params;
        const adminId = req.user!.id;

        const result = await adminService.clearRoomChat(roomId, adminId);

        logger.info(`Admin ${adminId} cleared chat for room ${roomId}`);

        res.json({
            success: true,
            message: `Cleared ${result.count} messages`,
            data: result
        });
    });

    removeAllUsersFromRoom = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { roomId } = req.params;
        const { reason } = req.body;
        const adminId = req.user!.id;

        const result = await adminService.removeAllUsersFromRoom(roomId, adminId, reason);

        logger.info(`Admin ${adminId} removed all users from room ${roomId}`);

        res.json({
            success: true,
            message: `Removed ${result.count} users from room`,
            data: result
        });
    });

    // ============================================
    // AUDIT LOG ENDPOINTS
    // ============================================

    getAuditLogs = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const filters = {
            userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
            action: req.query.action as string | undefined,
            resource: req.query.resource as string | undefined,
            startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
            endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
            limit: req.query.limit ? parseInt(req.query.limit as string) : undefined
        };

        const logs = await adminService.getAuditLogs(filters);

        res.json({
            success: true,
            data: logs
        });
    });

    // ============================================
    // EXPORT ENDPOINTS
    // ============================================

    exportRoomUsage = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

        const result = await adminService.exportRoomUsageCSV(startDate, endDate);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="room-usage-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.csv"`);
        res.send(result.csv);
    });

    exportModerationLogs = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

        const result = await adminService.exportModerationLogsCSV(startDate, endDate);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="moderation-logs-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.csv"`);
        res.send(result.csv);
    });
}

export const adminController = new AdminController();
