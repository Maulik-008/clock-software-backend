# Public Rooms API Endpoints

This document describes the public REST API endpoints for the Public Study Rooms feature.

## Overview

All endpoints are accessible without authentication and are mounted at `/api/public`.

## Endpoints

### 1. GET /api/public/rooms

Returns a list of 10 public study rooms with occupancy information.

**Requirements:** 9.1, 9.5, 11.1

**Rate Limit:** 100 requests/minute per IP

**Request:**
```
GET /api/public/rooms
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "rooms": [
      {
        "id": "uuid",
        "name": "Study Room 1",
        "currentOccupancy": 5,
        "capacity": 10,
        "isFull": false
      }
    ]
  }
}
```

**Error Response (429 Too Many Requests):**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again in 60 seconds",
    "retryAfter": 60
  }
}
```

---

### 2. POST /api/public/users

Creates or retrieves an anonymous user by IP address and display name.

**Requirements:** 9.2, 9.5, 11.1, 12.1

**Rate Limit:** 100 requests/minute per IP

**Request:**
```
POST /api/public/users
Content-Type: application/json

{
  "displayName": "John Doe"
}
```

**Validation:**
- `displayName`: Required, 1-50 characters

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "displayName": "John Doe"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": {
    "code": "INVALID_DISPLAY_NAME",
    "message": "Display name must be between 1 and 50 characters"
  }
}
```

---

### 3. POST /api/public/rooms/:roomId/join

Joins a room as an anonymous user.

**Requirements:** 9.3, 9.5, 13.1, 13.2

**Rate Limit:** 5 join attempts/minute per IP (blocked for 5 minutes after exceeding)

**Request:**
```
POST /api/public/rooms/abc-123-uuid/join
Content-Type: application/json

{
  "userId": "user-uuid"
}
```

**Validation:**
- `roomId`: Required, valid UUID
- `userId`: Required, valid UUID

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "room": {
      "id": "uuid",
      "name": "Study Room 1",
      "currentOccupancy": 6,
      "capacity": 10,
      "isFull": false
    },
    "participants": [
      {
        "id": "uuid",
        "displayName": "John Doe",
        "isVideoEnabled": false,
        "isAudioEnabled": false,
        "joinedAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

**Error Response (409 Conflict - Room Full):**
```json
{
  "error": {
    "code": "ROOM_FULL",
    "message": "This room is at maximum capacity"
  }
}
```

**Error Response (409 Conflict - Already in Room):**
```json
{
  "error": {
    "code": "ALREADY_IN_ROOM",
    "message": "You are already in a room. Please leave your current room first"
  }
}
```

**Error Response (429 Too Many Requests):**
```json
{
  "error": {
    "code": "JOIN_LIMIT_EXCEEDED",
    "message": "Too many join attempts. Please try again in 5 minutes",
    "retryAfter": 300
  }
}
```

---

### 4. POST /api/public/rooms/:roomId/leave

Leaves a room.

**Requirements:** 9.3, 9.5, 11.1

**Rate Limit:** 100 requests/minute per IP

**Request:**
```
POST /api/public/rooms/abc-123-uuid/leave
Content-Type: application/json

{
  "userId": "user-uuid"
}
```

**Validation:**
- `roomId`: Required, valid UUID
- `userId`: Required, valid UUID

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Successfully left the room"
}
```

---

## Rate Limiting

All endpoints implement rate limiting to prevent abuse:

- **API Endpoints** (GET /rooms, POST /users, POST /leave): 100 requests/minute per IP
  - Blocked for 60 seconds after exceeding limit
  
- **Join Attempts** (POST /join): 5 attempts/minute per IP
  - Blocked for 5 minutes (300 seconds) after exceeding limit

Rate limit information is included in response headers:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Time when the rate limit resets
- `Retry-After`: Seconds to wait before retrying (on 429 errors)

## Error Handling

All endpoints follow a consistent error response format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {},
    "retryAfter": 60
  }
}
```

### Error Codes

- `INVALID_INPUT`: Validation failed
- `INVALID_DISPLAY_NAME`: Display name validation failed
- `ROOM_FULL`: Room is at maximum capacity
- `ALREADY_IN_ROOM`: User is already in another room
- `USER_NOT_FOUND`: User ID not found
- `RATE_LIMIT_EXCEEDED`: API rate limit exceeded
- `JOIN_LIMIT_EXCEEDED`: Join attempt rate limit exceeded

## Security Features

1. **No Authentication Required**: All endpoints are public (Requirement 9.5)
2. **IP-Based Rate Limiting**: Prevents abuse from individual IPs
3. **Input Validation**: All inputs are validated using express-validator
4. **Input Sanitization**: Display names are sanitized to prevent XSS
5. **IP Hashing**: IP addresses are hashed before storage (handled by services)
6. **Single Room Membership**: Users can only be in one room at a time

## Implementation Files

- **Controller**: `public-rooms.controller.ts`
- **Routes**: `public-rooms.route.ts`
- **Validation**: `public-rooms.validation.ts`
- **Services**: 
  - `anonymous-user.service.ts`
  - `public-room.service.ts`
  - `rate-limiter.service.ts`
  - `security.service.ts`
- **Middleware**: `rate-limiter.middleware.ts`
