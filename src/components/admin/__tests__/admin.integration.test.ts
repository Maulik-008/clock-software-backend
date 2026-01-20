/**
 * Integration tests for Super Admin functionality
 * These tests verify the complete flow from API to database
 */

import request from 'supertest';
import app from '../../../app';
import { PRISMA_DB_CLIENT } from '../../../prisma';
import { JwtService } from '../../../utils/jwt';

describe('Admin API Integration Tests', () => {
    let superAdminToken: string;
    let studentToken: string;
    let superAdminId: number;
    let studentId: number;
    let testRoomId: string;

    beforeAll(async () => {
        // Create test super admin
        const superAdmin = await PRISMA_DB_CLIENT.user.create({
            data: {
                email: 'superadmin@test.com',
                password: 'hashedpassword',
                role: 'SUPER_ADMIN',
                isEmailVerified: true
            }
        });
        superAdminId = superAdmin.id;
        superAdminToken = JwtService.generateAccessToken(superAdminId, superAdmin.email);

        // Create test student
        const student = await PRISMA_DB_CLIENT.user.create({
            data: {
                email: 'student@test.com',
                password: 'hashedpassword',
                role: 'STUDENT',
                isEmailVerified: true
            }
        });
        studentId = student.id;
        studentToken = JwtService.generateAccessToken(studentId, student.email);

        // Create test room
        const room = await PRISMA_DB_CLIENT.room.create({
            data: {
                name: 'Test Room',
                capacity: 50,
                currentOccupancy: 0
            }
        });
        testRoomId = room.id;

        // Create room state
        await PRISMA_DB_CLIENT.roomState.create({
            data: {
                roomId: testRoomId,
                currentOccupancy: 0,
                activeUsers: []
            }
        });
    });

    afterAll(async () => {
        // Cleanup
        await PRISMA_DB_CLIENT.auditLog.deleteMany({});
        await PRISMA_DB_CLIENT.moderationAction.deleteMany({});
        await PRISMA_DB_CLIENT.userPresence.deleteMany({});
        await PRISMA_DB_CLIENT.roomState.deleteMany({});
        await PRISMA_DB_CLIENT.room.deleteMany({});
        await PRISMA_DB_CLIENT.user.deleteMany({});
        await PRISMA_DB_CLIENT.$disconnect();
    });

    describe('Authentication & Authorization', () => {
        it('should reject requests without token', async () => {
            const response = await request(app)
                .get('/api/admin/analytics/platform/summary');

            expect(response.status).toBe(401);
        });

        it('should reject requests from non-admin users', async () => {
            const response = await request(app)
                .get('/api/admin/analytics/platform/summary')
                .set('Authorization', `Bearer ${studentToken}`);

            expect(response.status).toBe(403);
        });

        it('should allow requests from super admin', async () => {
            const response = await request(app)
                .get('/api/admin/analytics/platform/summary')
                .set('Authorization', `Bearer ${superAdminToken}`);

            expect(response.status).toBe(200);
        });
    });

    describe('Platform Analytics', () => {
        it('should get platform summary', async () => {
            const response = await request(app)
                .get('/api/admin/analytics/platform/summary')
                .set('Authorization', `Bearer ${superAdminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('users');
            expect(response.body.data).toHaveProperty('sessions');
            expect(response.body.data).toHaveProperty('rooms');
        });

        it('should get platform trends with custom days', async () => {
            const response = await request(app)
                .get('/api/admin/analytics/platform/trends?days=7')
                .set('Authorization', `Bearer ${superAdminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should reject invalid days parameter', async () => {
            const response = await request(app)
                .get('/api/admin/analytics/platform/trends?days=500')
                .set('Authorization', `Bearer ${superAdminToken}`);

            expect(response.status).toBe(400);
        });
    });

    describe('Room Analytics', () => {
        it('should get all rooms analytics', async () => {
            const response = await request(app)
                .get('/api/admin/analytics/rooms')
                .set('Authorization', `Bearer ${superAdminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should get specific room analytics', async () => {
            const response = await request(app)
                .get(`/api/admin/analytics/rooms/${testRoomId}`)
                .set('Authorization', `Bearer ${superAdminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.roomId).toBe(testRoomId);
        });
    });

    describe('Live Monitoring', () => {
        beforeEach(async () => {
            // Add a user to the room
            await PRISMA_DB_CLIENT.userPresence.create({
                data: {
                    userId: studentId,
                    roomId: testRoomId,
                    cameraOn: true,
                    micOn: false,
                    lastActivityAt: new Date()
                }
            });

            await PRISMA_DB_CLIENT.room.update({
                where: { id: testRoomId },
                data: { currentOccupancy: 1 }
            });
        });

        afterEach(async () => {
            await PRISMA_DB_CLIENT.userPresence.deleteMany({});
            await PRISMA_DB_CLIENT.room.update({
                where: { id: testRoomId },
                data: { currentOccupancy: 0 }
            });
        });

        it('should get live room monitoring', async () => {
            const response = await request(app)
                .get('/api/admin/monitoring/rooms')
                .set('Authorization', `Bearer ${superAdminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBeGreaterThan(0);
            expect(response.body.data[0]).toHaveProperty('users');
        });

        it('should get room details', async () => {
            const response = await request(app)
                .get(`/api/admin/monitoring/rooms/${testRoomId}`)
                .set('Authorization', `Bearer ${superAdminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.roomId).toBe(testRoomId);
            expect(response.body.data.users.length).toBe(1);
        });
    });

    describe('Moderation Actions', () => {
        it('should mute a user', async () => {
            const response = await request(app)
                .post('/api/admin/moderation/mute')
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({
                    userId: studentId,
                    roomId: testRoomId,
                    reason: 'Test mute',
                    duration: 30
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.actionType).toBe('MUTE');

            // Verify audit log was created
            const auditLog = await PRISMA_DB_CLIENT.auditLog.findFirst({
                where: {
                    action: 'USER_MUTED',
                    userId: superAdminId
                }
            });
            expect(auditLog).toBeTruthy();
        });

        it('should kick a user', async () => {
            // First add user to room
            await PRISMA_DB_CLIENT.userPresence.create({
                data: {
                    userId: studentId,
                    roomId: testRoomId,
                    lastActivityAt: new Date()
                }
            });

            const response = await request(app)
                .post('/api/admin/moderation/kick')
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({
                    userId: studentId,
                    roomId: testRoomId,
                    reason: 'Test kick'
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);

            // Verify user was removed from room
            const presence = await PRISMA_DB_CLIENT.userPresence.findFirst({
                where: {
                    userId: studentId,
                    roomId: testRoomId
                }
            });
            expect(presence).toBeNull();
        });

        it('should ban a user', async () => {
            const response = await request(app)
                .post('/api/admin/moderation/ban')
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({
                    userId: studentId,
                    reason: 'Test ban',
                    duration: 7
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.actionType).toBe('BAN');
        });

        it('should unban a user', async () => {
            // First ban the user
            await PRISMA_DB_CLIENT.moderationAction.create({
                data: {
                    targetUserId: studentId,
                    actionType: 'BAN',
                    performedBy: superAdminId,
                    isActive: true
                }
            });

            const response = await request(app)
                .post('/api/admin/moderation/unban')
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({
                    userId: studentId
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });

        it('should get moderation dashboard', async () => {
            const response = await request(app)
                .get('/api/admin/moderation/dashboard')
                .set('Authorization', `Bearer ${superAdminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('summary');
            expect(response.body.data).toHaveProperty('recentActions');
        });
    });

    describe('Room Controls', () => {
        it('should lock a room', async () => {
            const response = await request(app)
                .post(`/api/admin/rooms/${testRoomId}/lock`)
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({ reason: 'Maintenance' });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);

            // Verify room is locked
            const room = await PRISMA_DB_CLIENT.room.findUnique({
                where: { id: testRoomId }
            });
            expect(room?.isLocked).toBe(true);
        });

        it('should unlock a room', async () => {
            // First lock the room
            await PRISMA_DB_CLIENT.room.update({
                where: { id: testRoomId },
                data: { isLocked: true }
            });

            const response = await request(app)
                .post(`/api/admin/rooms/${testRoomId}/unlock`)
                .set('Authorization', `Bearer ${superAdminToken}`);

            expect(response.status).toBe(200);

            // Verify room is unlocked
            const room = await PRISMA_DB_CLIENT.room.findUnique({
                where: { id: testRoomId }
            });
            expect(room?.isLocked).toBe(false);
        });

        it('should clear room chat', async () => {
            // Add some messages
            await PRISMA_DB_CLIENT.message.createMany({
                data: [
                    { roomId: testRoomId, userId: studentId, content: 'Test 1', type: 'TEXT' },
                    { roomId: testRoomId, userId: studentId, content: 'Test 2', type: 'TEXT' }
                ]
            });

            const response = await request(app)
                .delete(`/api/admin/rooms/${testRoomId}/chat`)
                .set('Authorization', `Bearer ${superAdminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.count).toBe(2);

            // Verify messages were deleted
            const messages = await PRISMA_DB_CLIENT.message.findMany({
                where: { roomId: testRoomId }
            });
            expect(messages.length).toBe(0);
        });

        it('should remove all users from room', async () => {
            // Add users to room
            await PRISMA_DB_CLIENT.userPresence.createMany({
                data: [
                    { userId: studentId, roomId: testRoomId, lastActivityAt: new Date() }
                ]
            });

            const response = await request(app)
                .delete(`/api/admin/rooms/${testRoomId}/users`)
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({ reason: 'Emergency' });

            expect(response.status).toBe(200);

            // Verify users were removed
            const presences = await PRISMA_DB_CLIENT.userPresence.findMany({
                where: { roomId: testRoomId }
            });
            expect(presences.length).toBe(0);

            // Verify occupancy was reset
            const room = await PRISMA_DB_CLIENT.room.findUnique({
                where: { id: testRoomId }
            });
            expect(room?.currentOccupancy).toBe(0);
        });
    });

    describe('Audit Logs', () => {
        it('should retrieve audit logs', async () => {
            const response = await request(app)
                .get('/api/admin/audit-logs')
                .set('Authorization', `Bearer ${superAdminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should filter audit logs by user', async () => {
            const response = await request(app)
                .get(`/api/admin/audit-logs?userId=${superAdminId}`)
                .set('Authorization', `Bearer ${superAdminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.every((log: any) => log.user.id === superAdminId)).toBe(true);
        });

        it('should filter audit logs by action', async () => {
            const response = await request(app)
                .get('/api/admin/audit-logs?action=ROOM_LOCKED')
                .set('Authorization', `Bearer ${superAdminToken}`);

            expect(response.status).toBe(200);
        });
    });

    describe('System Health', () => {
        it('should get system health', async () => {
            const response = await request(app)
                .get('/api/admin/system/health')
                .set('Authorization', `Bearer ${superAdminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('connections');
            expect(response.body.data).toHaveProperty('performance');
        });

        it('should get system alerts', async () => {
            const response = await request(app)
                .get('/api/admin/system/alerts')
                .set('Authorization', `Bearer ${superAdminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
        });
    });

    describe('Data Export', () => {
        it('should export room usage as CSV', async () => {
            const response = await request(app)
                .get('/api/admin/export/room-usage')
                .set('Authorization', `Bearer ${superAdminToken}`);

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toContain('text/csv');
        });

        it('should export moderation logs as CSV', async () => {
            const response = await request(app)
                .get('/api/admin/export/moderation-logs')
                .set('Authorization', `Bearer ${superAdminToken}`);

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toContain('text/csv');
        });
    });
});
