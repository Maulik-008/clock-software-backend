# Design Document: Shared Study Rooms

## Overview

The Shared Study Rooms feature provides a real-time collaborative study environment built on a three-tier architecture: REST API layer (Express.js), real-time communication layer (Socket.io), and media streaming layer (Mediasoup SFU). The system manages 10 predefined rooms with strict 50-participant capacity limits enforced through database-level locking mechanisms.

The design emphasizes:
- **Atomic capacity enforcement** using PostgreSQL row-level locks
- **Namespace isolation** for room-specific Socket.io events
- **SFU architecture** for efficient media routing without transcoding
- **Graceful degradation** from video to audio-only at high occupancy
- **Integration** with existing authentication and study tracking systems

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│  (Web browsers with WebRTC, Socket.io client, HTTP client)  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ HTTP/WebSocket/WebRTC
                 │
┌────────────────▼────────────────────────────────────────────┐
│                     Backend Services                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Express.js  │  │  Socket.io   │  │  Mediasoup   │     │
│  │  REST API    │  │  Server      │  │  SFU Server  │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘              │
│                            │                                 │
└────────────────────────────┼─────────────────────────────────┘
                             │
                ┌────────────▼────────────┐
                │   PostgreSQL Database   │
                │   (via Prisma ORM)      │
                └─────────────────────────┘
                             │
                ┌────────────▼────────────┐
                │   Redis Cache           │
                │   (Optional)            │
                └─────────────────────────┘
```

### Component Responsibilities

**Express.js REST API**:
- Handles HTTP requests for room operations (list, join, leave, message)
- Enforces JWT authentication on all endpoints
- Validates input using Joi schemas
- Manages database transactions for capacity enforcement
- Applies rate limiting to prevent abuse

**Socket.io Server**:
- Manages real-time bidirectional communication
- Uses namespaces for room isolation (`/room/:roomId`)
- Broadcasts events: join, leave, message, timer-update, mute, kick
- Handles WebRTC signaling (offer, answer, ICE candidates)
- Auto-cleanup on socket disconnection

**Mediasoup SFU Server**:
- Creates routers per room for media routing
- Manages WebRTC transports for producers and consumers
- Forwards media streams without transcoding
- Supports selective consumption (participants choose which streams to receive)

**PostgreSQL Database**:
- Stores persistent data: rooms, participants, messages, session logs
- Provides ACID transactions with row-level locking
- Enforces referential integrity via foreign keys

**Redis Cache (Optional)**:
- Caches room list with occupancy data (5-second TTL)
- Stores rate-limiting counters
- Improves read performance for frequently accessed data

## Components and Interfaces

### Database Models (Prisma Schema)

**room.prisma**:
```prisma
model Room {
  id                String        @id @default(uuid())
  name              String        @unique
  capacity          Int           @default(50)
  current_occupancy Int           @default(0)
  created_at        DateTime      @default(now())
  
  participants      Participant[]
  messages          Message[]
  session_logs      SessionLog[]
  
  @@index([name])
}

model Participant {
  id        String   @id @default(uuid())
  user_id   String
  room_id   String
  joined_at DateTime @default(now())
  status    ParticipantStatus @default(ACTIVE)
  
  user      User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  room      Room     @relation(fields: [room_id], references: [id], onDelete: Cascade)
  
  @@unique([user_id, room_id])
  @@index([room_id])
  @@index([user_id])
}

enum ParticipantStatus {
  ACTIVE
  MUTED
}

model Message {
  id        String      @id @default(uuid())
  room_id   String
  user_id   String
  content   String      @db.Text
  type      MessageType @default(TEXT)
  timestamp DateTime    @default(now())
  
  room      Room        @relation(fields: [room_id], references: [id], onDelete: Cascade)
  user      User        @relation(fields: [user_id], references: [id], onDelete: Cascade)
  
  @@index([room_id, timestamp])
  @@index([user_id])
}

enum MessageType {
  TEXT
  EMOJI
  POLL
}

model SessionLog {
  id         String   @id @default(uuid())
  room_id    String
  user_id    String
  duration   Int      // in seconds
  created_at DateTime @default(now())
  
  room       Room     @relation(fields: [room_id], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  
  @@index([room_id])
  @@index([user_id])
  @@index([created_at])
}
```

### REST API Endpoints

**Room Controller** (`room.controller.ts`):

```typescript
interface RoomListResponse {
  rooms: Array<{
    id: string;
    name: string;
    capacity: number;
    current_occupancy: number;
    available_spots: number;
  }>;
}

interface JoinRoomRequest {
  user_id: string; // from JWT
}

interface JoinRoomResponse {
  success: boolean;
  participant_id: string;
  room: {
    id: string;
    name: string;
    current_occupancy: number;
  };
}

interface LeaveRoomRequest {
  user_id: string; // from JWT
}

interface SendMessageRequest {
  content: string;
  type: 'TEXT' | 'EMOJI' | 'POLL';
}

interface TimerSyncRequest {
  action: 'start' | 'pause' | 'resume' | 'complete';
  duration?: number; // in seconds
  start_time?: string; // ISO timestamp
}

interface ModerateRequest {
  action: 'mute' | 'kick';
  target_user_id: string;
}
```

**Endpoints**:
- `GET /api/rooms` → List all rooms with occupancy
- `POST /api/rooms/:id/join` → Join a room (authenticated)
- `POST /api/rooms/:id/leave` → Leave a room (authenticated)
- `POST /api/rooms/:id/chat` → Send a message (authenticated)
- `POST /api/rooms/:id/timer-sync` → Sync timer state (authenticated)
- `POST /api/admin/rooms/:id/moderate` → Moderate participant (admin only)

### Socket.io Events

**Namespace Structure**:
Each room has its own namespace: `/room/:roomId`

**Client → Server Events**:
```typescript
interface JoinRoomEvent {
  user_id: string;
  user_name: string;
}

interface SendMessageEvent {
  content: string;
  type: 'TEXT' | 'EMOJI' | 'POLL';
}

interface WebRTCOfferEvent {
  sdp: string;
  target_user_id: string;
}

interface WebRTCAnswerEvent {
  sdp: string;
  target_user_id: string;
}

interface ICECandidateEvent {
  candidate: RTCIceCandidateInit;
  target_user_id: string;
}

interface TimerUpdateEvent {
  action: 'start' | 'pause' | 'resume' | 'complete';
  duration?: number;
  start_time?: string;
}
```

**Server → Client Events**:
```typescript
interface UserJoinedEvent {
  user_id: string;
  user_name: string;
  joined_at: string;
  current_occupancy: number;
}

interface UserLeftEvent {
  user_id: string;
  current_occupancy: number;
}

interface NewMessageEvent {
  message_id: string;
  user_id: string;
  user_name: string;
  content: string;
  type: 'TEXT' | 'EMOJI' | 'POLL';
  timestamp: string;
}

interface WebRTCOfferReceivedEvent {
  from_user_id: string;
  sdp: string;
}

interface WebRTCAnswerReceivedEvent {
  from_user_id: string;
  sdp: string;
}

interface ICECandidateReceivedEvent {
  from_user_id: string;
  candidate: RTCIceCandidateInit;
}

interface TimerSyncedEvent {
  action: 'start' | 'pause' | 'resume' | 'complete';
  duration?: number;
  start_time?: string;
  synced_by: string;
}

interface UserMutedEvent {
  user_id: string;
}

interface UserKickedEvent {
  user_id: string;
  reason: string;
}
```

### Mediasoup Integration

**Router Management**:
```typescript
interface MediasoupRouter {
  room_id: string;
  router: mediasoup.Router;
  transports: Map<string, mediasoup.Transport>; // user_id → transport
  producers: Map<string, mediasoup.Producer[]>; // user_id → producers
  consumers: Map<string, mediasoup.Consumer[]>; // user_id → consumers
}
```

**Transport Creation Flow**:
1. Client requests to produce media (video/audio)
2. Server creates WebRTC transport for that user
3. Server sends transport parameters to client
4. Client connects transport and produces media
5. Server notifies other participants about new producer
6. Other participants create consumers to receive the stream

## Data Models

### Room Entity

**Attributes**:
- `id`: UUID primary key
- `name`: Unique room identifier (e.g., "Study Room 1")
- `capacity`: Maximum participants (default: 50)
- `current_occupancy`: Current participant count
- `created_at`: Timestamp of room creation

**Invariants**:
- `current_occupancy >= 0`
- `current_occupancy <= capacity`
- `name` must be unique across all rooms

**Operations**:
- `incrementOccupancy()`: Atomically increment occupancy within transaction
- `decrementOccupancy()`: Atomically decrement occupancy within transaction
- `getAvailableSpots()`: Calculate `capacity - current_occupancy`
- `isFull()`: Check if `current_occupancy >= capacity`

### Participant Entity

**Attributes**:
- `id`: UUID primary key
- `user_id`: Foreign key to User table
- `room_id`: Foreign key to Room table
- `joined_at`: Timestamp when participant joined
- `status`: Enum (ACTIVE, MUTED)

**Invariants**:
- A user can only be a participant in one room at a time (enforced by unique constraint on `user_id, room_id`)
- `joined_at` must be <= current time

**Operations**:
- `mute()`: Set status to MUTED
- `unmute()`: Set status to ACTIVE
- `calculateDuration()`: Return `now() - joined_at` in seconds

### Message Entity

**Attributes**:
- `id`: UUID primary key
- `room_id`: Foreign key to Room table
- `user_id`: Foreign key to User table
- `content`: Message text (max 1000 characters)
- `type`: Enum (TEXT, EMOJI, POLL)
- `timestamp`: Message creation time

**Invariants**:
- `content` must not be empty
- `content` length <= 1000 characters
- `timestamp` must be <= current time

**Operations**:
- `sanitize()`: Remove XSS-vulnerable content
- `moderate()`: Apply content filtering rules

### SessionLog Entity

**Attributes**:
- `id`: UUID primary key
- `room_id`: Foreign key to Room table
- `user_id`: Foreign key to User table
- `duration`: Session length in seconds
- `created_at`: Log creation timestamp

**Invariants**:
- `duration >= 0`
- `created_at` must be <= current time

**Operations**:
- `queryByUser(user_id)`: Get all sessions for a user
- `queryByRoom(room_id)`: Get all sessions for a room
- `queryByDateRange(start, end)`: Get sessions within date range

## Data Flow Diagrams

### Join Room Flow

```
Client                 API Server              Database              Socket Server
  │                        │                       │                       │
  │  POST /rooms/:id/join  │                       │                       │
  ├───────────────────────>│                       │                       │
  │                        │  BEGIN TRANSACTION    │                       │
  │                        ├──────────────────────>│                       │
  │                        │  SELECT FOR UPDATE    │                       │
  │                        ├──────────────────────>│                       │
  │                        │  (lock room row)      │                       │
  │                        │<──────────────────────┤                       │
  │                        │  Check occupancy < 50 │                       │
  │                        │                       │                       │
  │                        │  UPDATE occupancy + 1 │                       │
  │                        ├──────────────────────>│                       │
  │                        │  INSERT participant   │                       │
  │                        ├──────────────────────>│                       │
  │                        │  COMMIT               │                       │
  │                        ├──────────────────────>│                       │
  │                        │                       │                       │
  │                        │  Broadcast join event │                       │
  │                        ├───────────────────────┼──────────────────────>│
  │  200 OK                │                       │                       │
  │<───────────────────────┤                       │                       │
  │                        │                       │  user-joined event    │
  │<───────────────────────┴───────────────────────┴───────────────────────┤
```

### Send Message Flow

```
Client                 API Server              Database              Socket Server
  │                        │                       │                       │
  │  POST /rooms/:id/chat  │                       │                       │
  ├───────────────────────>│                       │                       │
  │                        │  Validate content     │                       │
  │                        │  Sanitize XSS         │                       │
  │                        │  Apply moderation     │                       │
  │                        │                       │                       │
  │                        │  INSERT message       │                       │
  │                        ├──────────────────────>│                       │
  │                        │<──────────────────────┤                       │
  │                        │                       │                       │
  │                        │  Broadcast message    │                       │
  │                        ├───────────────────────┼──────────────────────>│
  │  200 OK                │                       │                       │
  │<───────────────────────┤                       │                       │
  │                        │                       │  new-message event    │
  │<───────────────────────┴───────────────────────┴───────────────────────┤
```

### WebRTC Signaling Flow

```
Client A              Socket Server           Client B
  │                        │                      │
  │  offer (SDP)           │                      │
  ├───────────────────────>│                      │
  │                        │  offer-received      │
  │                        ├─────────────────────>│
  │                        │                      │
  │                        │  answer (SDP)        │
  │                        │<─────────────────────┤
  │  answer-received       │                      │
  │<───────────────────────┤                      │
  │                        │                      │
  │  ICE candidate         │                      │
  ├───────────────────────>│                      │
  │                        │  ICE candidate       │
  │                        ├─────────────────────>│
  │                        │                      │
  │                        │  ICE candidate       │
  │                        │<─────────────────────┤
  │  ICE candidate         │                      │
  │<───────────────────────┤                      │
  │                        │                      │
  │  ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ >│
  │         Direct P2P Media Connection           │
  │           (via Mediasoup SFU)                 │
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified the following redundancies and consolidations:

**Consolidated Broadcasting Properties**: Multiple criteria (2.7, 3.5, 4.4, 6.2, 13.2-13.6) all test event broadcasting to participants. These can be consolidated into a single comprehensive property about event delivery.

**Consolidated Occupancy Properties**: Criteria 2.4, 3.3, 7.6, and 10.3 all test occupancy counter updates. These can be combined into properties about occupancy invariants.

**Consolidated Data Completeness Properties**: Criteria 1.2, 4.6, 6.5, 11.6, 12.4 all test that stored records contain required fields. These can be consolidated into properties about data model completeness.

**Consolidated Signaling Relay Properties**: Criteria 5.3, 5.4, 5.5 all test WebRTC signaling relay. These can be combined into a single property about signaling message delivery.

**Consolidated Authentication Properties**: Criteria 9.1, 2.1 both test JWT validation. These can be combined into a single property about endpoint authentication.

### Properties

**Property 1: Room List Completeness**
*For any* room in the database, when the room list endpoint is called, the response should include that room's name, capacity, current_occupancy, and available_spots fields.
**Validates: Requirements 1.2**

**Property 2: Available Spots Calculation**
*For any* room with capacity C and current_occupancy O, the calculated available_spots should equal (C - O).
**Validates: Requirements 1.3**

**Property 3: Join Capacity Enforcement**
*For any* room at full capacity (current_occupancy >= capacity), join requests should be rejected with HTTP 429 status.
**Validates: Requirements 2.5, 10.4, 11.2**

**Property 4: Join Occupancy Increment**
*For any* room with available capacity, when a user successfully joins, the current_occupancy should increase by exactly 1.
**Validates: Requirements 2.4, 10.3**

**Property 5: Join Creates Participant Record**
*For any* successful join operation, a Participant record should be created with status "ACTIVE" and the correct user_id and room_id.
**Validates: Requirements 2.6**

**Property 6: Join and Participant Atomicity**
*For any* join operation, either both the occupancy increment and participant record creation succeed together, or both fail together (no partial updates).
**Validates: Requirements 10.5**

**Property 7: Concurrent Join Capacity Limit**
*For any* room with N available spots, when N+K concurrent join requests arrive (K > 0), exactly N should succeed and K should be rejected with HTTP 429.
**Validates: Requirements 2.3, 10.6**

**Property 8: Leave Requires Participation**
*For any* user who is not a participant in a room, leave requests should be rejected with HTTP 404 status.
**Validates: Requirements 3.1, 3.2**

**Property 9: Leave Occupancy Decrement**
*For any* participant who leaves a room, the room's current_occupancy should decrease by exactly 1.
**Validates: Requirements 3.3, 7.6**

**Property 10: Leave Removes Participant Record**
*For any* participant who leaves a room, their Participant record should be removed or marked as inactive.
**Validates: Requirements 3.4**

**Property 11: Occupancy Non-Negative Invariant**
*For any* room at any point in time, the current_occupancy should never be less than 0.
**Validates: Requirements 3.7**

**Property 12: Message Content Validation**
*For any* message with empty content or content exceeding 1000 characters, the message should be rejected with HTTP 400 status.
**Validates: Requirements 4.1, 4.2**

**Property 13: Message Persistence**
*For any* valid message sent to a room, a Message record should be created in the database with user_id, room_id, content, type, and timestamp fields populated.
**Validates: Requirements 4.3, 4.6**

**Property 14: Message Type Support**
*For any* message with type TEXT, EMOJI, or POLL, the message should be accepted and stored with the correct type.
**Validates: Requirements 4.5**

**Property 15: XSS Sanitization**
*For any* message containing XSS patterns (e.g., `<script>`, `javascript:`, `onerror=`), the stored content should have these patterns removed or escaped.
**Validates: Requirements 9.7**

**Property 16: WebRTC Signaling Relay**
*For any* WebRTC signaling message (offer, answer, ICE candidate) sent from user A to user B in the same room, user B should receive the message with the correct sender information.
**Validates: Requirements 5.3, 5.4, 5.5**

**Property 17: Mediasoup Router Creation**
*For any* room with at least one participant requesting media capabilities, a Mediasoup router should be created or assigned for that room.
**Validates: Requirements 5.1**

**Property 18: WebRTC Transport Creation**
*For any* participant requesting to produce media, a WebRTC transport should be created for that participant.
**Validates: Requirements 5.2**

**Property 19: Timer Event Broadcasting**
*For any* timer event (start, pause, resume, complete) triggered in a room, all participants in that room should receive the timer-update event with the correct timer state.
**Validates: Requirements 6.2, 6.3, 13.5**

**Property 20: Timer Event Logging**
*For any* timer event broadcast in a room, a Session_Log record should be created with user_id, room_id, and timestamp.
**Validates: Requirements 6.4, 6.5**

**Property 21: Admin Authorization for Moderation**
*For any* moderation request (mute, kick) from a non-admin user, the request should be rejected with HTTP 403 status.
**Validates: Requirements 7.1, 7.2**

**Property 22: Mute Status Update**
*For any* authorized mute action on a participant, the Participant record's status should be updated to "MUTED".
**Validates: Requirements 7.3**

**Property 23: Mute Event Notification**
*For any* participant who is muted, that participant should receive a user-muted event.
**Validates: Requirements 7.4, 13.6**

**Property 24: Kick Removes Participant**
*For any* participant who is kicked, they should be removed from the room (participant record deleted, occupancy decremented, socket disconnected).
**Validates: Requirements 7.5, 7.6, 7.7**

**Property 25: Room Default Values**
*For any* newly created room, the capacity should default to 50 and current_occupancy should default to 0.
**Validates: Requirements 8.6, 8.7**

**Property 26: Foreign Key Integrity**
*For any* attempt to create a Participant, Message, or SessionLog record with a non-existent room_id or user_id, the operation should be rejected by the database.
**Validates: Requirements 8.8**

**Property 27: Endpoint Authentication**
*For any* room endpoint request without a valid JWT token, the request should be rejected with HTTP 401 status.
**Validates: Requirements 9.1, 9.2, 9.3, 2.2**

**Property 28: Rate Limiting**
*For any* client exceeding the rate limit threshold, subsequent requests should be rejected with HTTP 429 status until the rate limit window resets.
**Validates: Requirements 9.4, 9.5**

**Property 29: Input Validation**
*For any* request with invalid input parameters (wrong type, missing required fields, out of range values), the request should be rejected with HTTP 400 status and specific validation errors.
**Validates: Requirements 9.6, 11.4**

**Property 30: Error Logging Completeness**
*For any* error that occurs, the error log should contain timestamp, user_id (if available), endpoint, and error details.
**Validates: Requirements 11.6**

**Property 31: Session Join Timestamp**
*For any* participant who joins a room, the join timestamp should be recorded and should be within 1 second of the actual join time.
**Validates: Requirements 12.1**

**Property 32: Session Duration Calculation**
*For any* participant who leaves a room, the calculated session duration should equal (leave_time - join_time) in seconds, with accuracy within 1 second.
**Validates: Requirements 12.2**

**Property 33: Session Log Creation**
*For any* participant who leaves a room (including unexpected disconnections), a SessionLog record should be created with room_id, user_id, duration, and timestamp.
**Validates: Requirements 12.3, 12.4, 12.5**

**Property 34: Session Log Querying**
*For any* query by user_id, room_id, or date range, the returned SessionLog records should match the query criteria exactly.
**Validates: Requirements 12.6**

**Property 35: Room Namespace Isolation**
*For any* event emitted in room A, participants in room B should not receive that event (namespace isolation).
**Validates: Requirements 13.1**

**Property 36: Event Broadcasting to All Participants**
*For any* room event (join, leave, message, timer-update), all active participants in that room should receive the event within 100ms.
**Validates: Requirements 2.7, 3.5, 4.4, 13.2, 13.3, 13.4**

**Property 37: Socket Disconnection Cleanup**
*For any* socket that disconnects unexpectedly, the participant state should be cleaned up (participant removed, occupancy decremented, leave event broadcast) within 5 seconds.
**Validates: Requirements 3.6, 13.7**

**Property 38: Redis Cache TTL**
*For any* cached room list in Redis, the data should expire after 5 seconds and subsequent requests should fetch fresh data from the database.
**Validates: Requirements 14.2**

**Property 39: Study Session Linking**
*For any* participant who joins a room while having an active study session, the room participation should be optionally linked to that study session.
**Validates: Requirements 15.6, 15.7**

## Error Handling

### Error Categories

**Client Errors (4xx)**:
- **400 Bad Request**: Invalid input parameters, validation failures, malformed requests
- **401 Unauthorized**: Missing, invalid, or expired JWT tokens
- **403 Forbidden**: Insufficient privileges for moderation actions
- **404 Not Found**: Room doesn't exist, user is not a participant
- **429 Too Many Requests**: Room at full capacity, rate limit exceeded

**Server Errors (5xx)**:
- **500 Internal Server Error**: Database failures, unexpected exceptions
- **503 Service Unavailable**: Mediasoup server unavailable, Redis connection failure

### Error Response Format

All error responses follow a consistent JSON structure:

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;        // Machine-readable error code
    message: string;     // Human-readable error message
    details?: any;       // Optional additional context
    timestamp: string;   // ISO 8601 timestamp
  };
}
```

### Error Handling Strategies

**Database Transaction Failures**:
- Rollback transaction automatically
- Log error with full context (user_id, room_id, operation)
- Return 500 error to client
- Retry logic for transient failures (deadlocks, connection timeouts)

**WebRTC Signaling Failures**:
- Emit error event to affected client
- Log signaling failure with peer information
- Allow client to retry connection
- Fall back to audio-only if video transport fails

**Socket Disconnection**:
- Trigger automatic leave process
- Clean up participant state within 5 seconds
- Broadcast leave event to remaining participants
- Log disconnection reason if available

**Rate Limit Violations**:
- Return 429 with Retry-After header
- Log violation with client IP and user_id
- Implement exponential backoff for repeated violations

**Content Moderation Failures**:
- If moderation service is unavailable, queue message for later processing
- Allow message through with flag for manual review
- Log moderation service failure

### Logging Strategy

**Winston Logger Configuration**:
```typescript
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});
```

**Log Levels**:
- **error**: System failures, database errors, unhandled exceptions
- **warn**: Rate limit violations, capacity warnings, high CPU usage
- **info**: Room joins/leaves, moderation actions, timer events
- **debug**: WebRTC signaling messages, cache hits/misses

**Required Log Fields**:
- timestamp (ISO 8601)
- level (error, warn, info, debug)
- user_id (if authenticated)
- room_id (if applicable)
- endpoint (API route)
- error_message
- stack_trace (for errors)

## Testing Strategy

### Dual Testing Approach

The testing strategy employs both **unit tests** and **property-based tests** to ensure comprehensive coverage:

**Unit Tests** focus on:
- Specific examples demonstrating correct behavior
- Edge cases (empty rooms, full capacity, invalid tokens)
- Error conditions (database failures, invalid inputs)
- Integration points (JWT middleware, Prisma ORM, Socket.io)
- Database schema validation (tables exist, indexes present)

**Property-Based Tests** focus on:
- Universal properties that hold for all inputs
- Comprehensive input coverage through randomization
- Invariants (occupancy >= 0, capacity enforcement)
- Round-trip properties (join then leave restores state)
- Concurrent operation correctness

### Property-Based Testing Configuration

**Library**: Use **fast-check** for Node.js/TypeScript property-based testing

**Test Configuration**:
- Minimum **100 iterations** per property test
- Each test references its design document property
- Tag format: `// Feature: shared-study-rooms, Property N: [property text]`

**Example Property Test Structure**:
```typescript
import fc from 'fast-check';

describe('Property 2: Available Spots Calculation', () => {
  // Feature: shared-study-rooms, Property 2: Available spots calculation
  it('should calculate available spots as (capacity - occupancy) for all rooms', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }), // capacity
        fc.integer({ min: 0, max: 100 }), // occupancy
        (capacity, occupancy) => {
          fc.pre(occupancy <= capacity); // precondition
          
          const room = { capacity, current_occupancy: occupancy };
          const availableSpots = calculateAvailableSpots(room);
          
          expect(availableSpots).toBe(capacity - occupancy);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Test Coverage Requirements

**Unit Test Coverage**:
- All API endpoints (GET /rooms, POST /rooms/:id/join, etc.)
- All Socket.io event handlers
- Database models and migrations
- Authentication middleware
- Input validation schemas
- Error handling paths

**Property Test Coverage**:
- All 39 correctness properties defined above
- Each property maps to specific requirements
- Focus on data integrity, capacity enforcement, and event delivery

### Integration Testing

**Socket.io Integration Tests**:
- Use `socket.io-client` to simulate multiple clients
- Test event broadcasting across namespaces
- Verify namespace isolation
- Test disconnection handling

**Database Integration Tests**:
- Use test database with migrations
- Test transaction rollback on failures
- Verify foreign key constraints
- Test concurrent operations with row-level locking

**WebRTC Integration Tests**:
- Mock Mediasoup server for signaling tests
- Verify offer/answer/ICE candidate relay
- Test transport creation and cleanup
- Simulate high occupancy scenarios

### Load Testing

**Performance Benchmarks**:
- 500 concurrent participants across 10 rooms
- 100 messages per second across all rooms
- Join request processing < 200ms (p95)
- Event broadcast latency < 100ms (p95)

**Tools**:
- **Artillery** for HTTP endpoint load testing
- **Socket.io-client** with custom scripts for WebSocket load testing
- **k6** for comprehensive load testing scenarios

### Test Execution

**Test Commands**:
```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run property tests only
npm run test:property

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage

# Run load tests
npm run test:load
```

**CI/CD Integration**:
- Run unit and property tests on every commit
- Run integration tests on pull requests
- Run load tests nightly or before releases
- Require 80% code coverage for merges

## Implementation Notes

### Technology Stack

- **Runtime**: Node.js 18+ with TypeScript 5+
- **Framework**: Express.js 4.x
- **Real-time**: Socket.io 4.x
- **Media**: Mediasoup 3.x
- **Database**: PostgreSQL 14+ with Prisma ORM 5.x
- **Cache**: Redis 7+ (optional)
- **Testing**: Jest 29+ with fast-check 3.x
- **Logging**: Winston 3.x
- **Validation**: Joi 17.x

### File Structure

```
src/
├── components/
│   └── room/
│       ├── room.controller.ts      # HTTP request handlers
│       ├── room.service.ts         # Business logic
│       ├── room.route.ts           # Express routes
│       ├── room.validation.ts      # Joi schemas
│       ├── room.socket.ts          # Socket.io handlers
│       └── room.mediasoup.ts       # Mediasoup integration
├── middleware/
│   ├── auth.middleware.ts          # JWT validation
│   └── rateLimit.middleware.ts     # Rate limiting
├── utils/
│   ├── logger.ts                   # Winston configuration
│   └── errors.ts                   # Error classes
└── prisma/
    └── schema/
        └── room.prisma             # Room models
```

### Database Migration

**Seed Migration** (create 10 rooms):
```typescript
// prisma/migrations/XXXXXX_seed_rooms/migration.sql
INSERT INTO "Room" (id, name, capacity, current_occupancy, created_at)
VALUES
  (gen_random_uuid(), 'Study Room 1', 50, 0, NOW()),
  (gen_random_uuid(), 'Study Room 2', 50, 0, NOW()),
  (gen_random_uuid(), 'Study Room 3', 50, 0, NOW()),
  (gen_random_uuid(), 'Study Room 4', 50, 0, NOW()),
  (gen_random_uuid(), 'Study Room 5', 50, 0, NOW()),
  (gen_random_uuid(), 'Study Room 6', 50, 0, NOW()),
  (gen_random_uuid(), 'Study Room 7', 50, 0, NOW()),
  (gen_random_uuid(), 'Study Room 8', 50, 0, NOW()),
  (gen_random_uuid(), 'Study Room 9', 50, 0, NOW()),
  (gen_random_uuid(), 'Study Room 10', 50, 0, NOW());
```

### Security Considerations

**JWT Validation**:
- Verify signature with secret key
- Check expiration timestamp
- Extract user_id from payload
- Apply to all room endpoints

**Rate Limiting**:
- 100 requests per minute per user for API endpoints
- 1000 messages per hour per user for chat
- 10 join/leave operations per minute per user

**Input Sanitization**:
- Strip HTML tags from message content
- Escape special characters
- Validate message length (1-1000 characters)
- Validate room_id format (UUID)

**WebRTC Security**:
- Use DTLS-SRTP for media encryption
- Validate ICE candidates
- Implement TURN server for NAT traversal
- Rate limit signaling messages

### Performance Optimizations

**Database Indexing**:
```sql
CREATE INDEX idx_participant_room_id ON "Participant"(room_id);
CREATE INDEX idx_participant_user_id ON "Participant"(user_id);
CREATE INDEX idx_message_room_timestamp ON "Message"(room_id, timestamp);
CREATE INDEX idx_session_log_user_id ON "SessionLog"(user_id);
CREATE INDEX idx_session_log_created_at ON "SessionLog"(created_at);
```

**Redis Caching**:
- Cache room list with 5-second TTL
- Cache user authentication status
- Store rate limit counters
- Cache occupancy counts for quick lookups

**Connection Pooling**:
- PostgreSQL connection pool: 20 connections
- Redis connection pool: 10 connections
- Mediasoup worker pool: 4 workers (one per CPU core)

**Horizontal Scaling**:
- Use Redis for Socket.io adapter (multi-server support)
- Sticky sessions for WebRTC connections
- Load balancer with health checks
- Stateless API design for easy scaling
