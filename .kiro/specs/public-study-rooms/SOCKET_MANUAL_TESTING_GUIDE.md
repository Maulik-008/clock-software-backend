# Socket.io Manual Testing Guide - Public Study Rooms

## Overview

This guide provides comprehensive instructions for manually testing the Socket.io real-time functionality for Public Study Rooms. This is **Task 12 Checkpoint** - verify all Socket.io events work correctly before proceeding to frontend implementation.

## ⚠️ IMPORTANT: This is Manual Testing Only

**DO NOT create automated tests.** This checkpoint is for manual verification of Socket.io functionality using browser developer tools and testing utilities.

## Prerequisites

### 1. Backend Server Running

Ensure the backend server is running:

```bash
cd clock-software-backend
npm run dev
```

The server should show:
```
Socket.io server initialized for Public Study Rooms
Public room Socket.io namespaces available at /public-room/:roomId
```

### 2. Database Setup

Ensure you have:
- ✅ 10 rooms created in the database
- ✅ At least one anonymous user created (from previous REST API testing)

### 3. Testing Tools

You'll need one of the following:

**Option A: Browser Developer Console (Recommended)**
- Open multiple browser tabs/windows
- Use browser DevTools console to run Socket.io client code

**Option B: Socket.io Client Testing Tool**
- Use online tools like: https://amritb.github.io/socketio-client-tool/
- Or install a Socket.io client extension

**Option C: Node.js Script**
- Create a simple Node.js script with socket.io-client

## Setup: Install Socket.io Client in Browser

For browser testing, you'll need to load the Socket.io client library. Open your browser console and run:

```javascript
// Load Socket.io client library
const script = document.createElement('script');
script.src = 'https://cdn.socket.io/4.5.4/socket.io.min.js';
document.head.appendChild(script);

// Wait a moment for it to load, then verify
setTimeout(() => {
  console.log('Socket.io loaded:', typeof io !== 'undefined');
}, 1000);
```

## Test Suite

---

## ✅ Test 1: Basic Connection to Room Namespace

**Objective**: Verify that clients can connect to a room-specific namespace.

**Steps**:

1. Get a room ID from your database (use Prisma Studio or REST API)
2. Open browser console and run:

```javascript
// Replace ROOM_ID with actual room UUID
const roomId = 'YOUR_ROOM_ID_HERE';
const socket = io(`http://localhost:8100/public-room/${roomId}`, {
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => {
  console.log('✅ Connected to room namespace:', socket.id);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error);
});

socket.on('error', (error) => {
  console.error('❌ Server error:', error);
});
```

**Expected Results**:
- ✅ Console shows "Connected to room namespace" with socket ID
- ✅ No connection errors
- ✅ Server logs show new connection

**Validation Points**:
- Connection establishes successfully
- Socket ID is generated
- No errors in browser or server console

---

## ✅ Test 2: Join Room Event

**Objective**: Verify that join-room event broadcasts to all participants.

**Setup**: Open **TWO browser tabs** (Tab A and Tab B)

**Tab A - First User**:
```javascript
const roomId = 'YOUR_ROOM_ID_HERE';
const userId1 = 'YOUR_USER_ID_1';  // From REST API user creation

const socket1 = io(`http://localhost:8100/public-room/${roomId}`);

socket1.on('connect', () => {
  console.log('Tab A connected:', socket1.id);
  
  // Join the room
  socket1.emit('join-room', {
    userId: userId1,
    userName: 'Test User 1'
  });
});

// Listen for user-joined events
socket1.on('user-joined', (data) => {
  console.log('👤 User joined:', data);
});

// Listen for chat history
socket1.on('chat-history', (data) => {
  console.log('💬 Chat history:', data);
});
```

**Tab B - Second User** (wait for Tab A to connect first):
```javascript
const roomId = 'YOUR_ROOM_ID_HERE';  // Same room ID
const userId2 = 'YOUR_USER_ID_2';    // Different user ID

const socket2 = io(`http://localhost:8100/public-room/${roomId}`);

socket2.on('connect', () => {
  console.log('Tab B connected:', socket2.id);
  
  // Join the room
  socket2.emit('join-room', {
    userId: userId2,
    userName: 'Test User 2'
  });
});

// Listen for user-joined events
socket2.on('user-joined', (data) => {
  console.log('👤 User joined:', data);
});

// Listen for chat history
socket2.on('chat-history', (data) => {
  console.log('💬 Chat history:', data);
});
```

**Expected Results**:
- ✅ Tab A receives `user-joined` event for User 1
- ✅ Tab B receives `user-joined` event for User 2
- ✅ Tab A receives `user-joined` event for User 2 (broadcast)
- ✅ Both tabs receive `chat-history` event (may be empty)
- ✅ `user-joined` event includes: userId, userName, joinedAt, currentOccupancy

**Validation Points**:
- Join events broadcast to all participants
- Chat history is sent on join
- Occupancy count increments correctly
- All required fields present in events

---

## ✅ Test 3: Leave Room Event

**Objective**: Verify that leave-room event broadcasts to remaining participants.

**Setup**: Continue from Test 2 with both tabs connected

**Tab B - Leave the room**:
```javascript
// In Tab B console
socket2.emit('leave-room', {
  userId: userId2
});
```

**Expected Results in Tab A**:
```javascript
// Tab A should receive:
socket1.on('user-left', (data) => {
  console.log('👋 User left:', data);
  // Should show: { userId: 'user-2-id', currentOccupancy: 1 }
});
```

**Expected Results in Tab B**:
- ✅ Socket disconnects automatically
- ✅ Connection closes

**Validation Points**:
- ✅ Tab A receives `user-left` event with correct userId
- ✅ Occupancy count decrements correctly
- ✅ Tab B socket disconnects
- ✅ Server logs show cleanup

---

## ✅ Test 4: Automatic Disconnect Cleanup

**Objective**: Verify that disconnecting a socket automatically triggers cleanup.

**Setup**: Continue from Test 2 with Tab A still connected

**Tab A - Disconnect without explicit leave**:
```javascript
// In Tab A console
socket1.disconnect();
```

**Expected Results**:
- ✅ Server automatically calls leave process
- ✅ Room occupancy decrements
- ✅ If other users were connected, they would receive `user-left` event

**Validation Points**:
- Automatic cleanup on disconnect
- Database updated (check with Prisma Studio)
- No orphaned participant records

---

## ✅ Test 5: Chat Message Broadcasting

**Objective**: Verify that chat messages broadcast to all participants.

**Setup**: Open **TWO browser tabs** and join the same room (repeat Test 2 setup)

**Tab A - Send a message**:
```javascript
// Listen for new messages
socket1.on('new-message', (data) => {
  console.log('💬 New message:', data);
});

// Send a message
socket1.emit('send-message', {
  userId: userId1,
  content: 'Hello from Tab A!'
});
```

**Tab B - Listen for messages**:
```javascript
// Listen for new messages
socket2.on('new-message', (data) => {
  console.log('💬 New message:', data);
});
```

**Expected Results**:
- ✅ Both Tab A and Tab B receive `new-message` event
- ✅ Message includes: id, userId, userName, content, timestamp
- ✅ Content is sanitized (no HTML/script tags)
- ✅ Message is stored in database

**Validation Points**:
- Messages broadcast to all participants
- Sender receives their own message
- All required fields present
- Timestamp is ISO format

---

## ✅ Test 6: Chat Rate Limiting

**Objective**: Verify that chat rate limiting (10 messages/minute) works.

**Setup**: Continue from Test 5 with Tab A connected

**Tab A - Send 11 messages rapidly**:
```javascript
// Listen for rate limit errors
socket1.on('rate-limit-exceeded', (data) => {
  console.log('⚠️ Rate limit exceeded:', data);
});

// Send 11 messages
for (let i = 1; i <= 11; i++) {
  socket1.emit('send-message', {
    userId: userId1,
    content: `Message ${i}`
  });
}
```

**Expected Results**:
- ✅ First 10 messages succeed and broadcast
- ✅ 11th message triggers `rate-limit-exceeded` event
- ✅ Event includes: action, message, resetTime
- ✅ Message says "Too many messages. Please wait 30 seconds"

**Validation Points**:
- Rate limit enforced at 10 messages/minute
- Appropriate error event sent
- Includes retry time information
- Server logs rate limit violation

---

## ✅ Test 7: Video Toggle Broadcasting

**Objective**: Verify that video toggle events broadcast to all participants.

**Setup**: Open **TWO browser tabs** and join the same room

**Tab A - Toggle video**:
```javascript
// Listen for video toggle events
socket1.on('participant-video-toggle', (data) => {
  console.log('📹 Video toggle:', data);
});

// Toggle video on
socket1.emit('toggle-video', {
  userId: userId1,
  enabled: true
});

// Wait a moment, then toggle off
setTimeout(() => {
  socket1.emit('toggle-video', {
    userId: userId1,
    enabled: false
  });
}, 2000);
```

**Tab B - Listen for toggles**:
```javascript
socket2.on('participant-video-toggle', (data) => {
  console.log('📹 Video toggle:', data);
});
```

**Expected Results**:
- ✅ Both tabs receive `participant-video-toggle` events
- ✅ Event includes: userId, enabled (boolean)
- ✅ Database updated (check RoomParticipant.isVideoEnabled)
- ✅ Both ON and OFF toggles work

**Validation Points**:
- Video toggles broadcast to all participants
- Boolean state is correct
- Database persists state
- Both tabs receive events

---

## ✅ Test 8: Audio Toggle Broadcasting

**Objective**: Verify that audio toggle events broadcast to all participants.

**Setup**: Continue from Test 7 with both tabs connected

**Tab A - Toggle audio**:
```javascript
// Listen for audio toggle events
socket1.on('participant-audio-toggle', (data) => {
  console.log('🎤 Audio toggle:', data);
});

// Toggle audio on
socket1.emit('toggle-audio', {
  userId: userId1,
  enabled: true
});

// Wait a moment, then toggle off
setTimeout(() => {
  socket1.emit('toggle-audio', {
    userId: userId1,
    enabled: false
  });
}, 2000);
```

**Tab B - Listen for toggles**:
```javascript
socket2.on('participant-audio-toggle', (data) => {
  console.log('🎤 Audio toggle:', data);
});
```

**Expected Results**:
- ✅ Both tabs receive `participant-audio-toggle` events
- ✅ Event includes: userId, enabled (boolean)
- ✅ Database updated (check RoomParticipant.isAudioEnabled)
- ✅ Both ON and OFF toggles work

**Validation Points**:
- Audio toggles broadcast to all participants
- Boolean state is correct
- Database persists state
- Both tabs receive events

---

## ✅ Test 9: Room Occupancy Updates to Main Namespace

**Objective**: Verify that room occupancy updates broadcast to the main namespace for room list updates.

**Setup**: Open **THREE browser tabs**

**Tab A - Connect to main namespace (room list viewer)**:
```javascript
const mainSocket = io('http://localhost:8100', {
  transports: ['websocket', 'polling'],
});

mainSocket.on('connect', () => {
  console.log('Connected to main namespace');
});

mainSocket.on('room-occupancy-update', (data) => {
  console.log('📊 Room occupancy update:', data);
  // Should show: { roomId: 'xxx', currentOccupancy: N }
});
```

**Tab B - Join a room**:
```javascript
const roomId = 'YOUR_ROOM_ID_HERE';
const socket1 = io(`http://localhost:8100/public-room/${roomId}`);

socket1.on('connect', () => {
  socket1.emit('join-room', {
    userId: 'user-1-id',
    userName: 'User 1'
  });
});
```

**Tab C - Join the same room**:
```javascript
const roomId = 'YOUR_ROOM_ID_HERE';  // Same room
const socket2 = io(`http://localhost:8100/public-room/${roomId}`);

socket2.on('connect', () => {
  socket2.emit('join-room', {
    userId: 'user-2-id',
    userName: 'User 2'
  });
});
```

**Expected Results in Tab A**:
- ✅ Receives `room-occupancy-update` when Tab B joins (occupancy: 1)
- ✅ Receives `room-occupancy-update` when Tab C joins (occupancy: 2)
- ✅ Event includes: roomId, currentOccupancy

**Validation Points**:
- Main namespace receives occupancy updates
- Updates sent on both join and leave
- Correct room ID and occupancy count
- Room list viewers can update UI in real-time

---

## ✅ Test 10: Concurrent Connection Limiting

**Objective**: Verify that IP addresses are limited to 2 concurrent connections.

**Setup**: Open **THREE browser tabs** from the same IP

**Tab A - First connection**:
```javascript
const socket1 = io(`http://localhost:8100/public-room/${roomId}`);
socket1.on('connect', () => console.log('Socket 1 connected'));
socket1.on('error', (err) => console.error('Socket 1 error:', err));
```

**Tab B - Second connection**:
```javascript
const socket2 = io(`http://localhost:8100/public-room/${roomId}`);
socket2.on('connect', () => console.log('Socket 2 connected'));
socket2.on('error', (err) => console.error('Socket 2 error:', err));
```

**Tab C - Third connection (should be rejected)**:
```javascript
const socket3 = io(`http://localhost:8100/public-room/${roomId}`);
socket3.on('connect', () => console.log('Socket 3 connected'));
socket3.on('error', (err) => console.error('Socket 3 error:', err));
```

**Expected Results**:
- ✅ Socket 1 connects successfully
- ✅ Socket 2 connects successfully
- ✅ Socket 3 receives error: `TOO_MANY_CONNECTIONS`
- ✅ Socket 3 disconnects automatically

**Validation Points**:
- Maximum 2 concurrent connections per IP
- 3rd connection rejected with appropriate error
- Error message: "Maximum concurrent connections reached for your IP"

---

## ✅ Test 11: Health Check Ping/Pong

**Objective**: Verify that server sends ping and expects pong response.

**Note**: This test requires waiting 5 minutes for the ping interval.

**Setup**: Connect to a room and wait

**Tab A - Set up ping/pong handlers**:
```javascript
const socket = io(`http://localhost:8100/public-room/${roomId}`);

socket.on('connect', () => {
  console.log('Connected, waiting for ping...');
  
  socket.emit('join-room', {
    userId: userId1,
    userName: 'Test User'
  });
});

// Listen for ping
socket.on('ping', () => {
  console.log('📡 Received ping from server');
  
  // Respond with pong
  socket.emit('pong');
  console.log('📡 Sent pong to server');
});

// Listen for timeout errors
socket.on('error', (error) => {
  console.error('❌ Error:', error);
});
```

**Expected Results** (after 5 minutes):
- ✅ Server sends `ping` event
- ✅ Client receives ping
- ✅ Client responds with `pong`
- ✅ Connection remains active

**To Test Missed Pings** (don't respond to pong):
```javascript
socket.on('ping', () => {
  console.log('📡 Received ping - NOT responding');
  // Don't send pong
});
```

**Expected Results** (after 15 minutes = 3 missed pings):
- ✅ Server terminates connection
- ✅ Client receives `CONNECTION_TIMEOUT` error
- ✅ Socket disconnects
- ✅ Automatic cleanup occurs

**Validation Points**:
- Ping sent every 5 minutes
- Pong response resets missed ping counter
- 3 missed pings trigger disconnection
- Automatic cleanup on timeout

---

## ✅ Test 12: Input Validation and Sanitization

**Objective**: Verify that chat messages are validated and sanitized.

**Setup**: Connect to a room

**Test 12a - Empty message**:
```javascript
socket.emit('send-message', {
  userId: userId1,
  content: ''
});

socket.on('error', (error) => {
  console.log('Error:', error);
  // Should show: INVALID_MESSAGE
});
```

**Test 12b - Message too long (>1000 characters)**:
```javascript
const longMessage = 'a'.repeat(1001);
socket.emit('send-message', {
  userId: userId1,
  content: longMessage
});

socket.on('error', (error) => {
  console.log('Error:', error);
  // Should show: INVALID_MESSAGE
});
```

**Test 12c - XSS attempt**:
```javascript
socket.emit('send-message', {
  userId: userId1,
  content: '<script>alert("XSS")</script>Hello'
});

socket.on('new-message', (data) => {
  console.log('Sanitized message:', data.content);
  // Should NOT contain <script> tags
});
```

**Expected Results**:
- ✅ Empty messages rejected with `INVALID_MESSAGE`
- ✅ Messages >1000 chars rejected
- ✅ HTML/script tags sanitized from messages
- ✅ Appropriate error messages returned

**Validation Points**:
- Message length validation (1-1000 characters)
- XSS sanitization works
- Error codes are correct
- Sanitized content is safe

---

## ✅ Test 13: Reconnection Backoff

**Objective**: Verify that rapid reconnections trigger exponential backoff.

**Setup**: Connect and disconnect rapidly

**Tab A - Rapid reconnection test**:
```javascript
let attemptCount = 0;

function connectAndDisconnect() {
  attemptCount++;
  console.log(`Attempt ${attemptCount}`);
  
  const socket = io(`http://localhost:8100/public-room/${roomId}`);
  
  socket.on('connect', () => {
    console.log('Connected');
    setTimeout(() => socket.disconnect(), 100);
  });
  
  socket.on('error', (error) => {
    console.error('Error:', error);
  });
}

// Attempt to connect 5 times rapidly
for (let i = 0; i < 5; i++) {
  setTimeout(() => connectAndDisconnect(), i * 200);
}
```

**Expected Results**:
- ✅ First 2-3 connections succeed
- ✅ Subsequent connections receive `RECONNECTION_THROTTLED` error
- ✅ Error includes backoff time (1s, 2s, 4s, etc.)
- ✅ Server logs suspicious activity

**Validation Points**:
- Exponential backoff applied after 3 reconnections
- Backoff time increases: 1s → 2s → 4s → 8s
- Maximum backoff is 60 seconds
- Suspicious activity logged

---

## Testing Summary Checklist

After completing all tests, verify:

### Real-Time Events
- [ ] ✅ Clients can connect to room namespaces
- [ ] ✅ Join events broadcast to all participants
- [ ] ✅ Leave events broadcast to remaining participants
- [ ] ✅ Automatic cleanup on disconnect
- [ ] ✅ Chat messages broadcast to all participants
- [ ] ✅ Video toggle events broadcast correctly
- [ ] ✅ Audio toggle events broadcast correctly
- [ ] ✅ Room occupancy updates broadcast to main namespace

### Rate Limiting
- [ ] ✅ Chat rate limiting (10 messages/minute) enforced
- [ ] ✅ Rate limit errors include retry time
- [ ] ✅ Concurrent connection limit (2 per IP) enforced

### Security & Validation
- [ ] ✅ Message length validation works
- [ ] ✅ XSS sanitization prevents script injection
- [ ] ✅ Invalid inputs return appropriate errors
- [ ] ✅ User verification prevents unauthorized actions

### Connection Management
- [ ] ✅ Health check ping/pong works
- [ ] ✅ Missed pings trigger disconnection
- [ ] ✅ Reconnection backoff prevents abuse
- [ ] ✅ Automatic cleanup on all disconnect scenarios

### Database Persistence
- [ ] ✅ Chat messages stored in database
- [ ] ✅ Video/audio states persisted
- [ ] ✅ Participant records cleaned up on leave
- [ ] ✅ Room occupancy counts accurate

## Common Issues and Solutions

### Issue: "Socket.io is not defined"
**Solution**: Load the Socket.io client library first (see Setup section)

### Issue: "Connection refused"
**Solution**: Ensure backend server is running on correct port (check server.ts)

### Issue: "Events not broadcasting"
**Solution**: Verify both clients are connected to the same room namespace

### Issue: "Rate limit not working"
**Solution**: Check RateLimiterService is initialized and cache is working

### Issue: "Ping/pong not working"
**Solution**: Wait full 5 minutes for first ping. Check server logs for ping interval.

## Next Steps

Once all tests pass:

1. ✅ Mark Task 12 as complete
2. Document any issues or unexpected behaviors
3. Proceed to Task 13: Frontend implementation (RoomListPage)
4. Frontend can now integrate with these verified Socket.io events

## Questions or Issues?

If you encounter problems during testing:
- Check server logs for detailed error messages
- Use browser DevTools Network tab to inspect WebSocket frames
- Review implementation files:
  - `public-rooms.socket.ts` - Main Socket.io server
  - `connection-manager.service.ts` - Connection limits and backoff
  - `rate-limiter.service.ts` - Rate limiting logic
- Check documentation:
  - `SOCKET_EVENTS.md` - Event specifications
  - `SOCKET_IMPLEMENTATION.md` - Implementation details

---

**Last Updated**: Task 12 Checkpoint  
**Status**: Ready for Manual Testing  
**Requirements Validated**: 6.2, 6.4, 6.5, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4, 9.4, 11.3, 12.3, 12.4, 13.3, 13.5, 14.4, 14.5
