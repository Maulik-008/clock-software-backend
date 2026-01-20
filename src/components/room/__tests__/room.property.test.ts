/**
 * Property-Based Tests for Shared Study Rooms
 * Feature: shared-study-rooms
 * 
 * These tests validate correctness properties using fast-check
 * to ensure universal properties hold across all inputs.
 */

import fc from 'fast-check';
import { PrismaClient } from '../../../../prisma/src/generated/client';
import { RoomService } from '../room.service';

const prisma = new PrismaClient();
const roomService = new RoomService();

/**
 * Property 2: Available Spots Calculation
 * 
 * **Validates: Requirements 1.3**
 * 
 * For any room with capacity C and current_occupancy O, 
 * the calculated available_spots should equal (C - O).
 */
describe('Property 2: Available Spots Calculation', () => {
  // Feature: shared-study-rooms, Property 2: Available spots calculation

  it('should calculate available spots as (capacity - occupancy) for all rooms', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }), // capacity
        fc.integer({ min: 0, max: 100 }), // occupancy
        (capacity, occupancy) => {
          // Precondition: occupancy should not exceed capacity
          fc.pre(occupancy <= capacity);
          
          const availableSpots = roomService.calculateAvailableSpots(capacity, occupancy);
          
          // Property: available spots should always equal (capacity - occupancy)
          expect(availableSpots).toBe(capacity - occupancy);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return 0 when room is at full capacity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }), // capacity
        (capacity) => {
          const occupancy = capacity; // Full capacity
          const availableSpots = roomService.calculateAvailableSpots(capacity, occupancy);
          
          // Property: available spots should be 0 when full
          expect(availableSpots).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return capacity when room is empty', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }), // capacity
        (capacity) => {
          const occupancy = 0; // Empty room
          const availableSpots = roomService.calculateAvailableSpots(capacity, occupancy);
          
          // Property: available spots should equal capacity when empty
          expect(availableSpots).toBe(capacity);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should never return negative values even if occupancy exceeds capacity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }), // capacity
        fc.integer({ min: 0, max: 200 }), // occupancy (can exceed capacity)
        (capacity, occupancy) => {
          const availableSpots = roomService.calculateAvailableSpots(capacity, occupancy);
          
          // Property: available spots should never be negative
          expect(availableSpots).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 25: Room Default Values
 * 
 * **Validates: Requirements 8.6, 8.7**
 * 
 * For any newly created room, the capacity should default to 50 
 * and current_occupancy should default to 0.
 */
describe('Property 25: Room Default Values', () => {
  // Feature: shared-study-rooms, Property 25: Room Default Values
  
  afterAll(async () => {
    // Cleanup: Remove test rooms created during testing
    await prisma.room.deleteMany({
      where: {
        name: {
          startsWith: 'Test Room Property 25 -'
        }
      }
    });
    await prisma.$disconnect();
  });

  it('should default capacity to 50 and currentOccupancy to 0 for any newly created room', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary room names to test the property
        fc.string({ minLength: 1, maxLength: 50 }).map(s => `Test Room Property 25 - ${s}`),
        async (roomName) => {
          // Create a new room without explicitly setting capacity or currentOccupancy
          const room = await prisma.room.create({
            data: {
              name: roomName
            }
          });

          try {
            // Verify the default values
            expect(room.capacity).toBe(50);
            expect(room.currentOccupancy).toBe(0);
          } finally {
            // Cleanup: Delete the test room
            await prisma.room.delete({
              where: { id: room.id }
            });
          }
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design document
    );
  });

  it('should maintain default values even when explicitly creating room with only name', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).map(s => `Test Room Property 25 Explicit - ${s}`),
        async (roomName) => {
          // Create room with only name specified
          const room = await prisma.room.create({
            data: {
              name: roomName
            },
            select: {
              id: true,
              name: true,
              capacity: true,
              currentOccupancy: true,
              createdAt: true
            }
          });

          try {
            // Verify defaults are applied
            expect(room.capacity).toBe(50);
            expect(room.currentOccupancy).toBe(0);
            expect(room.name).toBe(roomName);
            expect(room.createdAt).toBeInstanceOf(Date);
          } finally {
            // Cleanup
            await prisma.room.delete({
              where: { id: room.id }
            });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow overriding defaults when explicitly provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).map(s => `Test Room Property 25 Override - ${s}`),
        fc.integer({ min: 1, max: 100 }), // Custom capacity
        fc.integer({ min: 0, max: 100 }), // Custom occupancy
        async (roomName, customCapacity, customOccupancy) => {
          // Precondition: occupancy should not exceed capacity
          fc.pre(customOccupancy <= customCapacity);

          // Create room with explicit values
          const room = await prisma.room.create({
            data: {
              name: roomName,
              capacity: customCapacity,
              currentOccupancy: customOccupancy
            }
          });

          try {
            // Verify explicit values are used instead of defaults
            expect(room.capacity).toBe(customCapacity);
            expect(room.currentOccupancy).toBe(customOccupancy);
          } finally {
            // Cleanup
            await prisma.room.delete({
              where: { id: room.id }
            });
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Helper function to run tests
 * This allows running the tests with ts-node
 */
if (require.main === module) {
  console.log('Running Property 25: Room Default Values tests...');
  console.log('Note: This requires a test runner like Jest to execute properly.');
  console.log('Please run: npm test');
}
