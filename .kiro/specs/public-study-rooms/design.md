# Design Document: Public Study Rooms

## Overview

The Public Study Rooms feature provides a frictionless way for users to join temporary study sessions without authentication. The system leverages existing WebRTC/Mediasoup infrastructure for video and audio, Socket.io for real-time communication, and extends the current room management system to support anonymous users identified by hashed IP addresses.

The architecture follows a client-server model where:
- Frontend displays a public landing page with 10 available rooms
- Users provide a display name before joining
- Backend creates temporary user records using hashed IP addresses
- Real-time communication uses Socket.io for chat and presence
- WebRTC/Mediasoup handles video and audio streams
- Rate limiting and input validation protect against abuse

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Room List    │  │ Join Modal   │  │ Study Room   │      │
│  │ Page         │  │              │  │ Interface    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Layer (Express)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Public       │  │ Rate         │  │ Input        │      │
│  │ Endpoints    │  │ Limiter      │  │ Validator    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Service Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Anonymous    │  │ Public Room  │  │ Security     │      │
│  │ User Service │  │ Service      │  │ Service      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                Real-Time Layer (Socket.io)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Chat         │  │ Presence     │  │ Room         │      │
│  │ Events       │  │ Events       │  │ Updates      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Media Layer (Mediasoup/WebRTC)                  │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │ Video        │  │ Audio        │                         │
│  │ Streams      │  │ Streams      │                         │
│  └──────────────┘  └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                Database (PostgreSQL/Prisma)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Anonymous    │  │ Rooms        │  │ Rate Limit   │      │
│  │ Users        │  │              │  │ Tracking     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### Component Interaction Flow

**Room Discovery Flow:**
1. User visits homepage → Frontend requests room list
2. Backend queries 10 rooms with occupancy → Returns room data
3. Frontend displays rooms with real-time occupancy updates via Socket.io

**Join Room Flow:**
1. User selects room → Frontend shows name input modal
2. User submits name → Backend validates and sanitizes input
3. Backend hashes IP address → Creates/retrieves anonymous user record
4. Backend checks room capacity and rate limits → Adds user to room
5. Backend emits Socket.io events → All clients update participant lists
6. Frontend establishes WebRTC connection → Video/audio streams begin

**Communication Flow:**
1. User sends chat message → Backend validates and rate limits
2. Backend sanitizes message → Broadcasts via Socket.io
3. User toggles video/audio → WebRTC updates streams
4. Backend notifies all participants → UI updates in real-time

## Components and Interfaces

### Frontend Components

#### RoomListPage Component
```typescript
interface RoomListPageProps {}

interface Room {
  id: string;
  name: string;
  currentOccupancy: number;
  capacity: number;
  isFull: boolean;
}

// Displays 10 rooms with real-time occupancy
// Handles room selection and join modal trigger
// Subscribes to Socket.io for occupancy updates
```

#### JoinRoomModal Component
```typescript
interface JoinRoomModalProps {
  roomId: string;
  roomName: string;
  onJoin: (displayName: string) => Promise<void>;
  onCancel: () => void;
}

// Collects user display name
// Validates input (1-50 characters)
// Handles join request submission
```

#### StudyRoomInterface Component
```typescript
interface StudyRoomInterfaceProps {
  roomId: string;
}

interface Participant {
  id: string;
  displayName: string;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
}

// Manages video/audio streams via WebRTC
// Displays participant list
// Handles chat interface
// Controls local media (camera/microphone)
```

#### ChatPanel Component
```typescript
interface ChatPanelProps {
  roomId: string;
  userId: string;
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: Date;
}

// Displays chat messages with sender names
// Handles message input and submission
// Enforces rate limiting on client side
// Sanitizes display of messages
```

### Backend Services

#### AnonymousUserService
```typescript
interface AnonymousUserService {
  // Creates or retrieves anonymous user by hashed IP
  createOrGetUser(ipAddress: string, displayName: string): Promise<AnonymousUser>;
  
  // Updates user's display name
  updateDisplayName(userId: string, displayName: string): Promise<void>;
  
  // Removes inactive users (30+ minutes)
  cleanupInactiveUsers(): Promise<void>;
  
  // Gets user by hashed IP
  getUserByIp(ipAddress: string): Promise<AnonymousUser | null>;
}

interface AnonymousUser {
  id: string;
  hashedIp: string;
  displayName: string;
  createdAt: Date;
  lastActiveAt: Date;
}
```

#### PublicRoomService
```typescript
interface PublicRoomService {
  // Gets list of 10 public rooms with occupancy
  getPublicRooms(): Promise<PublicRoom[]>;
  
  // Adds anonymous user to room
  joinRoom(roomId: string, userId: string): Promise<JoinRoomResult>;
  
  // Removes user from room
  leaveRoom(roomId: string, userId: string): Promise<void>;
  
  // Gets current participants in room
  getRoomParticipants(roomId: string): Promise<Participant[]>;
  
  // Checks if room has capacity
  hasCapacity(roomId: string): Promise<boolean>;
}

interface PublicRoom {
  id: string;
  name: string;
  currentOccupancy: number;
  capacity: number;
  isFull: boolean;
}

interface JoinRoomResult {
  success: boolean;
  room: PublicRoom;
  participants: Participant[];
  error?: string;
}
```

#### SecurityService
```typescript
interface SecurityService {
  // Hashes IP address for storage
  hashIpAddress(ipAddress: string): string;
  
  // Validates display name
  validateDisplayName(name: string): ValidationResult;
  
  // Sanitizes user input
  sanitizeInput(input: string): string;
  
  // Checks rate limit for IP
  checkRateLimit(ipAddress: string, action: string): Promise<RateLimitResult>;
  
  // Records rate limit violation
  recordRateLimitViolation(ipAddress: string, action: string): Promise<void>;
  
  // Checks if IP is blocked
  isIpBlocked(ipAddress: string): Promise<boolean>;
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  resetTime?: Date;
}
```

### API Endpoints

#### Public REST Endpoints
```typescript
// GET /api/public/rooms
// Returns list of 10 public rooms with occupancy
// No authentication required
// Rate limit: 100 requests/minute per IP

// POST /api/public/users
// Creates anonymous user with display name
// Body: { displayName: string }
// Returns: { userId: string, displayName: string }
// Rate limit: 5 requests/minute per IP

// POST /api/public/rooms/:roomId/join
// Joins a room as anonymous user
// Body: { userId: string }
// Returns: { success: boolean, room: PublicRoom, participants: Participant[] }
// Rate limit: 5 requests/minute per IP

// POST /api/public/rooms/:roomId/leave
// Leaves a room
// Body: { userId: string }
// Returns: { success: boolean }
```

#### Socket.io Events

**Client → Server:**
```typescript
// join-room: { roomId: string, userId: string }
// leave-room: { roomId: string, userId: string }
// send-message: { roomId: string, userId: string, content: string }
// toggle-video: { roomId: string, userId: string, enabled: boolean }
// toggle-audio: { roomId: string, userId: string, enabled: boolean }
```

**Server → Client:**
```typescript
// room-occupancy-update: { roomId: string, occupancy: number }
// user-joined: { roomId: string, participant: Participant }
// user-left: { roomId: string, userId: string }
// new-message: { roomId: string, message: ChatMessage }
// participant-video-toggle: { roomId: string, userId: string, enabled: boolean }
// participant-audio-toggle: { roomId: string, userId: string, enabled: boolean }
// rate-limit-exceeded: { action: string, resetTime: Date }
```

## Data Models

### Prisma Schema Extensions

```prisma
model AnonymousUser {
  id            String   @id @default(uuid())
  hashedIp      String   @unique
  displayName   String
  createdAt     DateTime @default(now())
  lastActiveAt  DateTime @default(now())
  
  // Relations
  roomParticipations RoomParticipant[]
  chatMessages       ChatMessage[]
  
  @@index([hashedIp])
  @@index([lastActiveAt])
}

model RoomParticipant {
  id              String   @id @default(uuid())
  roomId          String
  anonymousUserId String
  joinedAt        DateTime @default(now())
  isVideoEnabled  Boolean  @default(false)
  isAudioEnabled  Boolean  @default(false)
  
  // Relations
  room          Room          @relation(fields: [roomId], references: [id], onDelete: Cascade)
  anonymousUser AnonymousUser @relation(fields: [anonymousUserId], references: [id], onDelete: Cascade)
  
  @@unique([roomId, anonymousUserId])
  @@index([roomId])
  @@index([anonymousUserId])
}

model ChatMessage {
  id              String   @id @default(uuid())
  roomId          String
  anonymousUserId String
  content         String   @db.Text
  createdAt       DateTime @default(now())
  
  // Relations
  room          Room          @relation(fields: [roomId], references: [id], onDelete: Cascade)
  anonymousUser AnonymousUser @relation(fields: [anonymousUserId], references: [id], onDelete: Cascade)
  
  @@index([roomId, createdAt])
  @@index([anonymousUserId])
}

model RateLimitRecord {
  id          String   @id @default(uuid())
  hashedIp    String
  action      String
  attempts    Int      @default(1)
  windowStart DateTime @default(now())
  blockedUntil DateTime?
  
  @@unique([hashedIp, action])
  @@index([hashedIp])
  @@index([blockedUntil])
}

// Extend existing Room model
model Room {
  // ... existing fields ...
  
  // Add new relations
  participants RoomParticipant[]
  chatMessages ChatMessage[]
}
```

### In-Memory Data Structures

```typescript
// Socket connection tracking
interface SocketConnection {
  socketId: string;
  userId: string;
  roomId: string;
  ipAddress: string;
  connectedAt: Date;
  lastPingAt: Date;
}

// Rate limit cache (Redis or in-memory)
interface RateLimitCache {
  [key: string]: {
    count: number;
    windowStart: number;
    blockedUntil?: number;
  };
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### User Management Properties

**Property 1: User Record Creation and Retrieval**
*For any* IP address and valid display name, creating a user record should store both the hashed IP and display name, and subsequent requests from the same IP should retrieve the same user record (idempotence).
**Validates: Requirements 1.3, 1.4, 1.5, 3.2**

**Property 2: Display Name Validation**
*For any* string input, the system should accept display names between 1 and 50 characters and reject all others.
**Validates: Requirements 12.1**

**Property 3: Display Name Sanitization**
*For any* display name containing HTML tags or special characters, the stored value should have those elements removed or escaped.
**Validates: Requirements 12.2**

### Room Discovery Properties

**Property 4: Room List Structure**
*For any* room in the public room list, the returned data should include room name, current occupancy, capacity, and isFull status.
**Validates: Requirements 2.2**

**Property 5: Room Full Indicator**
*For any* room where current occupancy equals capacity, the isFull flag should be true; otherwise it should be false.
**Validates: Requirements 2.4**

### Room Joining Properties

**Property 6: Room Occupancy Increment**
*For any* room and valid user, when the user joins the room, the occupancy count should increase by exactly 1.
**Validates: Requirements 3.4**

**Property 7: Room Capacity Enforcement**
*For any* room at maximum capacity, attempting to add another user should be rejected and the room state should remain unchanged.
**Validates: Requirements 3.5, 14.1**

**Property 8: Participant Addition**
*For any* valid user and room with available capacity, joining should add the user to the room's participant list.
**Validates: Requirements 3.3**

**Property 9: Single Room Membership**
*For any* IP address, attempting to join a second room while already in a room should be rejected.
**Validates: Requirements 11.5**

### Real-Time Communication Properties

**Property 10: Join Event Broadcasting**
*For any* user joining a room with existing participants, all existing participants should receive a join notification event containing the new participant's information.
**Validates: Requirements 7.3, 8.1**

**Property 11: Leave Event Broadcasting**
*For any* user leaving a room, all remaining participants should receive a leave notification event, and the user should be removed from the participant list.
**Validates: Requirements 4.5, 5.5, 7.4, 8.2**

**Property 12: Occupancy Update Broadcasting**
*For any* room occupancy change (join or leave), all viewers of the room list should receive an occupancy update event with the new count.
**Validates: Requirements 2.3, 8.3**

**Property 13: Media State Broadcasting**
*For any* participant toggling their video or audio state, all other participants in the room should receive a state change event with the updated status.
**Validates: Requirements 4.2, 4.3, 5.2, 5.3, 8.4**

### Chat Properties

**Property 14: Message Broadcasting**
*For any* valid chat message sent by a user in a room, all participants in that room should receive the message via Socket.io.
**Validates: Requirements 6.2**

**Property 15: Message Structure**
*For any* chat message, the broadcast data should include sender display name, message content, and timestamp.
**Validates: Requirements 6.4**

**Property 16: Chat History on Join**
*For any* user joining a room with existing messages, the join response should include recent chat history.
**Validates: Requirements 6.5**

**Property 17: Message Length Validation**
*For any* string input as a chat message, the system should accept messages between 1 and 1000 characters and reject all others.
**Validates: Requirements 12.3**

**Property 18: Message XSS Sanitization**
*For any* chat message containing XSS payloads or script tags, the stored and broadcast message should have those elements sanitized.
**Validates: Requirements 12.4**

### Participant Visibility Properties

**Property 19: Participant List on Join**
*For any* user joining a room, the join response should include the complete list of current participants.
**Validates: Requirements 7.1**

**Property 20: Participant Data Structure**
*For any* participant in a participant list, the data should include display name, video status, and audio status.
**Validates: Requirements 7.2, 7.5**

### Security Properties

**Property 21: IP Address Hashing**
*For any* IP address used to create a user record, the value stored in the database should be a hash, not the raw IP address.
**Validates: Requirements 10.1**

**Property 22: IP-Based Lookup**
*For any* IP address with an existing user record, looking up by that IP should retrieve the correct user record using the hashed value.
**Validates: Requirements 10.2**

**Property 23: IP Privacy in Responses**
*For any* API response containing user data, the response should not include raw IP addresses or hashed IP identifiers.
**Validates: Requirements 10.3, 10.4, 10.5**

**Property 24: SQL Injection Prevention**
*For any* user input containing SQL injection patterns, the system should reject the input or sanitize it before processing.
**Validates: Requirements 12.5**

### Rate Limiting Properties

**Property 25: API Rate Limit Enforcement**
*For any* IP address making requests to a public endpoint, the 101st request within a 60-second window should be rejected with a rate limit error.
**Validates: Requirements 11.1**

**Property 26: Rate Limit Blocking Duration**
*For any* IP address that exceeds the rate limit, subsequent requests should be blocked for 60 seconds from the time of violation.
**Validates: Requirements 11.2**

**Property 27: Chat Rate Limit Enforcement**
*For any* user sending chat messages, the 11th message within a 60-second window should be rejected.
**Validates: Requirements 11.3**

**Property 28: Chat Rate Limit Blocking**
*For any* user that exceeds the chat rate limit, subsequent messages should be blocked for 30 seconds.
**Validates: Requirements 11.4**

**Property 29: Join Attempt Rate Limiting**
*For any* IP address attempting to join rooms, the 6th join attempt within a 60-second window should be rejected.
**Validates: Requirements 13.1**

**Property 30: Join Abuse Blocking**
*For any* IP address that exceeds join attempt limits, all join requests should be blocked for 5 minutes.
**Validates: Requirements 13.2**

**Property 31: Reconnection Exponential Backoff**
*For any* IP address that disconnects and reconnects repeatedly, each subsequent reconnection attempt should have an increased minimum wait time (exponential backoff).
**Validates: Requirements 13.3**

**Property 32: Suspicious Activity Logging**
*For any* IP address that triggers rate limits or abuse detection, a log entry should be created with the IP identifier and activity type.
**Validates: Requirements 13.4**

**Property 33: Concurrent Connection Limiting**
*For any* IP address, attempting to establish a 3rd concurrent WebSocket connection should be rejected.
**Validates: Requirements 13.5**

### Resource Protection Properties

**Property 34: System Capacity Queueing**
*For any* join request when system occupancy is at 100 users, the request should be queued rather than rejected.
**Validates: Requirements 14.2**

**Property 35: Connection Health Monitoring**
*For any* WebSocket connection that fails to respond to 3 consecutive ping requests, the connection should be terminated and the user removed from their room.
**Validates: Requirements 14.5**

## Error Handling

### Input Validation Errors

**Invalid Display Name:**
- Error Code: `INVALID_DISPLAY_NAME`
- HTTP Status: 400
- Message: "Display name must be between 1 and 50 characters"
- Trigger: Display name outside valid length range

**Invalid Message Content:**
- Error Code: `INVALID_MESSAGE`
- HTTP Status: 400
- Message: "Message must be between 1 and 1000 characters"
- Trigger: Chat message outside valid length range

**Malicious Input Detected:**
- Error Code: `MALICIOUS_INPUT`
- HTTP Status: 400
- Message: "Input contains invalid characters or patterns"
- Trigger: SQL injection patterns or XSS payloads detected

### Rate Limiting Errors

**API Rate Limit Exceeded:**
- Error Code: `RATE_LIMIT_EXCEEDED`
- HTTP Status: 429
- Message: "Too many requests. Please try again in {seconds} seconds"
- Response Headers: `Retry-After: {seconds}`
- Trigger: More than 100 requests per minute per endpoint

**Chat Rate Limit Exceeded:**
- Error Code: `CHAT_RATE_LIMIT_EXCEEDED`
- Socket Event: `rate-limit-exceeded`
- Message: "Too many messages. Please wait 30 seconds"
- Trigger: More than 10 messages per minute

**Join Attempt Limit Exceeded:**
- Error Code: `JOIN_LIMIT_EXCEEDED`
- HTTP Status: 429
- Message: "Too many join attempts. Please try again in 5 minutes"
- Trigger: More than 5 join attempts per minute

**IP Blocked:**
- Error Code: `IP_BLOCKED`
- HTTP Status: 403
- Message: "Your IP has been temporarily blocked due to suspicious activity"
- Trigger: Repeated rate limit violations or abuse patterns

### Room Capacity Errors

**Room Full:**
- Error Code: `ROOM_FULL`
- HTTP Status: 409
- Message: "This room is at maximum capacity"
- Trigger: Attempting to join a room at capacity

**Already In Room:**
- Error Code: `ALREADY_IN_ROOM`
- HTTP Status: 409
- Message: "You are already in a room. Please leave your current room first"
- Trigger: Attempting to join a second room

**System At Capacity:**
- Error Code: `SYSTEM_AT_CAPACITY`
- HTTP Status: 503
- Message: "System is at maximum capacity. Your request has been queued"
- Trigger: System has 100 concurrent users

### Connection Errors

**Too Many Connections:**
- Error Code: `TOO_MANY_CONNECTIONS`
- Socket Event: `connection-rejected`
- Message: "Maximum concurrent connections reached for your IP"
- Trigger: More than 2 concurrent WebSocket connections per IP

**Connection Timeout:**
- Error Code: `CONNECTION_TIMEOUT`
- Socket Event: `disconnected`
- Message: "Connection terminated due to inactivity"
- Trigger: Failed to respond to 3 consecutive pings

**Reconnection Backoff:**
- Error Code: `RECONNECTION_THROTTLED`
- Socket Event: `connection-rejected`
- Message: "Please wait {seconds} seconds before reconnecting"
- Trigger: Rapid reconnection attempts

### Error Response Format

All HTTP errors follow this structure:
```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    retryAfter?: number; // seconds
  };
}
```

All Socket.io errors follow this structure:
```typescript
interface SocketErrorEvent {
  type: 'error';
  code: string;
  message: string;
  retryAfter?: number; // seconds
}
```

### Error Recovery Strategies

**Rate Limit Errors:**
- Client should implement exponential backoff
- Display retry timer to user
- Queue actions locally and retry after cooldown

**Capacity Errors:**
- For room full: Show alternative rooms
- For system capacity: Show queue position and estimated wait time
- Poll for availability updates

**Connection Errors:**
- Implement automatic reconnection with exponential backoff
- Preserve user state during reconnection
- Show connection status to user

**Input Validation Errors:**
- Show inline validation feedback
- Sanitize input on client side before submission
- Provide clear guidance on valid input format

## Testing Strategy

### MVP Approach - No Automated Tests

For this MVP, we are prioritizing speed of delivery over test coverage. The implementation will focus solely on functional code without automated tests.

**Testing will be done manually:**
- Manual testing of room joining flow
- Manual verification of video/audio functionality
- Manual testing of chat features
- Manual verification of rate limiting behavior
- Manual testing of security features

**Future Considerations:**
- Automated tests can be added post-MVP if needed
- The correctness properties documented above serve as a testing guide for future test implementation
- Manual QA should focus on the properties listed in the Correctness Properties section
