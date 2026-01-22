# Manual Testing Guide - Public Study Rooms Backend APIs

## Overview

This guide provides instructions for manually testing the Public Study Rooms backend REST APIs. This is a checkpoint to verify that all endpoints work correctly before proceeding with Socket.io implementation.

## Prerequisites

### 1. Database Setup

Ensure the database has been migrated with the new schema:

```bash
npm run prisma:migrate
```

### 2. Create Test Rooms

The API expects 10 rooms to exist in the database. You need to create them manually or update the seed file.

**Option A: Using Prisma Studio (Recommended)**

```bash
npm run prisma:studio
```

Then create 10 rooms with the following structure:
- **name**: "Study Room 1" through "Study Room 10"
- **capacity**: 10 (or any number you prefer)
- **currentOccupancy**: 0

**Option B: Update seed.ts**

Add this code to `prisma/seed.ts` after the user creation:

```typescript
// Create 10 public study rooms
for (let i = 1; i <= 10; i++) {
    await prisma.room.upsert({
        where: { name: `Study Room ${i}` },
        update: {},
        create: {
            name: `Study Room ${i}`,
            capacity: 10,
            currentOccupancy: 0,
        },
    });
}
console.log("Created 10 study rooms");
```

Then run:
```bash
npm run db:seed
```

### 3. Start the Server

```bash
npm run dev
```

The server should start on `http://localhost:3000` (or your configured port).

## Testing Checklist

### ✅ Test 1: Get Public Rooms List

**Endpoint:** `GET /api/public/rooms`

**Expected Behavior:**
- Returns 200 OK
- Returns exactly 10 rooms
- Each room has: id, name, currentOccupancy, capacity, isFull
- No authentication required

**Test Command:**
```bash
curl -X GET http://localhost:3000/api/public/rooms
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "rooms": [
      {
        "id": "uuid-here",
        "name": "Study Room 1",
        "currentOccupancy": 0,
        "capacity": 10,
        "isFull": false
      }
      // ... 9 more rooms
    ]
  }
}
```

**Validation Points:**
- ✅ Returns exactly 10 rooms
- ✅ All required fields present
- ✅ isFull is false when occupancy < capacity
- ✅ No authentication required

---

### ✅ Test 2: Create Anonymous User

**Endpoint:** `POST /api/public/users`

**Expected Behavior:**
- Returns 201 Created
- Creates user with hashed IP
- Returns userId and sanitized displayName
- No authentication required

**Test Command:**
```bash
curl -X POST http://localhost:3000/api/public/users \
  -H "Content-Type: application/json" \
  -d '{"displayName": "Test User"}'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "userId": "uuid-here",
    "displayName": "Test User"
  }
}
```

**Validation Points:**
- ✅ Returns userId
- ✅ Display name is stored correctly
- ✅ IP address is hashed in database (check with Prisma Studio)
- ✅ No raw IP in response

**Save the userId for next tests!**

---

### ✅ Test 3: Input Validation - Display Name

**Test 3a: Empty Display Name**

```bash
curl -X POST http://localhost:3000/api/public/users \
  -H "Content-Type: application/json" \
  -d '{"displayName": ""}'
```

**Expected Response:** 400 Bad Request
```json
{
  "error": {
    "code": "INVALID_DISPLAY_NAME",
    "message": "Display name must be between 1 and 50 characters"
  }
}
```

**Test 3b: Display Name Too Long**

```bash
curl -X POST http://localhost:3000/api/public/users \
  -H "Content-Type: application/json" \
  -d '{"displayName": "This is a very long name that exceeds the fifty character limit for display names"}'
```

**Expected Response:** 400 Bad Request

**Test 3c: HTML/XSS in Display Name**

```bash
curl -X POST http://localhost:3000/api/public/users \
  -H "Content-Type: application/json" \
  -d '{"displayName": "<script>alert(\"XSS\")</script>"}'
```

**Expected Response:** 201 Created with sanitized name (HTML tags removed)

**Validation Points:**
- ✅ Rejects empty names
- ✅ Rejects names > 50 characters
- ✅ Sanitizes HTML/script tags
- ✅ Returns appropriate error messages

---

### ✅ Test 4: Join Room

**Endpoint:** `POST /api/public/rooms/:roomId/join`

**Expected Behavior:**
- Returns 200 OK
- Adds user to room
- Increments room occupancy
- Returns room info and participant list

**Test Command:**
```bash
# Replace ROOM_ID and USER_ID with actual values
curl -X POST http://localhost:3000/api/public/rooms/ROOM_ID/join \
  -H "Content-Type: application/json" \
  -d '{"userId": "USER_ID"}'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "room": {
      "id": "room-uuid",
      "name": "Study Room 1",
      "currentOccupancy": 1,
      "capacity": 10,
      "isFull": false
    },
    "participants": [
      {
        "id": "participant-uuid",
        "displayName": "Test User",
        "isVideoEnabled": false,
        "isAudioEnabled": false,
        "joinedAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

**Validation Points:**
- ✅ User added to room
- ✅ Occupancy incremented
- ✅ Participant list includes user
- ✅ Media states default to false

---

### ✅ Test 5: Room Capacity Enforcement

**Test 5a: Join Room at Capacity**

First, join a room multiple times with different users until it reaches capacity (10 users).

Then try to join with an 11th user:

```bash
curl -X POST http://localhost:3000/api/public/rooms/ROOM_ID/join \
  -H "Content-Type: application/json" \
  -d '{"userId": "ANOTHER_USER_ID"}'
```

**Expected Response:** 409 Conflict
```json
{
  "error": {
    "code": "ROOM_FULL",
    "message": "This room is at maximum capacity"
  }
}
```

**Validation Points:**
- ✅ Rejects join when room is full
- ✅ Room occupancy unchanged
- ✅ Returns appropriate error

---

### ✅ Test 6: Single Room Membership

**Test 6a: Join Second Room While in First**

After joining a room, try to join another room with the same user:

```bash
# First join room 1
curl -X POST http://localhost:3000/api/public/rooms/ROOM_1_ID/join \
  -H "Content-Type: application/json" \
  -d '{"userId": "USER_ID"}'

# Then try to join room 2
curl -X POST http://localhost:3000/api/public/rooms/ROOM_2_ID/join \
  -H "Content-Type: application/json" \
  -d '{"userId": "USER_ID"}'
```

**Expected Response:** 409 Conflict
```json
{
  "error": {
    "code": "ALREADY_IN_ROOM",
    "message": "You are already in a room. Please leave your current room first"
  }
}
```

**Validation Points:**
- ✅ Prevents joining multiple rooms
- ✅ Returns appropriate error
- ✅ User remains in first room

---

### ✅ Test 7: Leave Room

**Endpoint:** `POST /api/public/rooms/:roomId/leave`

**Expected Behavior:**
- Returns 200 OK
- Removes user from room
- Decrements room occupancy

**Test Command:**
```bash
curl -X POST http://localhost:3000/api/public/rooms/ROOM_ID/leave \
  -H "Content-Type: application/json" \
  -d '{"userId": "USER_ID"}'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Successfully left the room"
}
```

**Validation:**
- ✅ User removed from room
- ✅ Occupancy decremented
- ✅ Can now join another room

---

### ✅ Test 8: API Rate Limiting

**Test 8a: API Endpoint Rate Limit (100 requests/minute)**

```bash
# Send 101 requests rapidly
for i in {1..101}; do
  curl -X GET http://localhost:3000/api/public/rooms
done
```

**Expected Behavior:**
- First 100 requests: 200 OK
- 101st request: 429 Too Many Requests

**Expected Response (101st request):**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again in 60 seconds",
    "retryAfter": 60
  }
}
```

**Response Headers:**
- `X-RateLimit-Limit: 100`
- `X-RateLimit-Remaining: 0`
- `X-RateLimit-Reset: <timestamp>`
- `Retry-After: 60`

**Validation Points:**
- ✅ Blocks after 100 requests
- ✅ Returns 429 status
- ✅ Includes retry-after header
- ✅ Blocks for 60 seconds

---

### ✅ Test 9: Join Attempt Rate Limiting

**Test 9a: Join Rate Limit (5 attempts/minute)**

```bash
# Send 6 join requests rapidly
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/public/rooms/ROOM_ID/join \
    -H "Content-Type: application/json" \
    -d '{"userId": "USER_ID"}'
done
```

**Expected Behavior:**
- First 5 requests: May succeed or fail based on room state
- 6th request: 429 Too Many Requests

**Expected Response (6th request):**
```json
{
  "error": {
    "code": "JOIN_LIMIT_EXCEEDED",
    "message": "Too many join attempts. Please try again in 5 minutes",
    "retryAfter": 300
  }
}
```

**Validation Points:**
- ✅ Blocks after 5 join attempts
- ✅ Returns 429 status
- ✅ Blocks for 5 minutes (300 seconds)
- ✅ Includes retry-after header

---

### ✅ Test 10: IP Privacy and Security

**Test 10a: Check Database for IP Hashing**

Open Prisma Studio:
```bash
npm run prisma:studio
```

Navigate to `AnonymousUser` table and verify:
- ✅ `hashedIp` field contains a hash (not raw IP)
- ✅ Hash looks like: `a1b2c3d4e5f6...` (64 character hex string)

**Test 10b: Check API Responses**

Review all API responses and verify:
- ✅ No raw IP addresses in responses
- ✅ No hashed IP in responses
- ✅ Only displayName is exposed

---

## Testing Summary

After completing all tests, verify:

### Core Functionality
- [ ] All 4 REST endpoints work without authentication
- [ ] Room list returns exactly 10 rooms
- [ ] User creation works with IP hashing
- [ ] Join room adds user and increments occupancy
- [ ] Leave room removes user and decrements occupancy

### Input Validation
- [ ] Display name validation (1-50 characters)
- [ ] HTML/XSS sanitization works
- [ ] Invalid inputs return 400 errors

### Business Rules
- [ ] Room capacity enforcement works
- [ ] Single room membership enforced
- [ ] Room full status calculated correctly

### Rate Limiting
- [ ] API rate limit (100/min) enforced
- [ ] Join rate limit (5/min) enforced
- [ ] Proper error responses with retry-after
- [ ] Rate limit headers present

### Security
- [ ] IP addresses are hashed in database
- [ ] No IP exposure in API responses
- [ ] Input sanitization prevents XSS
- [ ] No authentication required for public endpoints

## Common Issues and Solutions

### Issue: "Cannot find rooms"
**Solution:** Create 10 rooms in the database using Prisma Studio or seed script.

### Issue: "Rate limit not working"
**Solution:** Check that rate limiter middleware is applied to routes. Verify RateLimiterService is initialized.

### Issue: "IP not being hashed"
**Solution:** Check SecurityService.hashIpAddress() is being called in AnonymousUserService.

### Issue: "Room occupancy not updating"
**Solution:** Verify Prisma transaction in PublicRoomService.joinRoom() is working correctly.

## Next Steps

Once all tests pass:
1. ✅ Mark task 7 as complete
2. Proceed to task 8: Implement Socket.io event handlers
3. Continue with real-time functionality

## Questions?

If you encounter any issues or have questions during testing:
- Check the implementation files in `src/components/public-rooms/`
- Review the API documentation in `API_ENDPOINTS.md`
- Review the rate limiting documentation in `RATE_LIMITING.md`
- Ask for clarification on specific behaviors

---

**Last Updated:** Task 7 Checkpoint
**Status:** Ready for Manual Testing
