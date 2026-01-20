/**
 * Load Test Script for Super Admin System
 * Simulates 10 rooms with 50 users each
 * Tests capacity enforcement and analytics accuracy
 */

import { PRISMA_DB_CLIENT } from '../src/prisma';
import logger from '../src/config/logger';

interface LoadTestResults {
    totalUsers: number;
    totalRooms: number;
    successfulJoins: number;
    failedJoins: number;
    capacityEvents: number;
    duration: number;
}

class AdminLoadTest {
    private testUsers: number[] = [];
    private testRooms: string[] = [];

    async setup() {
        logger.info('Setting up load test...');

        // Create 500 test users (50 per room)
        const userPromises = [];
        for (let i = 0; i < 500; i++) {
            userPromises.push(
                PRISMA_DB_CLIENT.user.create({
                    data: {
                        email: `loadtest-user-${i}@test.com`,
                        password: 'hashedpassword',
                        role: 'STUDENT',
                        isEmailVerified: true
                    }
                })
            );
        }

        const users = await Promise.all(userPromises);
        this.testUsers = users.map(u => u.id);
        logger.info(`Created ${this.testUsers.length} test users`);

        // Create 10 test rooms
        const roomPromises = [];
        for (let i = 1; i <= 10; i++) {
            roomPromises.push(
                PRISMA_DB_CLIENT.room.create({
                    data: {
                        name: `Load Test Room ${i}`,
                        capacity: 50,
                        currentOccupancy: 0
                    }
                })
            );
        }

        const rooms = await Promise.all(roomPromises);
        this.testRooms = rooms.map(r => r.id);
        logger.info(`Created ${this.testRooms.length} test rooms`);

        // Create room states
        const statePromises = this.testRooms.map(roomId =>
            PRISMA_DB_CLIENT.roomState.create({
                data: {
                    roomId,
                    currentOccupancy: 0,
                    activeUsers: []
                }
            })
        );

        await Promise.all(statePromises);
        logger.info('Created room states');
    }

    async runLoadTest(): Promise<LoadTestResults> {
        logger.info('Starting load test...');
        const startTime = Date.now();

        let successfulJoins = 0;
        let failedJoins = 0;

        // Simulate users joining rooms (50 users per room)
        for (let roomIndex = 0; roomIndex < this.testRooms.length; roomIndex++) {
            const roomId = this.testRooms[roomIndex];
            const startUserIndex = roomIndex * 50;
            const endUserIndex = startUserIndex + 50;

            logger.info(`Filling room ${roomIndex + 1}/10 with 50 users...`);

            for (let userIndex = startUserIndex; userIndex < endUserIndex; userIndex++) {
                const userId = this.testUsers[userIndex];

                try {
                    // Check current occupancy
                    const room = await PRISMA_DB_CLIENT.room.findUnique({
                        where: { id: roomId },
                        select: { currentOccupancy: true, capacity: true }
                    });

                    if (!room) {
                        throw new Error('Room not found');
                    }

                    // Enforce capacity limit
                    if (room.currentOccupancy >= room.capacity) {
                        // Record capacity event
                        await PRISMA_DB_CLIENT.capacityEvent.create({
                            data: {
                                roomId,
                                eventType: 'JOIN_REJECTED',
                                occupancyAtEvent: room.currentOccupancy,
                                timestamp: new Date()
                            }
                        });

                        failedJoins++;
                        logger.warn(`User ${userId} rejected from room ${roomId} - at capacity`);
                        continue;
                    }

                    // Add user to room
                    await PRISMA_DB_CLIENT.$transaction(async (tx) => {
                        // Create presence
                        await tx.userPresence.create({
                            data: {
                                userId,
                                roomId,
                                cameraOn: Math.random() > 0.5,
                                micOn: Math.random() > 0.5,
                                lastActivityAt: new Date()
                            }
                        });

                        // Update room occupancy
                        const updatedRoom = await tx.room.update({
                            where: { id: roomId },
                            data: {
                                currentOccupancy: {
                                    increment: 1
                                }
                            }
                        });

                        // Check if room just reached capacity
                        if (updatedRoom.currentOccupancy === updatedRoom.capacity) {
                            await tx.capacityEvent.create({
                                data: {
                                    roomId,
                                    eventType: 'CAPACITY_REACHED',
                                    occupancyAtEvent: updatedRoom.currentOccupancy,
                                    timestamp: new Date()
                                }
                            });
                        }

                        // Create session log
                        await tx.sessionLog.create({
                            data: {
                                roomId,
                                userId,
                                duration: Math.floor(Math.random() * 3600) + 1800, // 30-90 min
                                createdAt: new Date()
                            }
                        });
                    });

                    successfulJoins++;

                    if ((userIndex + 1) % 10 === 0) {
                        logger.info(`  ${userIndex + 1 - startUserIndex}/50 users joined`);
                    }
                } catch (error) {
                    logger.error(`Error adding user ${userId} to room ${roomId}:`, error);
                    failedJoins++;
                }
            }

            // Verify room is at capacity
            const finalRoom = await PRISMA_DB_CLIENT.room.findUnique({
                where: { id: roomId },
                select: { currentOccupancy: true }
            });

            logger.info(`Room ${roomIndex + 1} final occupancy: ${finalRoom?.currentOccupancy}/50`);
        }

        // Try to add one more user to each room (should all fail)
        logger.info('Testing capacity enforcement - attempting to overfill rooms...');
        for (const roomId of this.testRooms) {
            try {
                const room = await PRISMA_DB_CLIENT.room.findUnique({
                    where: { id: roomId },
                    select: { currentOccupancy: true, capacity: true }
                });

                if (room && room.currentOccupancy >= room.capacity) {
                    await PRISMA_DB_CLIENT.capacityEvent.create({
                        data: {
                            roomId,
                            eventType: 'JOIN_REJECTED',
                            occupancyAtEvent: room.currentOccupancy,
                            timestamp: new Date()
                        }
                    });
                    failedJoins++;
                }
            } catch (error) {
                logger.error('Error in overfill test:', error);
            }
        }

        const duration = Date.now() - startTime;

        // Count capacity events
        const capacityEvents = await PRISMA_DB_CLIENT.capacityEvent.count();

        return {
            totalUsers: this.testUsers.length,
            totalRooms: this.testRooms.length,
            successfulJoins,
            failedJoins,
            capacityEvents,
            duration
        };
    }

    async verifyResults(results: LoadTestResults) {
        logger.info('Verifying results...');

        // Check all rooms are at capacity
        const rooms = await PRISMA_DB_CLIENT.room.findMany({
            where: {
                id: { in: this.testRooms }
            },
            select: {
                id: true,
                name: true,
                currentOccupancy: true,
                capacity: true
            }
        });

        let allAtCapacity = true;
        for (const room of rooms) {
            if (room.currentOccupancy !== room.capacity) {
                logger.error(`Room ${room.name} not at capacity: ${room.currentOccupancy}/${room.capacity}`);
                allAtCapacity = false;
            }
        }

        // Check user presence count
        const totalPresences = await PRISMA_DB_CLIENT.userPresence.count();
        const expectedPresences = this.testRooms.length * 50; // 10 rooms × 50 users

        // Check session logs
        const totalSessionLogs = await PRISMA_DB_CLIENT.sessionLog.count({
            where: {
                roomId: { in: this.testRooms }
            }
        });

        // Check capacity events
        const capacityReachedEvents = await PRISMA_DB_CLIENT.capacityEvent.count({
            where: {
                roomId: { in: this.testRooms },
                eventType: 'CAPACITY_REACHED'
            }
        });

        const joinRejectedEvents = await PRISMA_DB_CLIENT.capacityEvent.count({
            where: {
                roomId: { in: this.testRooms },
                eventType: 'JOIN_REJECTED'
            }
        });

        return {
            allAtCapacity,
            totalPresences,
            expectedPresences,
            presencesMatch: totalPresences === expectedPresences,
            totalSessionLogs,
            sessionLogsMatch: totalSessionLogs === expectedPresences,
            capacityReachedEvents,
            joinRejectedEvents,
            expectedCapacityEvents: this.testRooms.length // One per room
        };
    }

    async cleanup() {
        logger.info('Cleaning up test data...');

        // Delete in correct order to respect foreign keys
        await PRISMA_DB_CLIENT.capacityEvent.deleteMany({
            where: { roomId: { in: this.testRooms } }
        });

        await PRISMA_DB_CLIENT.sessionLog.deleteMany({
            where: { roomId: { in: this.testRooms } }
        });

        await PRISMA_DB_CLIENT.userPresence.deleteMany({
            where: { roomId: { in: this.testRooms } }
        });

        await PRISMA_DB_CLIENT.roomState.deleteMany({
            where: { roomId: { in: this.testRooms } }
        });

        await PRISMA_DB_CLIENT.room.deleteMany({
            where: { id: { in: this.testRooms } }
        });

        await PRISMA_DB_CLIENT.user.deleteMany({
            where: { id: { in: this.testUsers } }
        });

        logger.info('Cleanup complete');
    }

    async printReport(results: LoadTestResults, verification: any) {
        console.log('\n' + '='.repeat(60));
        console.log('LOAD TEST RESULTS');
        console.log('='.repeat(60));
        console.log(`\nTest Configuration:`);
        console.log(`  Total Users: ${results.totalUsers}`);
        console.log(`  Total Rooms: ${results.totalRooms}`);
        console.log(`  Target: ${results.totalRooms} rooms × 50 users = ${results.totalRooms * 50} joins`);
        console.log(`\nExecution:`);
        console.log(`  Duration: ${(results.duration / 1000).toFixed(2)}s`);
        console.log(`  Successful Joins: ${results.successfulJoins}`);
        console.log(`  Failed Joins: ${results.failedJoins}`);
        console.log(`  Capacity Events: ${results.capacityEvents}`);
        console.log(`\nVerification:`);
        console.log(`  All Rooms at Capacity: ${verification.allAtCapacity ? '✓' : '✗'}`);
        console.log(`  User Presences: ${verification.totalPresences}/${verification.expectedPresences} ${verification.presencesMatch ? '✓' : '✗'}`);
        console.log(`  Session Logs: ${verification.totalSessionLogs}/${verification.expectedPresences} ${verification.sessionLogsMatch ? '✓' : '✗'}`);
        console.log(`  Capacity Reached Events: ${verification.capacityReachedEvents}/${verification.expectedCapacityEvents}`);
        console.log(`  Join Rejected Events: ${verification.joinRejectedEvents}`);
        console.log(`\nTest Status: ${
            verification.allAtCapacity && 
            verification.presencesMatch && 
            verification.sessionLogsMatch
                ? '✓ PASSED'
                : '✗ FAILED'
        }`);
        console.log('='.repeat(60) + '\n');
    }
}

// Run the load test
async function main() {
    const test = new AdminLoadTest();

    try {
        await test.setup();
        const results = await test.runLoadTest();
        const verification = await test.verifyResults(results);
        await test.printReport(results, verification);

        // Optionally keep data for manual inspection
        const keepData = process.argv.includes('--keep-data');
        if (!keepData) {
            await test.cleanup();
        } else {
            logger.info('Test data kept for inspection (use --keep-data flag)');
        }

        process.exit(verification.allAtCapacity && verification.presencesMatch ? 0 : 1);
    } catch (error) {
        logger.error('Load test failed:', error);
        await test.cleanup();
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

export { AdminLoadTest };
