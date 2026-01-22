# Rate Limiting Infrastructure

This document describes the rate limiting infrastructure for the Public Study Rooms feature.

## Overview

The rate limiting system protects the application from abuse by limiting the number of requests, chat messages, and join attempts from individual IP addresses. It uses a hybrid approach with in-memory caching for performance and database persistence for reliability.

## Components

### 1. RateLimiterService

The core service that handles rate limiting logic.

**Location:** `rate-limiter.service.ts`

**Features:**
- In-memory caching for fast lookups
- Database persistence for reliability
- Configurable rate limits per action type
- IP blocking with configurable durations
- Automatic cleanup of expired records

**Rate Limit Configurations:**

| Action | Max Attempts | Window | Block Duration | Requirement |
|--------|-------------|--------|----------------|-------------|
| API Request | 100 | 1 minute | 60 seconds | 11.1, 11.2 |
| Chat Message | 10 | 1 minute | 30 seconds | 11.3, 11.4 |
| Join Attempt | 5 | 1 minute | 5 minutes | 13.1, 13.2 |

### 2. Rate Limiter Middleware

Express middleware functions for HTTP endpoints.

**Location:** `rate-limiter.middleware.ts`

**Middleware Functions:**

#### `apiRateLimitMiddleware`
- Limits API requests to 100 per minute per IP
- Returns 429 status with retry-after header when exceeded
- Adds rate limit headers to responses

**Usage:**
```typescript
import { apiRateLimitMiddleware } from './components/public-rooms';

router.get('/api/public/rooms', apiRateLimitMiddleware, getRoomsHandler);
```

#### `joinAttemptRateLimitMiddleware`
- Limits join attempts to 5 per minute per IP
- Blocks IP for 5 minutes when exceeded
- Returns 429 status with retry-after header

**Usage:**
```typescript
import { joinAttemptRateLimitMiddleware } from './components/public-rooms';

router.post('/api/public/rooms/:roomId/join', 
    joinAttemptRateLimitMiddleware, 
    joinRoomHandler
);
```

#### `checkChatRateLimit`
- Helper function for Socket.io chat events
- Limits chat messages to 10 per minute per IP
- Returns error object when limit exceeded

**Usage:**
```typescript
import { checkChatRateLimit } from './components/public-rooms';

socket.on('send-message', async (data) => {
    const ipAddress = socket.handshake.address;
    const rateLimitCheck = await checkChatRateLimit(ipAddress);
    
    if (!rateLimitCheck.allowed) {
        socket.emit('rate-limit-exceeded', rateLimitCheck.error);
        return;
    }
    
    // Process message...
});
```

### 3. Rate Limiter Scheduler

Automatic cleanup of expired rate limit records.

**Location:** `rate-limiter.scheduler.ts`

**Features:**
- Runs cleanup every 15 minutes
- Removes expired database records
- Cleans up in-memory cache
- Maintains system performance

**Usage:**
```typescript
import { RateLimiterScheduler } from './components/public-rooms/rate-limiter.scheduler';

// Start scheduler on application startup
RateLimiterScheduler.start();

// Stop scheduler on application shutdown
process.on('SIGTERM', () => {
    RateLimiterScheduler.stop();
});
```

## Database Schema

The rate limiting system uses the `RateLimitRecord` model:

```prisma
model RateLimitRecord {
  id          String   @id @default(uuid())
  hashedIp    String   @map("hashed_ip")
  action      String
  attempts    Int      @default(1)
  windowStart DateTime @default(now()) @map("window_start")
  blockedUntil DateTime? @map("blocked_until")
  
  @@unique([hashedIp, action])
  @@index([hashedIp])
  @@index([blockedUntil])
  @@map("rate_limit_records")
}
```

## Security Features

### IP Address Hashing

All IP addresses are hashed using SHA-256 before storage:
- Protects user privacy (Requirement 10.1)
- Prevents IP address exposure
- Maintains lookup performance

### Configurable Block Durations

Different actions have different block durations:
- API requests: 60 seconds
- Chat messages: 30 seconds
- Join attempts: 5 minutes

This graduated approach balances security with user experience.

## Error Responses

### API Rate Limit Exceeded

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again in 60 seconds",
    "retryAfter": 60
  }
}
```

**HTTP Status:** 429 Too Many Requests  
**Headers:** `Retry-After: 60`

### Chat Rate Limit Exceeded

```json
{
  "code": "CHAT_RATE_LIMIT_EXCEEDED",
  "message": "Too many messages. Please wait 30 seconds",
  "retryAfter": 30
}
```

**Delivery:** Socket.io event `rate-limit-exceeded`

### Join Limit Exceeded

```json
{
  "error": {
    "code": "JOIN_LIMIT_EXCEEDED",
    "message": "Too many join attempts. Please try again in 5 minutes",
    "retryAfter": 300
  }
}
```

**HTTP Status:** 429 Too Many Requests  
**Headers:** `Retry-After: 300`

## Response Headers

Rate limit middleware adds the following headers to responses:

- `X-RateLimit-Limit`: Maximum number of requests allowed
- `X-RateLimit-Remaining`: Number of requests remaining in current window
- `X-RateLimit-Reset`: ISO timestamp when the rate limit resets
- `Retry-After`: Seconds to wait before retrying (when blocked)

## Performance Considerations

### In-Memory Caching

The system uses an in-memory cache for fast lookups:
- Reduces database queries
- Provides sub-millisecond response times
- Automatically syncs with database

### Database Persistence

Rate limit data is persisted to the database:
- Survives application restarts
- Enables distributed deployments
- Provides audit trail

### Cleanup Strategy

Automatic cleanup prevents database bloat:
- Runs every 15 minutes
- Removes expired records
- Cleans up cache entries
- Maintains optimal performance

## Testing

### Manual Testing

Test rate limiting with curl:

```bash
# Test API rate limit (100 requests/minute)
for i in {1..101}; do
  curl http://localhost:3000/api/public/rooms
done

# Test join rate limit (5 attempts/minute)
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/public/rooms/room-id/join \
    -H "Content-Type: application/json" \
    -d '{"userId": "user-id"}'
done
```

### Programmatic Testing

```typescript
import { RateLimiterService, RateLimitAction } from './rate-limiter.service';

// Check rate limit status
const status = await RateLimiterService.getRateLimitStatus(
    '192.168.1.1',
    RateLimitAction.API_REQUEST
);

console.log(`Attempts: ${status.attempts}/${status.maxAttempts}`);

// Reset rate limit (for testing)
await RateLimiterService.resetRateLimit(
    '192.168.1.1',
    RateLimitAction.API_REQUEST
);
```

## Monitoring

### Logging

The system logs important events:
- Rate limit violations
- IP blocks
- Cleanup operations
- Errors

### Metrics to Monitor

- Rate limit hit rate
- Number of blocked IPs
- Database record count
- Cache hit rate
- Cleanup duration

## Future Enhancements

Potential improvements for production:

1. **Redis Integration**: Replace in-memory cache with Redis for distributed deployments
2. **Dynamic Rate Limits**: Adjust limits based on system load
3. **Whitelist/Blacklist**: Allow/block specific IPs
4. **Metrics Dashboard**: Real-time monitoring of rate limiting
5. **Exponential Backoff**: Increase block duration for repeat offenders

## Requirements Mapping

This implementation satisfies the following requirements:

- **11.1**: API rate limiting (100 requests/minute per endpoint)
- **11.2**: Block requests for 60 seconds after API rate limit exceeded
- **11.3**: Chat rate limiting (10 messages/minute)
- **11.4**: Block messages for 30 seconds after chat rate limit exceeded
- **13.1**: Join attempt limiting (5 attempts/minute)
- **13.2**: Block IP for 5 minutes after join attempt limit exceeded

## Support

For questions or issues with the rate limiting system, please refer to:
- Design document: `.kiro/specs/public-study-rooms/design.md`
- Requirements document: `.kiro/specs/public-study-rooms/requirements.md`
