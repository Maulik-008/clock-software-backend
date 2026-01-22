# Implementation Plan: Public Study Rooms

## Overview

This implementation plan breaks down the Public Study Rooms feature into discrete coding tasks. The approach focuses on building incrementally: database models first, then backend services and APIs, followed by frontend components, and finally integration. Each task builds on previous work to ensure continuous progress without orphaned code.

## Tasks

- [x] 1. Set up database models and migrations
  - Create Prisma schema for AnonymousUser, RoomParticipant, ChatMessage, and RateLimitRecord models
  - Add relations to existing Room model
  - Generate and run database migrations
  - _Requirements: 1.3, 1.4, 3.3, 6.2, 11.1_

- [x] 2. Implement SecurityService for IP hashing and input validation
  - Create SecurityService class with IP hashing using crypto
  - Implement display name validation (1-50 characters)
  - Implement input sanitization for HTML/XSS prevention
  - Implement SQL injection pattern detection
  - _Requirements: 10.1, 10.2, 12.1, 12.2, 12.4, 12.5_

- [x] 3. Implement rate limiting infrastructure
  - Create RateLimiter middleware using express-rate-limit or custom implementation
  - Implement API rate limiting (100 requests/minute per endpoint)
  - Implement chat rate limiting (10 messages/minute)
  - Implement join attempt limiting (5 attempts/minute)
  - Add IP blocking logic with configurable durations
  - Store rate limit state in memory or Redis
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 13.1, 13.2_

- [x] 4. Implement AnonymousUserService
  - Create AnonymousUserService class
  - Implement createOrGetUser method with IP hashing
  - Implement getUserByIp method
  - Implement updateDisplayName method
  - Implement cleanupInactiveUsers method for 30-minute timeout
  - _Requirements: 1.3, 1.4, 1.5, 3.2_

- [x] 5. Implement PublicRoomService
  - Create PublicRoomService class
  - Implement getPublicRooms method returning 10 rooms with occupancy
  - Implement joinRoom method with capacity checking
  - Implement leaveRoom method with occupancy decrement
  - Implement getRoomParticipants method
  - Implement hasCapacity method
  - Add single room membership enforcement (one room per IP)
  - _Requirements: 2.1, 2.2, 2.4, 3.3, 3.4, 3.5, 11.5_

- [x] 6. Create public REST API endpoints
  - Create /api/public/rooms GET endpoint (no auth required)
  - Create /api/public/users POST endpoint for user creation
  - Create /api/public/rooms/:roomId/join POST endpoint
  - Create /api/public/rooms/:roomId/leave POST endpoint
  - Apply rate limiting middleware to all endpoints
  - Ensure no JWT authentication middleware on public routes
  - Implement error handling with proper error codes and messages
  - _Requirements: 9.1, 9.2, 9.3, 9.5_

- [x] 7. Checkpoint - Test backend APIs manually
  - Ensure all REST endpoints work without authentication
  - Verify rate limiting behavior
  - Verify input validation and sanitization
  - Test room capacity enforcement
  - Ask the user if questions arise

- [x] 8. Implement Socket.io event handlers for room operations
  - Create Socket.io namespace for public rooms
  - Implement join-room event handler
  - Implement leave-room event handler
  - Implement disconnect handler with cleanup
  - Add concurrent connection limiting (2 per IP)
  - Add WebSocket ping/pong health checks
  - _Requirements: 9.4, 13.5, 14.4, 14.5_

- [x] 9. Implement Socket.io event handlers for real-time updates
  - Implement room-occupancy-update event emission
  - Implement user-joined event broadcasting to room participants
  - Implement user-left event broadcasting to room participants
  - Implement participant-video-toggle event broadcasting
  - Implement participant-audio-toggle event broadcasting
  - _Requirements: 2.3, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4_

- [x] 10. Implement chat functionality via Socket.io
  - Implement send-message event handler with rate limiting
  - Implement message sanitization and validation
  - Implement new-message event broadcasting to room participants
  - Implement chat history retrieval on room join
  - Store messages in ChatMessage table
  - _Requirements: 6.2, 6.4, 6.5, 12.3, 12.4_

- [x] 11. Implement reconnection and abuse prevention
  - Add exponential backoff for rapid reconnections
  - Add suspicious activity logging
  - Implement IP blocking for repeated violations
  - Add system capacity queueing (100 concurrent users)
  - _Requirements: 13.3, 13.4, 14.2_

- [x] 12. Checkpoint - Test Socket.io functionality manually
  - Test real-time events with multiple clients
  - Verify chat message broadcasting
  - Verify participant list updates
  - Test rate limiting for chat and connections
  - Ask the user if questions arise

- [x] 13. Create RoomListPage frontend component
  - Create React component for public landing page
  - Fetch and display 10 rooms from /api/public/rooms
  - Display room name, occupancy, capacity, and full status
  - Set up Socket.io client connection
  - Subscribe to room-occupancy-update events
  - Update room list in real-time
  - Add room selection handler
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 14. Create JoinRoomModal frontend component
  - Create modal component for name input
  - Implement display name input with validation (1-50 chars)
  - Show validation errors inline
  - Handle form submission
  - Call /api/public/users to create user
  - Call /api/public/rooms/:roomId/join to join room
  - Handle errors (room full, rate limit, etc.)
  - _Requirements: 1.2, 3.1, 3.2, 12.1_

- [x] 15. Create StudyRoomInterface frontend component
  - Create main room interface component
  - Display participant list with names and media status
  - Implement local video/audio controls
  - Emit Socket.io events for media toggles
  - Listen for participant join/leave events
  - Update participant list in real-time
  - Integrate existing WebRTC/Mediasoup infrastructure
  - _Requirements: 4.2, 4.3, 5.2, 5.3, 7.1, 7.2, 7.5_

- [x] 16. Create ChatPanel frontend component
  - Create chat panel component within StudyRoomInterface
  - Display chat messages with sender names and timestamps
  - Implement message input with character count (max 1000)
  - Implement send message functionality via Socket.io
  - Listen for new-message events
  - Display chat history on room join
  - Show rate limit feedback when limit exceeded
  - Implement client-side rate limiting feedback
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 11.3, 12.3_

- [x] 17. Implement WebRTC media stream handling
  - Connect to existing Mediasoup infrastructure
  - Handle local media stream capture (camera/microphone)
  - Handle remote media stream display
  - Implement media track enable/disable
  - Handle participant media state changes
  - Clean up streams on participant leave
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 18. Implement error handling and user feedback
  - Add error toast/notification component
  - Display rate limit errors with retry timers
  - Display room full errors with alternative suggestions
  - Display validation errors inline
  - Display connection errors with reconnection status
  - Handle system capacity queueing with queue position
  - _Requirements: All error handling from design_

- [x] 19. Add frontend routing and navigation
  - Set up React Router for public routes
  - Create route for RoomListPage (homepage)
  - Create route for StudyRoomInterface
  - Handle navigation from room list to room
  - Handle leaving room and returning to list
  - Ensure routes don't require authentication
  - _Requirements: 2.5, 9.5_

- [x] 20. Implement automatic cleanup and resource management
  - Create scheduled job for cleanupInactiveUsers (30-minute timeout)
  - Implement WebSocket connection cleanup on disconnect
  - Implement room participant cleanup on leave
  - Remove user from room on connection loss
  - Update occupancy counts on cleanup
  - _Requirements: 14.3, 14.4, 14.5_

- [x] 21. Add security headers and CORS configuration
  - Configure CORS for public endpoints
  - Add security headers (helmet.js)
  - Configure rate limiting headers
  - Ensure IP privacy in all responses
  - Add request logging for monitoring
  - _Requirements: 10.3, 10.4, 10.5_

- [-] 22. Final integration and polish
  - Wire all components together
  - Test complete user flow: browse → join → communicate → leave
  - Verify real-time updates across multiple clients
  - Verify rate limiting across all endpoints
  - Add loading states and transitions
  - Polish UI/UX with TailwindCSS
  - _Requirements: All requirements_

- [ ] 23. Final checkpoint - Manual end-to-end testing
  - Test with multiple users in multiple rooms
  - Verify video/audio/chat functionality
  - Test rate limiting and abuse prevention
  - Test capacity limits and error handling
  - Verify security features (IP hashing, input sanitization)
  - Ask the user if questions arise

## Notes

- No automated tests will be created for this MVP (fast delivery priority)
- Manual testing should be performed after each checkpoint
- Each task builds incrementally on previous work
- Focus on core functionality first, polish later
- Leverage existing WebRTC/Mediasoup and Socket.io infrastructure
- All tasks reference specific requirements for traceability
