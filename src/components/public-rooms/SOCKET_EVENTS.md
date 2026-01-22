# Socket.io Events Documentation

This document describes all Socket.io events implemented for the Public Study Rooms feature.

## Connection

### Namespace Pattern
- **Pattern**: `/public-room/:roomId`
- **Example**: `/public-room/123e4567-e89b-12d3-a456-426614174000`
- **Description**: Each room has its own namespace for isolated communication

### Main Namespace
- **Pattern**: `/` (root namespace)
- **Description**: Used for broadcasting room occupancy updates to clients viewing the room list

## Client → Server Events

### 1. join-room
**Description**: Notifies the server that a user has joined a room via Socket.io connection.

**Payload**:
```typescript
{
  userId: string;      // Anonymous user ID
  userName: string;    // Display name
}
```

**Response**: Broadcasts `user-joined` event to all participants in the room namespace.

**Requirements**: 8.1, 8.3, 9.4

---

### 2. leave-room
**Description**: Notifies the server that a user is leaving a room.

**Payload**:
```typescript
{
  userId: string;      // Anonymous user ID
}
```

**Response**: 
- Broadcasts `user-left` event to remaining participants
- Broadcasts `room-occupancy-update` to main namespace
- Disconnects the socket

**Requirements**: 8.2, 8.3, 9.4

---

### 3. toggle-video
**Description**: Notifies the server that a user has toggled their video on/off.

**Payload**:
```typescript
{
  userId: string;      // Anonymous user ID
  enabled: boolean;    // true = video on, false = video off
}
```

**Response**: Broadcasts `participant-video-toggle` event to all participants in the room.

**Requirements**: 8.4

---

### 4. toggle-audio
**Description**: Notifies the server that a user has toggled their audio on/off.

**Payload**:
```typescript
{
  userId: string;      // Anonymous user ID
  enabled: boolean;    // true = audio on, false = audio off
}
```

**Response**: Broadcasts `participant-audio-toggle` event to all participants in the room.

**Requirements**: 8.4

---

### 5. pong
**Description**: Response to server ping for health check.

**Payload**: None

**Response**: Updates last ping timestamp and resets missed ping counter.

**Requirements**: 14.4

---

## Server → Client Events

### 1. user-joined
**Description**: Broadcast when a new user joins the room.

**Payload**:
```typescript
{
  userId: string;           // Anonymous user ID
  userName: string;         // Display name
  joinedAt: string;         // ISO timestamp
  currentOccupancy: number; // Updated room occupancy
}
```

**Broadcast Scope**: All clients in the room namespace

**Requirements**: 7.3, 8.1

---

### 2. user-left
**Description**: Broadcast when a user leaves the room.

**Payload**:
```typescript
{
  userId: string;           // Anonymous user ID
  currentOccupancy: number; // Updated room occupancy
}
```

**Broadcast Scope**: All clients in the room namespace

**Requirements**: 7.4, 8.2

---

### 3. room-occupancy-update
**Description**: Broadcast when room occupancy changes (join or leave).

**Payload**:
```typescript
{
  roomId: string;           // Room ID
  currentOccupancy: number; // Updated room occupancy
}
```

**Broadcast Scope**: All clients in the main namespace (for room list updates)

**Requirements**: 2.3, 8.3

---

### 4. participant-video-toggle
**Description**: Broadcast when a participant toggles their video.

**Payload**:
```typescript
{
  userId: string;      // Anonymous user ID
  enabled: boolean;    // true = video on, false = video off
}
```

**Broadcast Scope**: All clients in the room namespace

**Requirements**: 8.4

---

### 5. participant-audio-toggle
**Description**: Broadcast when a participant toggles their audio.

**Payload**:
```typescript
{
  userId: string;      // Anonymous user ID
  enabled: boolean;    // true = audio on, false = audio off
}
```

**Broadcast Scope**: All clients in the room namespace

**Requirements**: 8.4

---

### 6. ping
**Description**: Server health check ping sent every 5 minutes.

**Payload**: None

**Expected Response**: Client should respond with `pong` event

**Requirements**: 14.4, 14.5

---

### 7. error
**Description**: Error notification from server.

**Payload**:
```typescript
{
  code: string;        // Error code (e.g., 'INVALID_REQUEST', 'ROOM_FULL')
  message: string;     // Human-readable error message
}
```

**Broadcast Scope**: Individual client that triggered the error

---

## Connection Limits

- **Max concurrent connections per IP**: 2
- **Health check interval**: 5 minutes
- **Max missed pings**: 3 (connection terminated after 3 missed pings)

## Error Codes

- `TOO_MANY_CONNECTIONS`: IP has reached max concurrent connections (2)
- `CONNECTION_ERROR`: Failed to establish connection
- `INVALID_REQUEST`: Missing required parameters
- `INVALID_USER`: User not found or IP mismatch
- `ROOM_NOT_FOUND`: Room does not exist
- `JOIN_ERROR`: Failed to process join request
- `LEAVE_ERROR`: Failed to leave room
- `TOGGLE_VIDEO_ERROR`: Failed to toggle video status
- `TOGGLE_AUDIO_ERROR`: Failed to toggle audio status
- `CONNECTION_TIMEOUT`: Connection terminated due to inactivity

## Example Client Usage

### Connecting to a Room
```typescript
import io from 'socket.io-client';

// Connect to specific room namespace
const socket = io(`http://localhost:3000/public-room/${roomId}`, {
  transports: ['websocket', 'polling'],
});

// Listen for connection
socket.on('connect', () => {
  console.log('Connected to room');
  
  // Join the room
  socket.emit('join-room', {
    userId: 'user-123',
    userName: 'John Doe'
  });
});
```

### Listening for Events
```typescript
// Listen for new participants
socket.on('user-joined', (data) => {
  console.log(`${data.userName} joined the room`);
  console.log(`Current occupancy: ${data.currentOccupancy}`);
});

// Listen for participants leaving
socket.on('user-left', (data) => {
  console.log(`User ${data.userId} left the room`);
  console.log(`Current occupancy: ${data.currentOccupancy}`);
});

// Listen for video toggles
socket.on('participant-video-toggle', (data) => {
  console.log(`User ${data.userId} video: ${data.enabled ? 'ON' : 'OFF'}`);
});

// Listen for audio toggles
socket.on('participant-audio-toggle', (data) => {
  console.log(`User ${data.userId} audio: ${data.enabled ? 'ON' : 'OFF'}`);
});

// Handle errors
socket.on('error', (error) => {
  console.error(`Error: ${error.code} - ${error.message}`);
});

// Respond to health checks
socket.on('ping', () => {
  socket.emit('pong');
});
```

### Toggling Media
```typescript
// Toggle video
socket.emit('toggle-video', {
  userId: 'user-123',
  enabled: true
});

// Toggle audio
socket.emit('toggle-audio', {
  userId: 'user-123',
  enabled: false
});
```

### Leaving a Room
```typescript
socket.emit('leave-room', {
  userId: 'user-123'
});

// Or just disconnect
socket.disconnect();
```

### Listening for Room List Updates
```typescript
// Connect to main namespace for room list updates
const mainSocket = io('http://localhost:3000', {
  transports: ['websocket', 'polling'],
});

mainSocket.on('room-occupancy-update', (data) => {
  console.log(`Room ${data.roomId} occupancy: ${data.currentOccupancy}`);
  // Update room list UI
});
```

## Implementation Notes

1. **Automatic Cleanup**: When a socket disconnects (network issue, browser close, etc.), the server automatically:
   - Removes the user from the room
   - Decrements room occupancy
   - Broadcasts `user-left` event to remaining participants
   - Broadcasts `room-occupancy-update` to main namespace

2. **Database Persistence**: Video and audio toggle states are persisted in the database (`RoomParticipant` table) so they can be retrieved when listing participants.

3. **Namespace Isolation**: Each room has its own namespace, ensuring events are only broadcast to participants in that specific room.

4. **Main Namespace Broadcasting**: Room occupancy updates are broadcast to the main namespace so clients viewing the room list can see real-time updates without joining specific room namespaces.

5. **Health Checks**: The server sends ping events every 5 minutes. Clients should respond with pong. After 3 missed pings, the connection is terminated and cleanup is performed.
