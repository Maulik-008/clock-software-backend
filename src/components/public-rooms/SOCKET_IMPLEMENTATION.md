# Public Rooms Socket.io Implementation

## Overview

This document describes the Socket.io implementation for Public Study Rooms, which handles real-time communication for anonymous users joining public rooms.

## Architecture

### Namespace Pattern

The implementation uses dynamic namespaces following the pattern:
```
/public-room/:roomId
```

Each room gets its own isolated namespace for event handling and participant tracking.

### Key Features

1. **IP-Based Connection Limiting** (Requirement 13.5)
   - Maximum 2 concurrent WebSocket connections per IP address
   - Connections are tracked using hashed IP addresses
   - Stale connections (older than 1 hour) are automatically cleaned up

2. **WebSocket Health Checks** (Requirements 14.4, 14.5)
   - Ping sent every 5 minutes to idle connections
   - Maximum 3 missed pings before connection termination
   - Automatic cleanup of inactive connections

3. **Automatic Disconnect Cleanup** (Requirement 14.5)
   - When a socket disconnects, the user is automatically removed from the room
   - Room occupancy is decremented
   - Other participants are notified via `user-left` event

## Events

### Client → Server

#### `join-room`
Notifies the server that a user has joined the room.

**Payload:**
```typescript
{
  userId: string;
  userName: string;
}
```

**Response:**
- Success: Broadcasts `user-joined` event to all participants
- Error: Emits `error` event to the client

#### `leave-room`
Notifies the server that a user is leaving the room.

**Payload:**
```typescript
{
  userId: string;
}
```

**Response:**
- Success: Broadcasts `user-left` event to remaining participants
- Error: Emits `error` event to the client

#### `pong`
Response to server ping for health check.

**Payload:** None

### Server → Client

#### `user-joined`
Broadcasted when a user joins the room.

**Payload:**
```typescript
{
  userId: string;
  userName: string;
  joinedAt: string; // ISO timestamp
  currentOccupancy: number;
}
```

#### `user-left`
Broadcasted when a user leaves the room.

**Payload:**
```typescript
{
  userId: string;
  currentOccupancy: number;
}
```

#### `ping`
Sent by server to check connection health.

**Payload:** None

**Expected Response:** Client should emit `pong` event

#### `error`
Sent when an error occurs.

**Payload:**
```typescript
{
  code: string;
  message: string;
}
```

**Error Codes:**
- `TOO_MANY_CONNECTIONS`: IP has reached maximum concurrent connections (2)
- `CONNECTION_ERROR`: Failed to establish connection
- `INVALID_REQUEST`: Missing required data (Room ID or User ID)
- `INVALID_USER`: User not found or doesn't match IP address
- `ROOM_NOT_FOUND`: Room doesn't exist
- `JOIN_ERROR`: Failed to process join request
- `LEAVE_ERROR`: Failed to process leave request
- `CONNECTION_TIMEOUT`: Connection terminated due to inactivity

## Connection Flow

### 1. Connection Establishment

```
Client                          Server
  |                               |
  |--- Connect to namespace ----->|
  |                               |
  |<--- Check IP limit ----------|
  |                               |
  |<--- Initialize ping tracking -|
  |                               |
  |<--- Setup event listeners ---|
  |                               |
  |<--- Connection success -------|
```

### 2. Join Room

```
Client                          Server
  |                               |
  |--- join-room event ---------->|
  |                               |
  |<--- Verify user -------------|
  |                               |
  |<--- Get room info -----------|
  |                               |
  |<--- Broadcast user-joined ---|
  |                               |
```

### 3. Leave Room

```
Client                          Server
  |                               |
  |--- leave-room event --------->|
  |                               |
  |<--- Update room occupancy ---|
  |                               |
  |<--- Broadcast user-left -----|
  |                               |
  |<--- Disconnect socket -------|
```

### 4. Automatic Cleanup on Disconnect

```
Client                          Server
  |                               |
  |--- disconnect --------------->|
  |                               |
  |<--- Remove from tracking ----|
  |                               |
  |<--- Leave room --------------|
  |                               |
  |<--- Broadcast user-left -----|
```

## Health Check Mechanism

The server implements a ping/pong health check system:

1. Every 5 minutes, the server checks all connected sockets
2. For sockets idle for more than 5 minutes, a `ping` event is sent
3. Client must respond with `pong` event
4. If client fails to respond to 3 consecutive pings, connection is terminated

**Timeline Example:**
```
T+0:00  - Socket connects
T+5:00  - First ping sent
T+5:01  - Pong received (missed pings: 0)
T+10:00 - Second ping sent
T+10:30 - No pong received (missed pings: 1)
T+15:00 - Third ping sent
T+15:30 - No pong received (missed pings: 2)
T+20:00 - Fourth ping sent
T+20:30 - No pong received (missed pings: 3)
T+20:30 - Connection terminated
```

## Connection Limiting

The server enforces a limit of 2 concurrent WebSocket connections per IP address:

1. IP addresses are hashed using SHA-256 before tracking
2. Each connection is stored with its socket ID and connection timestamp
3. Stale connections (older than 1 hour) are automatically removed
4. When a new connection is attempted:
   - Active connections are counted
   - If count >= 2, connection is rejected with `TOO_MANY_CONNECTIONS` error
   - Otherwise, connection is added to tracking

## Integration with REST API

The Socket.io server works alongside the REST API:

1. **User Creation**: REST API creates anonymous user via `/api/public/users`
2. **Room Join**: REST API adds user to room via `/api/public/rooms/:roomId/join`
3. **WebSocket Connection**: Client connects to `/public-room/:roomId` namespace
4. **Join Event**: Client emits `join-room` event to notify other participants
5. **Real-time Updates**: All participants receive `user-joined` event

## Usage Example

### Client-Side (TypeScript)

```typescript
import { io, Socket } from 'socket.io-client';

// Connect to public room namespace
const roomId = 'abc-123-def-456';
const socket: Socket = io(`http://localhost:8100/public-room/${roomId}`, {
  transports: ['websocket', 'polling'],
});

// Handle connection
socket.on('connect', () => {
  console.log('Connected to public room');
  
  // Emit join-room event
  socket.emit('join-room', {
    userId: 'user-id',
    userName: 'John Doe',
  });
});

// Listen for user-joined events
socket.on('user-joined', (data) => {
  console.log(`${data.userName} joined the room`);
  console.log(`Current occupancy: ${data.currentOccupancy}`);
});

// Listen for user-left events
socket.on('user-left', (data) => {
  console.log(`User ${data.userId} left the room`);
  console.log(`Current occupancy: ${data.currentOccupancy}`);
});

// Handle ping/pong for health checks
socket.on('ping', () => {
  socket.emit('pong');
});

// Handle errors
socket.on('error', (error) => {
  console.error('Socket error:', error);
});

// Leave room
function leaveRoom(userId: string) {
  socket.emit('leave-room', { userId });
}

// Disconnect
function disconnect() {
  socket.disconnect();
}
```

## Server Initialization

The public rooms socket server is initialized in `src/server.ts`:

```typescript
import { initializePublicRoomSocketServer } from './components/public-rooms/public-rooms.socket';

// Create HTTP server
const httpServer = createServer(app);

// Initialize public rooms socket server
const publicSocketServer = initializePublicRoomSocketServer(httpServer);
```

## Utility Methods

The `PublicRoomSocketServer` class provides utility methods:

### `broadcastToPublicRoom(roomId, event, data)`
Broadcasts an event to all participants in a public room from outside the socket handlers (e.g., from REST API endpoints).

```typescript
import { getPublicRoomSocketServer } from './components/public-rooms';

const socketServer = getPublicRoomSocketServer();
if (socketServer) {
  socketServer.broadcastToPublicRoom(roomId, 'room-update', {
    message: 'Room capacity changed',
  });
}
```

### `getConnectionCount(ipAddress)`
Gets the number of active connections for an IP address.

```typescript
const count = socketServer.getConnectionCount('192.168.1.1');
console.log(`Active connections: ${count}`);
```

### `stopHealthChecks()`
Stops the WebSocket health check interval (useful for testing or shutdown).

```typescript
socketServer.stopHealthChecks();
```

## Testing

### Manual Testing

1. Start the server: `npm run dev`
2. Connect to a public room namespace using a Socket.io client
3. Emit `join-room` event with user data
4. Verify `user-joined` event is received
5. Open another connection from the same IP
6. Verify both connections work
7. Open a third connection from the same IP
8. Verify connection is rejected with `TOO_MANY_CONNECTIONS` error
9. Wait 5 minutes without activity
10. Verify `ping` event is received
11. Respond with `pong` event
12. Verify connection stays alive
13. Ignore 3 consecutive pings
14. Verify connection is terminated

### Integration with REST API

1. Create anonymous user: `POST /api/public/users`
2. Join room: `POST /api/public/rooms/:roomId/join`
3. Connect to Socket.io namespace: `/public-room/:roomId`
4. Emit `join-room` event
5. Verify other participants receive `user-joined` event
6. Leave room: `POST /api/public/rooms/:roomId/leave`
7. Verify other participants receive `user-left` event

## Requirements Validation

- ✅ **Requirement 9.4**: Public WebSocket endpoints for real-time communication
- ✅ **Requirement 13.5**: Limit WebSocket connections to 2 concurrent connections per IP
- ✅ **Requirement 14.4**: Send ping to verify connection when idle for 5 minutes
- ✅ **Requirement 14.5**: Terminate connection after 3 consecutive failed pings

## Future Enhancements

1. **Redis Integration**: Store connection tracking in Redis for multi-server deployments
2. **Reconnection Handling**: Implement exponential backoff for rapid reconnections
3. **Rate Limiting**: Add rate limiting for socket events (similar to REST API)
4. **Metrics**: Add monitoring and metrics for connection counts, ping/pong latency, etc.
5. **WebRTC Integration**: Add WebRTC signaling events for video/audio streams
