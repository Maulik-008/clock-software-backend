import { Router } from "express";
import { authenticate, requireRole } from "../../middlewares/authentication";
import { adminController } from "./admin.controller";

const router = Router();

// All admin routes require authentication and SUPER_ADMIN role
router.use(authenticate);
router.use(requireRole(['SUPER_ADMIN']));

// ============================================
// ANALYTICS ROUTES
// ============================================

// Platform-wide analytics
router.get("/analytics/platform/summary", adminController.getPlatformSummary);
router.get("/analytics/platform/trends", adminController.getPlatformTrends);

// Room analytics
router.get("/analytics/rooms", adminController.getAllRoomsAnalytics);
router.get("/analytics/rooms/:roomId", adminController.getRoomAnalytics);

// User engagement
router.get("/analytics/engagement", adminController.getUserEngagementMetrics);

// Session quality
router.get("/analytics/sessions/quality", adminController.getSessionQualityMetrics);

// Chat statistics
router.get("/analytics/chat", adminController.getChatStatistics);

// ============================================
// LIVE MONITORING ROUTES
// ============================================

router.get("/monitoring/rooms", adminController.getLiveRoomMonitoring);
router.get("/monitoring/rooms/:roomId", adminController.getRoomDetails);

// ============================================
// CAPACITY & LOAD ROUTES
// ============================================

router.get("/capacity/history", adminController.getCapacityHistory);
router.get("/capacity/peak-slots", adminController.getPeakUsageSlots);

// ============================================
// MODERATION ROUTES
// ============================================

router.get("/moderation/dashboard", adminController.getModerationDashboard);
router.get("/moderation/history/:userId", adminController.getModerationHistory);

// Moderation actions
router.post("/moderation/mute", adminController.muteUser);
router.post("/moderation/kick", adminController.kickUser);
router.post("/moderation/ban", adminController.banUser);
router.post("/moderation/unban", adminController.unbanUser);

// ============================================
// SYSTEM HEALTH ROUTES
// ============================================

router.get("/system/health", adminController.getSystemHealth);
router.get("/system/alerts", adminController.getSystemAlerts);

// ============================================
// ROOM CONTROL ROUTES
// ============================================

router.post("/rooms/:roomId/lock", adminController.lockRoom);
router.post("/rooms/:roomId/unlock", adminController.unlockRoom);
router.post("/rooms/:roomId/timer/reset", adminController.resetRoomTimer);
router.delete("/rooms/:roomId/chat", adminController.clearRoomChat);
router.delete("/rooms/:roomId/users", adminController.removeAllUsersFromRoom);

// ============================================
// AUDIT LOG ROUTES
// ============================================

router.get("/audit-logs", adminController.getAuditLogs);

// ============================================
// EXPORT ROUTES
// ============================================

router.get("/export/room-usage", adminController.exportRoomUsage);
router.get("/export/moderation-logs", adminController.exportModerationLogs);

export default router;
