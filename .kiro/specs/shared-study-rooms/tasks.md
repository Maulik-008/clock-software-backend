# Implementation Plan: Shared Study Rooms

## Overview

This implementation plan breaks down the Shared Study Rooms feature into incremental, testable steps. The approach follows a bottom-up strategy: database schema → core services → API endpoints → real-time communication → WebRTC integration. Each major component includes property-based tests to validate correctness properties from the design document.

## Tasks

- [ ] 1. Set up database schema and migrations
  - [x] 1.1 Create room.prisma schema file with Room, Participant, Message, and SessionLog models
    - Define all models with proper types, defaults, and relationships
    - Add indexes on room_id, user_id, and timestamp columns
    - Include foreign key constraints with CASCADE delete
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.8, 14.3_
  
  - [x] 1.2 Create database migration to seed 10 predefined rooms
    - Generate migration file with INSERT statements for 10 rooms
    - Set capacity to 50 and current_occupancy to 0 for all rooms
    - Use meaningful names like "Study Room 1" through "Study Room 10"
    - _Requirements: 8.5, 8.6, 8.7_
  
  - [x] 1.3 Run migrations and verify schema
    - Execute Prisma migrations against test database
    - Verify all tables, indexes, and constraints are created
    - Verify 10 rooms are seeded correctly
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [x] 1.4 Write property test for room default values
    - **Property 25: Room Default Values**
    - **Validates: Requirements 8.6, 8.7**
  
  - [x] 1.5 Write property test for foreign key integrity
    - **Property 26: Foreign Key Integrity**
    - **Validates: Requirements 8.8**

- [ ] 2. Implement room service layer
  - [x] 2.1 Create room.service.ts with core business logic
    - Implement getRooms() to fetch all rooms with occupancy
    - Implement calculateAvailableSpots() helper function
    - Implement joinRoom() with transaction and locking
    - Implement leaveRoom() with occupancy decrement
    - Use Prisma transactions with SELECT FOR UPDATE for atomic operations
    - _Requirements: 1.1, 1.2, 1.3, 2.3, 2.4, 3.3, 10.1, 10.2, 10.3_
  
  - [x] 2.2 Write property test for available spots calculation
    - **Property 2: Available Spots Calculation**
    - **Validates: Requirements 1.3**
  
  - [-] 2.3 Write property test for join occupancy increment
    - **Property 4: Join Occupancy Increment**
    - **Validates: Requirements 2.4, 10.3**
  
  - [x] 2.4 Write property test for join and participant atomicity
    - **Property 6: Join and Participant Atomicity**
    - **Validates: Requirements 10.5**
  
  - [x] 2.5 Write property test for leave occupancy decrement
    - **Property 9: Leave Occupancy Decrement**
    - **Validates: Requirements 3.3, 7.6**
  
  - [x] 2.6 Write property test for occupancy non-negative invariant
    - **Property 11: Occupancy Non-Negative Invariant**
    - **Validates: Requirements 3.7**
  
  - [x] 2.7 Write property test for concurrent join capacity limit
    - **Property 7: Concurrent Join Capacity Limit**
    - **Validates: Requirements 2.3, 10.6**

- [ ] 3. Implement authentication and validation middleware
  - [x] 3.1 Create or reuse JWT authentication middleware
    - Verify JWT token from Authorization header
    - Extract user_id from token payload
    - Reject requests with 401 if token is missing, invalid, or expired
    - Attach user_id to request object for downstream handlers
    - _Requirements: 2.1, 9.1, 9.2, 9.3, 15.2_
  
  - [x] 3.2 Create rate limiting middleware using express-rate-limit
    - Configure 100 requests per minute per user for API endpoints
    - Configure 1000 messages per hour per user for chat
    - Configure 10 join/leave operations per minute per user
    - Return 429 with Retry-After header when limits exceeded
    - _Requirements: 9.4, 9.5_
  
  - [x] 3.3 Create room.validation.ts with Joi schemas
    - Define schemas for join, leave, send message, timer sync, and moderate requests
    - Validate message content length (1-1000 characters)
    - Validate room_id format (UUID)
    - Validate message type enum (TEXT, EMOJI, POLL)
    - _Requirements: 9.6, 4.1, 4.2_
  
  - [x] 3.4 Write property test for endpoint authentication
    - **Property 27: Endpoint Authentication**
    - **Validates: Requirements 9.1, 9.2, 9.3, 2.2**
  
  - [x] 3.5 Write property test for rate limiting
    - **Property 28: Rate Limiting**
    - **Validates: Requirements 9.4, 9.5**
  
  - [x] 3.6 Write property test for input validation
    - **Property 29: Input Validation**
    - **Validates: Requirements 9.6, 11.4**

- [ ] 4. Implement REST API endpoints
  - [x] 4.1 Create room.controller.ts with HTTP request handlers
    - Implement getRoomList() handler for GET /api/rooms
    - Implement joinRoom() handler for POST /api/rooms/:id/join
    - Implement leaveRoom() handler for POST /api/rooms/:id/leave
    - Implement sendMessage() handler for POST /api/rooms/:id/chat
    - Implement syncTimer() handler for POST /api/rooms/:id/timer-sync
    - Implement moderateParticipant() handler for POST /api/admin/rooms/:id/moderate
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 6.1, 7.1_
  
  - [x] 4.2 Create room.route.ts with Express routes
    - Define all routes with proper HTTP methods
    - Apply JWT authentication middleware to all routes
    - Apply rate limiting middleware to all routes
    - Apply validation middleware to all routes
    - Apply admin authorization middleware to moderation route
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 6.1, 7.1, 9.1_
  
  - [x] 4.3 Implement error handling in controllers
    - Return 404 for room not found
    - Return 429 for room at full capacity
    - Return 401 for authentication failures
    - Return 403 for insufficient privileges
    - Return 400 for validation failures
    - Return 500 for database errors
    - Use consistent ErrorResponse format
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  
  - [x] 4.4 Write property test for room list completeness
    - **Property 1: Room List Completeness**
    - **Validates: Requirements 1.2**
  
  - [x] 4.5 Write property test for join capacity enforcement
    - **Property 3: Join Capacity Enforcement**
    - **Validates: Requirements 2.5, 10.4, 11.2**
  
  - [x] 4.6 Write property test for join creates participant record
    - **Property 5: Join Creates Participant Record**
    - **Validates: Requirements 2.6**
  
  - [x] 4.7 Write property test for leave requires participation
    - **Property 8: Leave Requires Participation**
    - **Validates: Requirements 3.1, 3.2**
  
  - [x] 4.8 Write property test for leave removes participant record
    - **Property 10: Leave Removes Participant Record**
    - **Validates: Requirements 3.4**

- [ ] 5. Checkpoint - Ensure REST API tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement message handling and persistence
  - [x] 6.1 Add message storage logic to room.service.ts
    - Implement createMessage() to store messages in database
    - Validate message content is not empty
    - Sanitize message content to remove XSS patterns
    - Support TEXT, EMOJI, and POLL message types
    - Record user_id, room_id, content, type, and timestamp
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 9.7_
  
  - [x] 6.2 Write property test for message content validation
    - **Property 12: Message Content Validation**
    - **Validates: Requirements 4.1, 4.2**
  
  - [x] 6.3 Write property test for message persistence
    - **Property 13: Message Persistence**
    - **Validates: Requirements 4.3, 4.6**
  
  - [x] 6.4 Write property test for message type support
    - **Property 14: Message Type Support**
    - **Validates: Requirements 4.5**
  
  - [x] 6.5 Write property test for XSS sanitization
    - **Property 15: XSS Sanitization**
    - **Validates: Requirements 9.7**

- [ ] 7. Implement session logging
  - [x] 7.1 Add session logging logic to room.service.ts
    - Record join timestamp when participant joins
    - Calculate duration as (leave_time - join_time) when participant leaves
    - Create SessionLog record with room_id, user_id, duration, and timestamp
    - Handle unexpected disconnections by still logging duration
    - Implement query functions for SessionLog by user_id, room_id, and date range
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_
  
  - [x] 7.2 Write property test for session join timestamp
    - **Property 31: Session Join Timestamp**
    - **Validates: Requirements 12.1**
  
  - [x] 7.3 Write property test for session duration calculation
    - **Property 32: Session Duration Calculation**
    - **Validates: Requirements 12.2**
  
  - [x] 7.4 Write property test for session log creation
    - **Property 33: Session Log Creation**
    - **Validates: Requirements 12.3, 12.4, 12.5**
  
  - [x] 7.5 Write property test for session log querying
    - **Property 34: Session Log Querying**
    - **Validates: Requirements 12.6**

- [ ] 8. Implement Socket.io server and event handlers
  - [x] 8.1 Create room.socket.ts with Socket.io setup
    - Initialize Socket.io server with CORS configuration
    - Create namespaces per room (/room/:roomId)
    - Implement connection handler with JWT authentication
    - Set up event listeners for: join-room, send-message, leave-room, timer-update
    - Implement disconnection handler with automatic cleanup
    - _Requirements: 13.1, 2.7, 3.5, 4.4, 6.2, 13.7_
  
  - [x] 8.2 Implement event broadcasting logic
    - Broadcast user-joined event when participant joins
    - Broadcast user-left event when participant leaves
    - Broadcast new-message event when message is sent
    - Broadcast timer-synced event when timer state changes
    - Broadcast user-muted event when participant is muted
    - Broadcast user-kicked event when participant is kicked
    - Include current_occupancy in join/leave events
    - _Requirements: 2.7, 3.5, 4.4, 6.2, 6.3, 7.4, 7.7, 13.2, 13.3, 13.4, 13.5, 13.6_
  
  - [x] 8.3 Implement socket disconnection cleanup
    - Detect socket disconnection events
    - Trigger leave process automatically (decrement occupancy, remove participant)
    - Broadcast leave event to remaining participants
    - Clean up participant state within 5 seconds
    - _Requirements: 3.6, 13.7_
  
  - [x] 8.4 Write property test for room namespace isolation
    - **Property 35: Room Namespace Isolation**
    - **Validates: Requirements 13.1**
  
  - [x] 8.5 Write property test for event broadcasting to all participants
    - **Property 36: Event Broadcasting to All Participants**
    - **Validates: Requirements 2.7, 3.5, 4.4, 13.2, 13.3, 13.4**
  
  - [x] 8.6 Write property test for socket disconnection cleanup
    - **Property 37: Socket Disconnection Cleanup**
    - **Validates: Requirements 3.6, 13.7**

- [ ] 9. Checkpoint - Ensure Socket.io tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Implement WebRTC signaling with Mediasoup
  - [x] 10.1 Create room.mediasoup.ts with Mediasoup integration
    - Initialize Mediasoup workers (one per CPU core)
    - Implement createRouter() to create routers per room
    - Implement createTransport() to create WebRTC transports for participants
    - Store router, transport, producer, and consumer mappings per room
    - _Requirements: 5.1, 5.2_
  
  - [x] 10.2 Implement WebRTC signaling event handlers
    - Handle offer events and relay to target peer
    - Handle answer events and relay to target peer
    - Handle ICE candidate events and relay to target peer
    - Include sender user_id in all relayed messages
    - Validate target_user_id exists in room before relaying
    - _Requirements: 5.3, 5.4, 5.5_
  
  - [x] 10.3 Add high occupancy handling
    - Check room occupancy when participant requests media
    - If occupancy > 40, recommend audio-only mode to new joiners
    - Send recommendation event to client
    - _Requirements: 5.7_
  
  - [x] 10.4 Write property test for Mediasoup router creation
    - **Property 17: Mediasoup Router Creation**
    - **Validates: Requirements 5.1**
  
  - [x] 10.5 Write property test for WebRTC transport creation
    - **Property 18: WebRTC Transport Creation**
    - **Validates: Requirements 5.2**
  
  - [x] 10.6 Write property test for WebRTC signaling relay
    - **Property 16: WebRTC Signaling Relay**
    - **Validates: Requirements 5.3, 5.4, 5.5**

- [ ] 11. Implement timer synchronization
  - [x] 11.1 Add timer sync logic to room.socket.ts
    - Handle timer-update events from clients
    - Validate timer state (action, duration, start_time)
    - Broadcast timer-synced event to all room participants
    - Include synced_by user_id in broadcast
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [x] 11.2 Add timer event logging
    - Create SessionLog record when timer events are broadcast
    - Store user_id, room_id, and timestamp for each timer event
    - _Requirements: 6.4, 6.5_
  
  - [x] 11.3 Write property test for timer event broadcasting
    - **Property 19: Timer Event Broadcasting**
    - **Validates: Requirements 6.2, 6.3, 13.5**
  
  - [x] 11.4 Write property test for timer event logging
    - **Property 20: Timer Event Logging**
    - **Validates: Requirements 6.4, 6.5**

- [ ] 12. Implement moderation features
  - [x] 12.1 Add admin authorization middleware
    - Check if user has admin role from JWT token
    - Reject non-admin requests with 403 status
    - _Requirements: 7.1, 7.2_
  
  - [x] 12.2 Implement mute functionality in room.service.ts
    - Update Participant status to "MUTED"
    - Emit user-muted event to target participant via Socket.io
    - _Requirements: 7.3, 7.4_
  
  - [x] 12.3 Implement kick functionality in room.service.ts
    - Remove participant from room (delete Participant record)
    - Decrement room occupancy
    - Disconnect participant's socket
    - Broadcast user-kicked event to all participants
    - _Requirements: 7.5, 7.6, 7.7_
  
  - [x] 12.4 Write property test for admin authorization
    - **Property 21: Admin Authorization for Moderation**
    - **Validates: Requirements 7.1, 7.2**
  
  - [x] 12.5 Write property test for mute status update
    - **Property 22: Mute Status Update**
    - **Validates: Requirements 7.3**
  
  - [x] 12.6 Write property test for mute event notification
    - **Property 23: Mute Event Notification**
    - **Validates: Requirements 7.4, 13.6**
  
  - [x] 12.7 Write property test for kick removes participant
    - **Property 24: Kick Removes Participant**
    - **Validates: Requirements 7.5, 7.6, 7.7**

- [ ] 13. Implement logging and error handling
  - [x] 13.1 Create logger.ts with Winston configuration
    - Configure Winston with file transports (error.log, combined.log)
    - Set up log levels (error, warn, info, debug)
    - Create helper functions for logging with context (user_id, room_id, endpoint)
    - _Requirements: 11.6_
  
  - [x] 13.2 Add error logging to all controllers and services
    - Log all errors with timestamp, user_id, endpoint, and error details
    - Log warnings for rate limit violations and capacity warnings
    - Log info for room joins/leaves and moderation actions
    - _Requirements: 11.6_
  
  - [x] 13.3 Implement socket error handling
    - Emit error events to clients when socket operations fail
    - Include error details in error events
    - Log socket errors with connection context
    - _Requirements: 11.7_
  
  - [x] 13.4 Write property test for error logging completeness
    - **Property 30: Error Logging Completeness**
    - **Validates: Requirements 11.6**

- [ ] 14. Checkpoint - Ensure all core features work together
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Implement optional Redis caching
  - [x] 15.1 Set up Redis client and connection
    - Initialize Redis client with connection pooling
    - Handle connection errors gracefully
    - _Requirements: 14.2_
  
  - [x] 15.2 Add caching to room list endpoint
    - Cache room list with 5-second TTL
    - Return cached data if available and not expired
    - Fetch from database and update cache on miss
    - Invalidate cache when room occupancy changes
    - _Requirements: 14.2_
  
  - [x] 15.3 Write property test for Redis cache TTL
    - **Property 38: Redis Cache TTL**
    - **Validates: Requirements 14.2**

- [ ] 16. Integrate with existing study session tracking
  - [x] 16.1 Add study session linking logic
    - Check if user has active study session when joining room
    - If active session exists, create link between room participation and study session
    - Store link in database (add study_session_id to Participant model if needed)
    - _Requirements: 15.6, 15.7_
  
  - [x] 16.2 Write property test for study session linking
    - **Property 39: Study Session Linking**
    - **Validates: Requirements 15.6, 15.7**

- [ ] 17. Wire everything together and test end-to-end
  - [x] 17.1 Update main server file to initialize room components
    - Import and mount room routes
    - Initialize Socket.io server with room handlers
    - Initialize Mediasoup workers
    - Connect to Redis (if enabled)
    - _Requirements: All_
  
  - [x] 17.2 Create integration test suite
    - Test complete join → message → leave flow
    - Test concurrent joins with capacity enforcement
    - Test WebRTC signaling between multiple clients
    - Test moderation actions (mute, kick)
    - Test timer synchronization across participants
    - Test socket disconnection cleanup
    - _Requirements: All_
  
  - [x] 17.3 Write unit tests for edge cases
    - Test empty room list handling
    - Test invalid JWT tokens
    - Test invalid room IDs
    - Test message length boundaries (0, 1, 1000, 1001 characters)
    - Test room at full capacity
    - Test unauthorized moderation attempts
    - Test socket disconnection during join
    - _Requirements: 1.5, 2.2, 2.5, 3.2, 4.2, 5.7, 7.2, 9.2, 9.3, 9.5, 10.4, 11.1, 11.2, 11.3, 11.4, 11.5, 11.7, 12.5_

- [ ] 18. Final checkpoint - Comprehensive testing
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive implementation with full test coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at major milestones
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end flows across components
- The implementation follows a bottom-up approach: database → services → API → real-time → WebRTC
- Redis caching is optional and can be added later for performance optimization
- Study session integration is the final step to connect with existing systems
