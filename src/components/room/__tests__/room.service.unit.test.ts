/**
 * Unit Tests for Room Service
 * Feature: shared-study-rooms
 * 
 * These tests validate specific examples and edge cases for the room service.
 */

import { PrismaClient } from '../../../../prisma/src/generated/client';
import { RoomService } from '../room.service';

const prisma = new PrismaClient();
const roomService = new RoomService();

describe('RoomService', () => {
  let testRoomId: string;
  let testUserId: number;

  beforeAll(async () => {
    // Create a test user
    const user = await prisma.user.create({
      data: {
        email: `test-room-service-${Date.now()}@example.com`,
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User',
      },
    });
    testUserId = user.id;

    // Create a test room
    const room = await prisma.room.create({
      data: {
        name: `Test Room Service ${Date.now()}`,
        capacity: 50,
        currentOccupancy: 0,
      },
    });
    testRoomId = room.id;
  });

  afterAll(async () => {
    // Cleanup: Remove test data
    await prisma.participant.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.sessionLog.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.room.deleteMany({
      where: { id: testRoomId },
    });
    await prisma.user.delete({
      where: { id: testUserId },
    });
    await prisma.$disconnect();
  });

  describe('getRooms', () => {
    it('should return all rooms with occupancy information', async () => {
      const rooms = await roomService.getRooms();

      expect(rooms).toBeDefined();
      expect(Array.isArray(rooms)).toBe(true);
      expect(rooms.length).toBeGreaterThan(0);

      // Verify each room has required fields
      rooms.forEach(room => {
        expect(room).toHaveProperty('id');
        expect(room).toHaveProperty('name');
        expect(room).toHaveProperty('capacity');
        expect(room).toHaveProperty('currentOccupancy');
        expect(room).toHaveProperty('availableSpots');
        expect(typeof room.id).toBe('string');
        expect(typeof room.name).toBe('string');
        expect(typeof room.capacity).toBe('number');
        expect(typeof room.currentOccupancy).toBe('number');
        expect(typeof room.availableSpots).toBe('number');
      });
    });

    it('should return rooms ordered by name', async () => {
      const rooms = await roomService.getRooms();

      // Verify rooms are sorted by name
      for (let i = 1; i < rooms.length; i++) {
        expect(rooms[i].name.localeCompare(rooms[i - 1].name)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('calculateAvailableSpots', () => {
    it('should calculate available spots correctly', () => {
      expect(roomService.calculateAvailableSpots(50, 0)).toBe(50);
      expect(roomService.calculateAvailableSpots(50, 25)).toBe(25);
      expect(roomService.calculateAvailableSpots(50, 50)).toBe(0);
    });

    it('should never return negative available spots', () => {
      expect(roomService.calculateAvailableSpots(50, 60)).toBe(0);
      expect(roomService.calculateAvailableSpots(50, 100)).toBe(0);
    });

    it('should handle edge cases', () => {
      expect(roomService.calculateAvailableSpots(0, 0)).toBe(0);
      expect(roomService.calculateAvailableSpots(1, 0)).toBe(1);
      expect(roomService.calculateAvailableSpots(1, 1)).toBe(0);
    });
  });

  describe('joinRoom', () => {
    it('should successfully join a room with available capacity', async () => {
      const result = await roomService.joinRoom(testUserId, testRoomId);

      expect(result.success).toBe(true);
      expect(result.participantId).toBeDefined();
      expect(typeof result.participantId).toBe('string');
      expect(result.room.id).toBe(testRoomId);
      expect(result.room.currentOccupancy).toBe(1);

      // Verify participant record was created
      const participant = await prisma.participant.findUnique({
        where: {
          userId_roomId: {
            userId: testUserId,
            roomId: testRoomId,
          },
        },
      });

      expect(participant).toBeDefined();
      expect(participant?.status).toBe('ACTIVE');

      // Cleanup
      await roomService.leaveRoom(testUserId, testRoomId);
    });

    it('should increment occupancy counter atomically', async () => {
      const roomBefore = await prisma.room.findUnique({
        where: { id: testRoomId },
        select: { currentOccupancy: true },
      });

      await roomService.joinRoom(testUserId, testRoomId);

      const roomAfter = await prisma.room.findUnique({
        where: { id: testRoomId },
        select: { currentOccupancy: true },
      });

      expect(roomAfter?.currentOccupancy).toBe((roomBefore?.currentOccupancy || 0) + 1);

      // Cleanup
      await roomService.leaveRoom(testUserId, testRoomId);
    });

    it('should throw error if room does not exist', async () => {
      const nonExistentRoomId = '00000000-0000-0000-0000-000000000000';

      await expect(
        roomService.joinRoom(testUserId, nonExistentRoomId)
      ).rejects.toThrow('Room not found');
    });

    it('should throw error if user is already a participant', async () => {
      await roomService.joinRoom(testUserId, testRoomId);

      await expect(
        roomService.joinRoom(testUserId, testRoomId)
      ).rejects.toThrow('User is already a participant in this room');

      // Cleanup
      await roomService.leaveRoom(testUserId, testRoomId);
    });

    it('should throw error if room is at full capacity', async () => {
      // Create a room with capacity 1
      const smallRoom = await prisma.room.create({
        data: {
          name: `Small Room ${Date.now()}`,
          capacity: 1,
          currentOccupancy: 0,
        },
      });

      // Create another test user
      const user2 = await prisma.user.create({
        data: {
          email: `test-user-2-${Date.now()}@example.com`,
          password: 'hashedpassword',
          firstName: 'Test',
          lastName: 'User2',
        },
      });

      try {
        // First user joins successfully
        await roomService.joinRoom(testUserId, smallRoom.id);

        // Second user should be rejected
        await expect(
          roomService.joinRoom(user2.id, smallRoom.id)
        ).rejects.toThrow('Room is at full capacity');
      } finally {
        // Cleanup
        await prisma.participant.deleteMany({
          where: { roomId: smallRoom.id },
        });
        await prisma.sessionLog.deleteMany({
          where: { roomId: smallRoom.id },
        });
        await prisma.room.delete({
          where: { id: smallRoom.id },
        });
        await prisma.user.delete({
          where: { id: user2.id },
        });
      }
    });
  });

  describe('leaveRoom', () => {
    beforeEach(async () => {
      // Ensure user is not in the room before each test
      const participant = await prisma.participant.findUnique({
        where: {
          userId_roomId: {
            userId: testUserId,
            roomId: testRoomId,
          },
        },
      });

      if (participant) {
        await roomService.leaveRoom(testUserId, testRoomId);
      }
    });

    it('should successfully leave a room', async () => {
      // First join the room
      await roomService.joinRoom(testUserId, testRoomId);

      // Then leave
      const result = await roomService.leaveRoom(testUserId, testRoomId);

      expect(result.success).toBe(true);
      expect(result.sessionDuration).toBeGreaterThanOrEqual(0);
      expect(result.room.id).toBe(testRoomId);

      // Verify participant record was removed
      const participant = await prisma.participant.findUnique({
        where: {
          userId_roomId: {
            userId: testUserId,
            roomId: testRoomId,
          },
        },
      });

      expect(participant).toBeNull();
    });

    it('should decrement occupancy counter', async () => {
      await roomService.joinRoom(testUserId, testRoomId);

      const roomBefore = await prisma.room.findUnique({
        where: { id: testRoomId },
        select: { currentOccupancy: true },
      });

      await roomService.leaveRoom(testUserId, testRoomId);

      const roomAfter = await prisma.room.findUnique({
        where: { id: testRoomId },
        select: { currentOccupancy: true },
      });

      expect(roomAfter?.currentOccupancy).toBe((roomBefore?.currentOccupancy || 1) - 1);
    });

    it('should create session log entry', async () => {
      await roomService.joinRoom(testUserId, testRoomId);

      const sessionLogsBefore = await prisma.sessionLog.count({
        where: {
          userId: testUserId,
          roomId: testRoomId,
        },
      });

      await roomService.leaveRoom(testUserId, testRoomId);

      const sessionLogsAfter = await prisma.sessionLog.count({
        where: {
          userId: testUserId,
          roomId: testRoomId,
        },
      });

      expect(sessionLogsAfter).toBe(sessionLogsBefore + 1);

      // Verify session log has correct data
      const sessionLog = await prisma.sessionLog.findFirst({
        where: {
          userId: testUserId,
          roomId: testRoomId,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      expect(sessionLog).toBeDefined();
      expect(sessionLog?.duration).toBeGreaterThanOrEqual(0);
      expect(sessionLog?.userId).toBe(testUserId);
      expect(sessionLog?.roomId).toBe(testRoomId);
    });

    it('should calculate session duration correctly', async () => {
      await roomService.joinRoom(testUserId, testRoomId);

      // Wait a bit to ensure some time passes
      await new Promise(resolve => setTimeout(resolve, 100));

      const result = await roomService.leaveRoom(testUserId, testRoomId);

      expect(result.sessionDuration).toBeGreaterThanOrEqual(0);
      expect(result.sessionDuration).toBeLessThan(10); // Should be less than 10 seconds
    });

    it('should throw error if user is not a participant', async () => {
      await expect(
        roomService.leaveRoom(testUserId, testRoomId)
      ).rejects.toThrow('User is not a participant in this room');
    });

    it('should ensure occupancy never goes below zero', async () => {
      // Create a room with occupancy already at 0
      const emptyRoom = await prisma.room.create({
        data: {
          name: `Empty Room ${Date.now()}`,
          capacity: 50,
          currentOccupancy: 0,
        },
      });

      try {
        // Join and leave
        await roomService.joinRoom(testUserId, emptyRoom.id);
        await roomService.leaveRoom(testUserId, emptyRoom.id);

        // Verify occupancy is 0, not negative
        const room = await prisma.room.findUnique({
          where: { id: emptyRoom.id },
          select: { currentOccupancy: true },
        });

        expect(room?.currentOccupancy).toBe(0);
      } finally {
        // Cleanup
        await prisma.sessionLog.deleteMany({
          where: { roomId: emptyRoom.id },
        });
        await prisma.room.delete({
          where: { id: emptyRoom.id },
        });
      }
    });
  });

  describe('getRoomById', () => {
    it('should return room with occupancy information', async () => {
      const room = await roomService.getRoomById(testRoomId);

      expect(room).toBeDefined();
      expect(room?.id).toBe(testRoomId);
      expect(room).toHaveProperty('name');
      expect(room).toHaveProperty('capacity');
      expect(room).toHaveProperty('currentOccupancy');
      expect(room).toHaveProperty('availableSpots');
    });

    it('should return null for non-existent room', async () => {
      const nonExistentRoomId = '00000000-0000-0000-0000-000000000000';
      const room = await roomService.getRoomById(nonExistentRoomId);

      expect(room).toBeNull();
    });

    it('should calculate available spots correctly', async () => {
      const room = await roomService.getRoomById(testRoomId);

      expect(room?.availableSpots).toBe(
        room!.capacity - room!.currentOccupancy
      );
    });
  });

  describe('isParticipant', () => {
    beforeEach(async () => {
      // Ensure user is not in the room before each test
      const participant = await prisma.participant.findUnique({
        where: {
          userId_roomId: {
            userId: testUserId,
            roomId: testRoomId,
          },
        },
      });

      if (participant) {
        await roomService.leaveRoom(testUserId, testRoomId);
      }
    });

    it('should return true if user is a participant', async () => {
      await roomService.joinRoom(testUserId, testRoomId);

      const isParticipant = await roomService.isParticipant(testUserId, testRoomId);

      expect(isParticipant).toBe(true);

      // Cleanup
      await roomService.leaveRoom(testUserId, testRoomId);
    });

    it('should return false if user is not a participant', async () => {
      const isParticipant = await roomService.isParticipant(testUserId, testRoomId);

      expect(isParticipant).toBe(false);
    });
  });

  describe('getRoomParticipants', () => {
    beforeEach(async () => {
      // Ensure user is not in the room before each test
      const participant = await prisma.participant.findUnique({
        where: {
          userId_roomId: {
            userId: testUserId,
            roomId: testRoomId,
          },
        },
      });

      if (participant) {
        await roomService.leaveRoom(testUserId, testRoomId);
      }
    });

    it('should return empty array for room with no participants', async () => {
      const participants = await roomService.getRoomParticipants(testRoomId);

      expect(Array.isArray(participants)).toBe(true);
      expect(participants.length).toBe(0);
    });

    it('should return all participants in a room', async () => {
      await roomService.joinRoom(testUserId, testRoomId);

      const participants = await roomService.getRoomParticipants(testRoomId);

      expect(participants.length).toBe(1);
      expect(participants[0].userId).toBe(testUserId);
      expect(participants[0]).toHaveProperty('id');
      expect(participants[0]).toHaveProperty('userName');
      expect(participants[0]).toHaveProperty('joinedAt');
      expect(participants[0]).toHaveProperty('status');

      // Cleanup
      await roomService.leaveRoom(testUserId, testRoomId);
    });

    it('should return participants ordered by join time', async () => {
      // Create another test user
      const user2 = await prisma.user.create({
        data: {
          email: `test-user-order-${Date.now()}@example.com`,
          password: 'hashedpassword',
          firstName: 'Test',
          lastName: 'User2',
        },
      });

      try {
        await roomService.joinRoom(testUserId, testRoomId);
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
        await roomService.joinRoom(user2.id, testRoomId);

        const participants = await roomService.getRoomParticipants(testRoomId);

        expect(participants.length).toBe(2);
        expect(participants[0].userId).toBe(testUserId);
        expect(participants[1].userId).toBe(user2.id);
        expect(participants[0].joinedAt.getTime()).toBeLessThan(
          participants[1].joinedAt.getTime()
        );
      } finally {
        // Cleanup
        await prisma.participant.deleteMany({
          where: { roomId: testRoomId },
        });
        await prisma.sessionLog.deleteMany({
          where: { userId: user2.id },
        });
        await prisma.room.update({
          where: { id: testRoomId },
          data: { currentOccupancy: 0 },
        });
        await prisma.user.delete({
          where: { id: user2.id },
        });
      }
    });
  });

  describe('getParticipantCount', () => {
    beforeEach(async () => {
      // Ensure user is not in the room before each test
      const participant = await prisma.participant.findUnique({
        where: {
          userId_roomId: {
            userId: testUserId,
            roomId: testRoomId,
          },
        },
      });

      if (participant) {
        await roomService.leaveRoom(testUserId, testRoomId);
      }
    });

    it('should return 0 for room with no participants', async () => {
      const count = await roomService.getParticipantCount(testRoomId);

      expect(count).toBe(0);
    });

    it('should return correct participant count', async () => {
      await roomService.joinRoom(testUserId, testRoomId);

      const count = await roomService.getParticipantCount(testRoomId);

      expect(count).toBe(1);

      // Cleanup
      await roomService.leaveRoom(testUserId, testRoomId);
    });

    it('should update count when participants join and leave', async () => {
      let count = await roomService.getParticipantCount(testRoomId);
      expect(count).toBe(0);

      await roomService.joinRoom(testUserId, testRoomId);
      count = await roomService.getParticipantCount(testRoomId);
      expect(count).toBe(1);

      await roomService.leaveRoom(testUserId, testRoomId);
      count = await roomService.getParticipantCount(testRoomId);
      expect(count).toBe(0);
    });
  });
});
