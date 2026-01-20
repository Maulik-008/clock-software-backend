import { PRISMA_DB_CLIENT } from "../../../prisma";
import { adminService } from "../admin.service";

// Mock Prisma client
jest.mock("../../../prisma", () => ({
    PRISMA_DB_CLIENT: {
        user: {
            count: jest.fn(),
            findUnique: jest.fn()
        },
        userPresence: {
            count: jest.fn(),
            groupBy: jest.fn(),
            findMany: jest.fn(),
            deleteMany: jest.fn()
        },
        platformStats: {
            findUnique: jest.fn(),
            findMany: jest.fn()
        },
        room: {
            count: jest.fn(),
            findMany: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn()
        },
        roomAnalytics: {
            findMany: jest.fn()
        },
        roomState: {
            update: jest.fn()
        },
        studySession: {
            groupBy: jest.fn(),
            findMany: jest.fn()
        },
        message: {
            groupBy: jest.fn(),
            count: jest.fn(),
            deleteMany: jest.fn()
        },
        capacityEvent: {
            findMany: jest.fn(),
            count: jest.fn()
        },
        moderationAction: {
            findMany: jest.fn(),
            groupBy: jest.fn(),
            create: jest.fn(),
            updateMany: jest.fn()
        },
        auditLog: {
            findMany: jest.fn(),
            create: jest.fn()
        },
        systemMetrics: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            aggregate: jest.fn()
        }
    }
}));

describe("AdminService - Platform Analytics", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("getPlatformSummary", () => {
        it("should return platform summary with correct metrics", async () => {
            const mockDate = new Date('2024-01-15');
            jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

            (PRISMA_DB_CLIENT.user.count as jest.Mock).mockResolvedValue(1000);
            (PRISMA_DB_CLIENT.userPresence.count as jest.Mock).mockResolvedValue(50);
            (PRISMA_DB_CLIENT.platformStats.findUnique as jest.Mock).mockResolvedValue({
                activeUsers: 200,
                totalSessions: 500,
                avgSessionDuration: 45,
                peakConcurrentUsers: 75
            });
            (PRISMA_DB_CLIENT.platformStats.findMany as jest.Mock).mockResolvedValue([
                { activeUsers: 200, totalSessions: 500, avgSessionDuration: 45 },
                { activeUsers: 180, totalSessions: 450, avgSessionDuration: 40 }
            ]);
            (PRISMA_DB_CLIENT.room.count as jest.Mock).mockResolvedValue(5);

            const result = await adminService.getPlatformSummary();

            expect(result.users.total).toBe(1000);
            expect(result.users.online).toBe(50);
            expect(result.rooms.active).toBe(5);
            expect(PRISMA_DB_CLIENT.user.count).toHaveBeenCalled();
        });
    });

    describe("getPlatformTrends", () => {
        it("should return trends for specified number of days", async () => {
            const mockStats = [
                {
                    date: new Date('2024-01-14'),
                    totalUsers: 1000,
                    newUsers: 10,
                    activeUsers: 200,
                    peakConcurrentUsers: 75,
                    totalSessions: 500,
                    completedSessions: 450,
                    abandonedSessions: 50,
                    avgSessionDuration: 45,
                    totalRoomJoins: 600,
                    failedJoins: 10,
                    avgRoomOccupancy: 25.5,
                    totalMessages: 1500,
                    cameraOnRate: 0.75,
                    micOnRate: 0.60
                }
            ];

            (PRISMA_DB_CLIENT.platformStats.findMany as jest.Mock).mockResolvedValue(mockStats);

            const result = await adminService.getPlatformTrends(7);

            expect(result).toHaveLength(1);
            expect(result[0].users.total).toBe(1000);
            expect(result[0].sessions.total).toBe(500);
            expect(result[0].engagement.cameraOnRate).toBe(0.75);
        });
    });
});

describe("AdminService - Room Analytics", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("getRoomAnalytics", () => {
        it("should return analytics for specific room", async () => {
            const mockAnalytics = [
                {
                    date: new Date('2024-01-14'),
                    totalJoins: 100,
                    failedJoins: 5,
                    peakOccupancy: 45,
                    avgOccupancy: 30.5,
                    totalMessages: 500,
                    timeAtCapacity: 30
                }
            ];

            (PRISMA_DB_CLIENT.roomAnalytics.findMany as jest.Mock).mockResolvedValue(mockAnalytics);

            const result = await adminService.getRoomAnalytics('room-1', 7);

            expect(result.roomId).toBe('room-1');
            expect(result.summary.totalJoins).toBe(100);
            expect(result.summary.failedJoins).toBe(5);
            expect(result.daily).toHaveLength(1);
        });

        it("should calculate failure rate correctly", async () => {
            const mockAnalytics = [
                {
                    date: new Date('2024-01-14'),
                    totalJoins: 100,
                    failedJoins: 10,
                    peakOccupancy: 45,
                    avgOccupancy: 30.5,
                    totalMessages: 500,
                    timeAtCapacity: 30
                }
            ];

            (PRISMA_DB_CLIENT.roomAnalytics.findMany as jest.Mock).mockResolvedValue(mockAnalytics);

            const result = await adminService.getRoomAnalytics('room-1', 7);

            expect(result.summary.failureRate).toBe(10); // 10/100 * 100 = 10%
        });
    });

    describe("getAllRoomsAnalytics", () => {
        it("should return analytics for all rooms", async () => {
            const mockRooms = [
                {
                    id: 'room-1',
                    name: 'Room 1',
                    currentOccupancy: 25,
                    isLocked: false,
                    analytics: [
                        { totalJoins: 100, failedJoins: 5, peakOccupancy: 45 }
                    ],
                    state: { lastActivityAt: new Date() }
                }
            ];

            (PRISMA_DB_CLIENT.room.findMany as jest.Mock).mockResolvedValue(mockRooms);

            const result = await adminService.getAllRoomsAnalytics(1);

            expect(result).toHaveLength(1);
            expect(result[0].roomId).toBe('room-1');
            expect(result[0].totalJoins).toBe(100);
        });
    });
});

describe("AdminService - Live Monitoring", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("getLiveRoomMonitoring", () => {
        it("should return active rooms with user details", async () => {
            const mockRooms = [
                {
                    id: 'room-1',
                    name: 'Room 1',
                    currentOccupancy: 2,
                    capacity: 50,
                    isLocked: false,
                    state: {
                        timerActive: true,
                        timerStartedAt: new Date(),
                        timerDuration: 1500,
                        timerPausedAt: null,
                        messagesLast24h: 50,
                        joinsLast24h: 10,
                        lastActivityAt: new Date()
                    },
                    presences: [
                        {
                            userId: 1,
                            joinedAt: new Date(),
                            cameraOn: true,
                            micOn: false,
                            lastActivityAt: new Date(),
                            user: {
                                id: 1,
                                email: 'user1@test.com',
                                firstName: 'John',
                                lastName: 'Doe'
                            }
                        }
                    ]
                }
            ];

            (PRISMA_DB_CLIENT.room.findMany as jest.Mock).mockResolvedValue(mockRooms);

            const result = await adminService.getLiveRoomMonitoring();

            expect(result).toHaveLength(1);
            expect(result[0].occupancy).toBe(2);
            expect(result[0].users).toHaveLength(1);
            expect(result[0].users[0].email).toBe('user1@test.com');
            expect(result[0].timer?.active).toBe(true);
        });
    });

    describe("getRoomDetails", () => {
        it("should return detailed room information", async () => {
            const mockRoom = {
                id: 'room-1',
                name: 'Room 1',
                currentOccupancy: 1,
                capacity: 50,
                isLocked: false,
                createdAt: new Date(),
                state: null,
                presences: []
            };

            (PRISMA_DB_CLIENT.room.findUnique as jest.Mock).mockResolvedValue(mockRoom);

            const result = await adminService.getRoomDetails('room-1');

            expect(result.roomId).toBe('room-1');
            expect(result.name).toBe('Room 1');
        });

        it("should throw error if room not found", async () => {
            (PRISMA_DB_CLIENT.room.findUnique as jest.Mock).mockResolvedValue(null);

            await expect(adminService.getRoomDetails('invalid-room'))
                .rejects.toThrow("Room not found");
        });
    });
});

describe("AdminService - Capacity Management", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("getCapacityHistory", () => {
        it("should return capacity events with summary", async () => {
            const mockEvents = [
                {
                    roomId: 'room-1',
                    eventType: 'CAPACITY_REACHED',
                    occupancyAtEvent: 50,
                    timestamp: new Date(),
                    duration: 600,
                    room: { id: 'room-1', name: 'Room 1' }
                },
                {
                    roomId: 'room-1',
                    eventType: 'JOIN_REJECTED',
                    occupancyAtEvent: 50,
                    timestamp: new Date(),
                    duration: null,
                    room: { id: 'room-1', name: 'Room 1' }
                }
            ];

            (PRISMA_DB_CLIENT.capacityEvent.findMany as jest.Mock).mockResolvedValue(mockEvents);

            const result = await adminService.getCapacityHistory('room-1', 7);

            expect(result.summary).toHaveLength(1);
            expect(result.summary[0].capacityReached).toBe(1);
            expect(result.summary[0].joinRejected).toBe(1);
            expect(result.events).toHaveLength(2);
        });
    });

    describe("getPeakUsageSlots", () => {
        it("should identify peak hours and days", async () => {
            const mockEvents = [
                { timestamp: new Date('2024-01-15T14:00:00'), roomId: 'room-1' },
                { timestamp: new Date('2024-01-15T14:30:00'), roomId: 'room-1' },
                { timestamp: new Date('2024-01-15T15:00:00'), roomId: 'room-2' }
            ];

            (PRISMA_DB_CLIENT.capacityEvent.findMany as jest.Mock).mockResolvedValue(mockEvents);

            const result = await adminService.getPeakUsageSlots(30);

            expect(result.hourlyDistribution).toBeDefined();
            expect(result.dayDistribution).toBeDefined();
            expect(result.peakHour).toBeDefined();
            expect(result.peakDay).toBeDefined();
        });
    });
});

describe("AdminService - Moderation", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("muteUser", () => {
        it("should create mute action and log audit", async () => {
            const mockAction = {
                id: 'action-1',
                targetUserId: 1,
                roomId: 'room-1',
                actionType: 'MUTE',
                reason: 'Spam',
                performedBy: 2,
                performedAt: new Date(),
                expiresAt: null,
                isActive: true,
                targetUser: {
                    email: 'user@test.com',
                    firstName: 'John',
                    lastName: 'Doe'
                }
            };

            (PRISMA_DB_CLIENT.moderationAction.create as jest.Mock).mockResolvedValue(mockAction);
            (PRISMA_DB_CLIENT.user.findUnique as jest.Mock).mockResolvedValue({ role: 'SUPER_ADMIN' });
            (PRISMA_DB_CLIENT.auditLog.create as jest.Mock).mockResolvedValue({});

            const result = await adminService.muteUser(1, 'room-1', 2, 'Spam');

            expect(result.actionType).toBe('MUTE');
            expect(PRISMA_DB_CLIENT.moderationAction.create).toHaveBeenCalled();
            expect(PRISMA_DB_CLIENT.auditLog.create).toHaveBeenCalled();
        });
    });

    describe("banUser", () => {
        it("should ban user and remove from all rooms", async () => {
            const mockAction = {
                id: 'action-1',
                targetUserId: 1,
                actionType: 'BAN',
                reason: 'Violation',
                performedBy: 2,
                performedAt: new Date(),
                expiresAt: null,
                isActive: true,
                targetUser: {
                    email: 'user@test.com'
                }
            };

            (PRISMA_DB_CLIENT.moderationAction.create as jest.Mock).mockResolvedValue(mockAction);
            (PRISMA_DB_CLIENT.userPresence.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });
            (PRISMA_DB_CLIENT.user.findUnique as jest.Mock).mockResolvedValue({ role: 'SUPER_ADMIN' });
            (PRISMA_DB_CLIENT.auditLog.create as jest.Mock).mockResolvedValue({});

            const result = await adminService.banUser(1, 2, 'Violation');

            expect(result.actionType).toBe('BAN');
            expect(PRISMA_DB_CLIENT.userPresence.deleteMany).toHaveBeenCalledWith({
                where: { userId: 1 }
            });
        });
    });
});

describe("AdminService - Room Controls", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("lockRoom", () => {
        it("should lock room and create audit log", async () => {
            const mockRoom = {
                id: 'room-1',
                name: 'Room 1',
                isLocked: true
            };

            (PRISMA_DB_CLIENT.room.update as jest.Mock).mockResolvedValue(mockRoom);
            (PRISMA_DB_CLIENT.user.findUnique as jest.Mock).mockResolvedValue({ role: 'SUPER_ADMIN' });
            (PRISMA_DB_CLIENT.auditLog.create as jest.Mock).mockResolvedValue({});

            const result = await adminService.lockRoom('room-1', 1, 'Maintenance');

            expect(result.isLocked).toBe(true);
            expect(PRISMA_DB_CLIENT.room.update).toHaveBeenCalledWith({
                where: { id: 'room-1' },
                data: { isLocked: true }
            });
        });
    });

    describe("clearRoomChat", () => {
        it("should delete all messages and log action", async () => {
            (PRISMA_DB_CLIENT.message.deleteMany as jest.Mock).mockResolvedValue({ count: 50 });
            (PRISMA_DB_CLIENT.user.findUnique as jest.Mock).mockResolvedValue({ role: 'SUPER_ADMIN' });
            (PRISMA_DB_CLIENT.auditLog.create as jest.Mock).mockResolvedValue({});

            const result = await adminService.clearRoomChat('room-1', 1);

            expect(result.count).toBe(50);
            expect(PRISMA_DB_CLIENT.message.deleteMany).toHaveBeenCalledWith({
                where: { roomId: 'room-1' }
            });
        });
    });

    describe("removeAllUsersFromRoom", () => {
        it("should remove all users and update occupancy", async () => {
            (PRISMA_DB_CLIENT.userPresence.deleteMany as jest.Mock).mockResolvedValue({ count: 10 });
            (PRISMA_DB_CLIENT.room.update as jest.Mock).mockResolvedValue({});
            (PRISMA_DB_CLIENT.user.findUnique as jest.Mock).mockResolvedValue({ role: 'SUPER_ADMIN' });
            (PRISMA_DB_CLIENT.auditLog.create as jest.Mock).mockResolvedValue({});

            const result = await adminService.removeAllUsersFromRoom('room-1', 1, 'Emergency');

            expect(result.count).toBe(10);
            expect(PRISMA_DB_CLIENT.room.update).toHaveBeenCalledWith({
                where: { id: 'room-1' },
                data: { currentOccupancy: 0 }
            });
        });
    });
});

describe("AdminService - System Health", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("getSystemHealth", () => {
        it("should return current system health metrics", async () => {
            (PRISMA_DB_CLIENT.userPresence.count as jest.Mock).mockResolvedValue(50);
            (PRISMA_DB_CLIENT.systemMetrics.findMany as jest.Mock).mockResolvedValue([
                {
                    timestamp: new Date(),
                    activeSocketConnections: 50,
                    failedConnections: 2,
                    avgApiResponseTime: 150,
                    errorRate4xx: 1.5,
                    errorRate5xx: 0.2,
                    timerDesyncEvents: 0
                }
            ]);
            (PRISMA_DB_CLIENT.systemMetrics.aggregate as jest.Mock).mockResolvedValue({
                _avg: {
                    avgApiResponseTime: 150,
                    errorRate4xx: 1.5,
                    errorRate5xx: 0.2
                }
            });

            const result = await adminService.getSystemHealth();

            expect(result.connections.active).toBe(50);
            expect(result.performance.avgResponseTime).toBe(150);
        });
    });

    describe("getSystemAlerts", () => {
        it("should detect rooms at capacity", async () => {
            (PRISMA_DB_CLIENT.room.count as jest.Mock).mockResolvedValue(2);
            (PRISMA_DB_CLIENT.systemMetrics.findFirst as jest.Mock).mockResolvedValue(null);

            const result = await adminService.getSystemAlerts();

            expect(result).toHaveLength(1);
            expect(result[0].severity).toBe('warning');
            expect(result[0].message).toContain('2 room(s) at maximum capacity');
        });

        it("should detect high error rates", async () => {
            (PRISMA_DB_CLIENT.room.count as jest.Mock).mockResolvedValue(0);
            (PRISMA_DB_CLIENT.systemMetrics.findFirst as jest.Mock).mockResolvedValue({
                timestamp: new Date(),
                errorRate5xx: 6.5,
                failedConnections: 15,
                timerDesyncEvents: 3
            });

            const result = await adminService.getSystemAlerts();

            expect(result.length).toBeGreaterThan(0);
            expect(result.some(a => a.message.includes('server error rate'))).toBe(true);
        });
    });
});
