# Requirements Document: Shared Study Rooms

## Introduction

The Shared Study Rooms feature provides backend infrastructure for collaborative study sessions on StudyClock.com. The system supports 10 predefined virtual rooms where authenticated students can join for video calls, audio communication, and real-time text messaging. Each room accommodates up to 50 concurrent participants with real-time occupancy tracking and WebRTC-based media streaming.

## Glossary

- **Room**: A predefined virtual space with fixed capacity where participants can join for collaborative study sessions
- **Participant**: An authenticated user who has joined a room and maintains an active connection
- **Occupancy**: The current count of active participants in a room
- **SFU (Selective Forwarding Unit)**: A WebRTC architecture pattern where the server forwards media streams without transcoding
- **Signaling**: The process of exchanging WebRTC connection metadata (offers, answers, ICE candidates) between peers
- **Session_Log**: A record tracking participant activity duration for analytics
- **Moderator**: An administrator with privileges to mute or remove participants
- **Timer_Sync**: Broadcasting Pomodoro timer state changes to all room participants
- **Backend_API**: The Express.js REST API layer handling HTTP requests
- **Socket_Server**: The Socket.io server handling real-time bidirectional communication
- **Media_Server**: The Mediasoup SFU server handling WebRTC media routing

## Requirements

### Requirement 1: Room Management

**User Story:** As a student, I want to view available study rooms with their current occupancy, so that I can choose a room with available capacity.

#### Acceptance Criteria

1. THE Backend_API SHALL provide an endpoint that returns all 10 predefined rooms
2. WHEN a room list is requested, THE Backend_API SHALL include room name, capacity, current occupancy, and available spots for each room
3. THE Backend_API SHALL calculate available spots as (capacity - current_occupancy)
4. THE Backend_API SHALL return room data in JSON format with HTTP 200 status
5. WHEN the database contains fewer than 10 rooms, THE Backend_API SHALL return all existing rooms without error

### Requirement 2: Room Joining

**User Story:** As a student, I want to join a study room, so that I can participate in collaborative study sessions.

#### Acceptance Criteria

1. WHEN an authenticated user requests to join a room, THE Backend_API SHALL verify the user's JWT token
2. IF the JWT token is invalid or missing, THEN THE Backend_API SHALL reject the request with HTTP 401 status
3. WHEN a join request is received, THE Backend_API SHALL check if current occupancy is less than capacity using a database transaction
4. IF current occupancy is less than capacity, THEN THE Backend_API SHALL increment the occupancy counter atomically
5. IF current occupancy equals or exceeds capacity, THEN THE Backend_API SHALL reject the request with HTTP 429 status
6. WHEN a user successfully joins, THE Backend_API SHALL create a Participant record with status "active"
7. WHEN a user successfully joins, THE Socket_Server SHALL broadcast a join event to all participants in that room
8. THE Backend_API SHALL use SELECT FOR UPDATE in the transaction to prevent race conditions

### Requirement 3: Room Leaving

**User Story:** As a student, I want to leave a study room, so that I can end my participation and free up capacity for others.

#### Acceptance Criteria

1. WHEN an authenticated user requests to leave a room, THE Backend_API SHALL verify the user is currently a participant
2. IF the user is not a participant, THEN THE Backend_API SHALL return HTTP 404 status
3. WHEN a leave request is received, THE Backend_API SHALL decrement the room's occupancy counter atomically
4. WHEN a user leaves, THE Backend_API SHALL update or delete the Participant record
5. WHEN a user leaves, THE Socket_Server SHALL broadcast a leave event to all remaining participants
6. WHEN a socket disconnects unexpectedly, THE Socket_Server SHALL automatically trigger the leave process
7. THE Backend_API SHALL ensure occupancy never decrements below zero

### Requirement 4: Real-Time Messaging

**User Story:** As a student, I want to send text messages in a study room, so that I can communicate with other participants.

#### Acceptance Criteria

1. WHEN an authenticated participant sends a message, THE Backend_API SHALL validate the message content is not empty
2. IF message content is empty or exceeds 1000 characters, THEN THE Backend_API SHALL reject with HTTP 400 status
3. WHEN a valid message is received, THE Backend_API SHALL store it in the Message table with timestamp
4. WHEN a message is stored, THE Socket_Server SHALL broadcast the message to all participants in that room
5. THE Backend_API SHALL support message types: text, emoji, and poll
6. WHEN storing a message, THE Backend_API SHALL record the user_id, room_id, content, type, and timestamp
7. THE Backend_API SHALL apply content moderation filtering before storing messages

### Requirement 5: WebRTC Signaling

**User Story:** As a student, I want to establish video and audio connections with other participants, so that I can see and hear them during study sessions.

#### Acceptance Criteria

1. WHEN a participant joins a room, THE Socket_Server SHALL create or assign a Mediasoup router for that room
2. WHEN a participant requests to produce media, THE Socket_Server SHALL create a WebRTC transport
3. WHEN a participant sends an SDP offer, THE Socket_Server SHALL relay it to the appropriate peer via Socket.io
4. WHEN a participant sends an SDP answer, THE Socket_Server SHALL relay it to the appropriate peer via Socket.io
5. WHEN a participant sends ICE candidates, THE Socket_Server SHALL relay them to the appropriate peer via Socket.io
6. THE Media_Server SHALL forward media streams without transcoding using SFU architecture
7. WHEN room occupancy exceeds 40 participants, THE Socket_Server SHALL recommend audio-only mode to new joiners

### Requirement 6: Timer Synchronization

**User Story:** As a student, I want to sync my Pomodoro timer with the room, so that all participants can study in coordinated intervals.

#### Acceptance Criteria

1. WHEN a participant starts a Pomodoro timer, THE Backend_API SHALL accept timer state (start time, duration, type)
2. WHEN a timer sync request is received, THE Socket_Server SHALL broadcast the timer state to all room participants
3. THE Socket_Server SHALL broadcast timer events: timer-start, timer-pause, timer-resume, timer-complete
4. WHEN a timer event is broadcast, THE Backend_API SHALL record it in the Session_Log table
5. THE Backend_API SHALL include user_id, room_id, and timestamp in timer event logs

### Requirement 7: Moderation Controls

**User Story:** As an administrator, I want to moderate study rooms, so that I can maintain appropriate behavior and remove disruptive participants.

#### Acceptance Criteria

1. WHEN an administrator requests to mute a participant, THE Backend_API SHALL verify admin privileges
2. IF the requester lacks admin privileges, THEN THE Backend_API SHALL reject with HTTP 403 status
3. WHEN a mute action is authorized, THE Backend_API SHALL update the Participant status to "muted"
4. WHEN a participant is muted, THE Socket_Server SHALL broadcast a mute event to that participant
5. WHEN an administrator requests to kick a participant, THE Backend_API SHALL remove them from the room
6. WHEN a participant is kicked, THE Backend_API SHALL decrement room occupancy
7. WHEN a participant is kicked, THE Socket_Server SHALL disconnect their socket and broadcast a kick event

### Requirement 8: Database Schema

**User Story:** As a system architect, I want a normalized database schema, so that room data is stored efficiently and consistently.

#### Acceptance Criteria

1. THE Backend_API SHALL define a Room table with columns: id, name (unique), capacity, current_occupancy, created_at
2. THE Backend_API SHALL define a Participant table with columns: id, user_id (FK), room_id (FK), joined_at, status
3. THE Backend_API SHALL define a Message table with columns: id, room_id (FK), user_id (FK), content, type, timestamp
4. THE Backend_API SHALL define a Session_Log table with columns: id, room_id (FK), user_id (FK), duration, created_at
5. WHEN the database is initialized, THE Backend_API SHALL seed 10 predefined rooms via migration
6. THE Backend_API SHALL set default capacity to 50 for all rooms
7. THE Backend_API SHALL set default current_occupancy to 0 for all rooms
8. THE Backend_API SHALL enforce foreign key constraints between Participant/Message/Session_Log and Room/User tables

### Requirement 9: Security and Authentication

**User Story:** As a system administrator, I want secure API endpoints, so that only authenticated users can access room features.

#### Acceptance Criteria

1. WHEN any room endpoint is accessed, THE Backend_API SHALL validate the JWT token in the Authorization header
2. IF no JWT token is provided, THEN THE Backend_API SHALL reject with HTTP 401 status
3. IF the JWT token is expired or invalid, THEN THE Backend_API SHALL reject with HTTP 401 status
4. THE Backend_API SHALL apply rate limiting to all endpoints to prevent abuse
5. WHEN rate limits are exceeded, THE Backend_API SHALL reject with HTTP 429 status
6. THE Backend_API SHALL validate all input parameters using Joi schema validation
7. THE Backend_API SHALL sanitize message content to prevent XSS attacks
8. THE Socket_Server SHALL encrypt signaling data during WebRTC negotiation

### Requirement 10: Capacity Enforcement

**User Story:** As a system architect, I want strict capacity enforcement, so that rooms never exceed 50 participants and server resources are protected.

#### Acceptance Criteria

1. WHEN a join request is processed, THE Backend_API SHALL use a database transaction with row-level locking
2. THE Backend_API SHALL execute SELECT FOR UPDATE on the Room record to acquire an exclusive lock
3. IF current_occupancy is less than capacity, THEN THE Backend_API SHALL increment current_occupancy within the transaction
4. IF current_occupancy equals or exceeds capacity, THEN THE Backend_API SHALL rollback the transaction and reject with HTTP 429
5. THE Backend_API SHALL commit the transaction only after successfully creating the Participant record
6. WHEN concurrent join requests occur, THE Backend_API SHALL process them serially due to row-level locking
7. THE Backend_API SHALL ensure occupancy accuracy within 100ms of actual participant count

### Requirement 11: Error Handling

**User Story:** As a developer, I want comprehensive error handling, so that clients receive clear error messages and the system remains stable.

#### Acceptance Criteria

1. WHEN a room is not found, THE Backend_API SHALL return HTTP 404 with message "Room not found"
2. WHEN a room is full, THE Backend_API SHALL return HTTP 429 with message "Room is at full capacity"
3. WHEN authentication fails, THE Backend_API SHALL return HTTP 401 with message "Unauthorized"
4. WHEN input validation fails, THE Backend_API SHALL return HTTP 400 with specific validation errors
5. WHEN a database error occurs, THE Backend_API SHALL return HTTP 500 with message "Internal server error"
6. THE Backend_API SHALL log all errors with Winston including timestamp, user_id, endpoint, and error details
7. WHEN a socket connection fails, THE Socket_Server SHALL emit an error event to the client with error details

### Requirement 12: Session Logging

**User Story:** As a product manager, I want to track participant session durations, so that I can analyze usage patterns and engagement metrics.

#### Acceptance Criteria

1. WHEN a participant joins a room, THE Backend_API SHALL record the join timestamp
2. WHEN a participant leaves a room, THE Backend_API SHALL calculate session duration
3. WHEN session duration is calculated, THE Backend_API SHALL create a Session_Log record
4. THE Backend_API SHALL store room_id, user_id, duration (in seconds), and timestamp in Session_Log
5. WHEN a socket disconnects unexpectedly, THE Backend_API SHALL still log the session duration
6. THE Backend_API SHALL support querying Session_Log by user_id, room_id, or date range

### Requirement 13: Real-Time Event Broadcasting

**User Story:** As a student, I want to receive real-time updates about room activities, so that I stay informed about participant actions and room state changes.

#### Acceptance Criteria

1. THE Socket_Server SHALL use namespaces per room for event isolation
2. WHEN a participant joins, THE Socket_Server SHALL emit "join-room" event with user details to all room participants
3. WHEN a participant leaves, THE Socket_Server SHALL emit "leave-room" event with user_id to all room participants
4. WHEN a message is sent, THE Socket_Server SHALL emit "send-message" event with message data to all room participants
5. WHEN a timer state changes, THE Socket_Server SHALL emit "timer-update" event with timer data to all room participants
6. WHEN a participant is muted, THE Socket_Server SHALL emit "user-muted" event to that participant
7. THE Socket_Server SHALL handle socket disconnections by cleaning up participant state and broadcasting leave events

### Requirement 14: Performance and Scalability

**User Story:** As a system architect, I want the system to handle high concurrent load, so that multiple rooms can operate simultaneously without performance degradation.

#### Acceptance Criteria

1. THE Backend_API SHALL support at least 500 concurrent participants across all rooms
2. WHEN room list is requested frequently, THE Backend_API SHALL cache results in Redis with 5-second TTL
3. THE Backend_API SHALL use database indexes on room_id, user_id, and timestamp columns
4. THE Backend_API SHALL process join requests within 200ms under normal load
5. THE Socket_Server SHALL handle at least 100 messages per second across all rooms
6. THE Media_Server SHALL support up to 50 concurrent video streams per room without packet loss exceeding 2%
7. WHEN CPU usage exceeds 80%, THE Backend_API SHALL log a warning and continue operation

### Requirement 15: Integration with Existing Systems

**User Story:** As a developer, I want the study rooms feature to integrate with existing authentication and study tracking systems, so that users have a seamless experience.

#### Acceptance Criteria

1. THE Backend_API SHALL use the existing User model for participant authentication
2. THE Backend_API SHALL reuse the existing JWT authentication middleware
3. THE Backend_API SHALL follow the existing component-based Express.js structure
4. THE Backend_API SHALL add new Prisma schema files following the pattern: auth.prisma, study.prisma, user.prisma
5. THE Backend_API SHALL create a new schema file: room.prisma for room-related models
6. THE Backend_API SHALL integrate with the existing study session tracking system
7. WHEN a participant joins a room, THE Backend_API SHALL optionally link to an active study session if one exists
