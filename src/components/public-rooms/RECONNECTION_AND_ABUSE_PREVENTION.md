# Reconnection and Abuse Prevention

This document describes the reconnection backoff, abuse prevention, and system capacity management features implemented for the Public Study Rooms.

## Features Implemented

### 1. Exponential Backoff for Rapid Reconnections (Requirement 13.3)

**Purpose:** Prevent abuse from users who repeatedly disconnect and reconnect in rapid succession.

**Implementation:**
- Tracks reconnection attempts per IP address within a 60-second window
- After 3 reconnection attempts, applies exponential backoff
- Backoff starts at 1 second and doubles with each attempt (max 60 seconds)
- Logs suspicious activity when rapid reconnection is detected

**Configuration:**
```typescript
INITIAL_BACKOFF_MS = 1000        // 1 second
MAX_BACKOFF_MS = 60000           // 60 seconds
BACKOFF_MULTIPLIER = 2           // Doubles each time
RECONNECTION_WINDOW_MS = 60000   // 1 minute window
RAPID_RECONNECTION_THRESHOLD = 3 // 3 attempts trigger backoff
```

**Error Response:**
```json
{
  "code": "RECONNECTION_THROTTLED",
  "message": "Too many reconnection attempts. Please wait X seconds",
  "retryAfter": 5
}
```

### 2. Suspicious Activity Logging (Requirement 13.4)

**Purpose:** Track and monitor suspicious behavior patterns for security analysis.

**Activity Types Logged:**
- `RAPID_RECONNECTION` - Multiple reconnection attempts in short time
- `RATE_LIMIT_VIOLATION` - Exceeded rate limits for API, chat, or join attempts
- `MULTIPLE_BLOCKS` - Repeated violations leading to blocks
- `EXCESSIVE_JOIN_ATTEMPTS` - Too many concurrent connection attempts
- `MALICIOUS_INPUT` - SQL injection or XSS attempts detected

**Database Schema:**
```sql
CREATE TABLE "suspicious_activity_logs" (
    "id" TEXT PRIMARY KEY,
    "hashed_ip" TEXT NOT NULL,
    "activity_type" TEXT NOT NULL,
    "details" TEXT DEFAULT '',
    "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Usage:**
```typescript
await SecurityService.logSuspiciousActivity(
    ipAddress,
    SuspiciousActivityType.RAPID_RECONNECTION,
    'Details about the activity'
);
```

### 3. IP Blocking for Repeated Violations

**Purpose:** Automatically block IPs that exhibit persistent abusive behavior.

**Implementation:**
- Tracks suspicious activity count per IP in the last hour
- Blocks IP if more than 10 suspicious activities detected
- Logs the block as a `MULTIPLE_BLOCKS` activity
- Returns permanent block error to the client

**Error Response:**
```json
{
  "code": "IP_BLOCKED",
  "message": "Your IP has been blocked due to repeated violations"
}
```

**Checking Block Status:**
```typescript
const shouldBlock = await RateLimiterService.shouldBlockIpPermanently(ipAddress);
```

### 4. System Capacity Queueing (Requirement 14.2)

**Purpose:** Gracefully handle load when system reaches maximum concurrent users (100).

**Implementation:**
- Tracks active connections across all rooms
- Maximum 100 concurrent users system-wide
- Queues additional connection requests when at capacity
- Queue entries timeout after 30 seconds
- Automatically processes queue when capacity becomes available

**Configuration:**
```typescript
MAX_CONCURRENT_USERS = 100    // System-wide limit
QUEUE_TIMEOUT_MS = 30000      // 30 seconds
```

**Queue Response:**
```json
{
  "message": "System is at maximum capacity. Your connection has been queued.",
  "queuePosition": 5
}
```

**Capacity Status:**
```typescript
const status = ConnectionManagerService.getCapacityStatus();
// Returns:
// {
//   activeConnections: 95,
//   maxConnections: 100,
//   queueLength: 3,
//   availableSlots: 5
// }
```

## Services

### ConnectionManagerService

Manages reconnection tracking and system capacity.

**Key Methods:**
- `checkReconnectionBackoff(ipAddress)` - Validates reconnection attempts
- `checkSystemCapacity(socketId, ipAddress)` - Checks and queues connections
- `removeConnection(socketId)` - Cleans up on disconnect
- `getCapacityStatus()` - Returns current capacity metrics
- `getReconnectionStatus(ipAddress)` - Returns reconnection tracking info
- `cleanupReconnectionTracking()` - Removes expired entries

### SecurityService (Enhanced)

Added suspicious activity logging capabilities.

**New Methods:**
- `logSuspiciousActivity(ipAddress, activityType, details)` - Logs activity
- `getSuspiciousActivityCount(ipAddress, timeWindowMs)` - Gets activity count

**New Types:**
```typescript
enum SuspiciousActivityType {
    RAPID_RECONNECTION = "rapid_reconnection",
    RATE_LIMIT_VIOLATION = "rate_limit_violation",
    MULTIPLE_BLOCKS = "multiple_blocks",
    EXCESSIVE_JOIN_ATTEMPTS = "excessive_join_attempts",
    MALICIOUS_INPUT = "malicious_input",
}
```

### RateLimiterService (Enhanced)

Added IP blocking for repeated violations.

**New Methods:**
- `shouldBlockIpPermanently(ipAddress)` - Checks if IP should be blocked
- Enhanced `recordRateLimitViolation()` - Now logs suspicious activity

## Integration with Socket Server

The features are integrated into the `PublicRoomSocketServer` connection flow:

1. **Connection Attempt**
   - Check for permanent IP block
   - Check reconnection backoff
   - Check system capacity
   - Check concurrent connection limit
   - Allow or reject connection

2. **Disconnection**
   - Remove from connection tracking
   - Remove from capacity tracking
   - Process queued connections if capacity available

3. **Cleanup**
   - Periodic cleanup every 5 minutes
   - Removes expired reconnection tracking
   - Removes expired rate limit records

## Monitoring

### Capacity Monitoring

```typescript
const socketServer = getPublicRoomSocketServer();
const capacity = socketServer.getCapacityStatus();
console.log(`Active: ${capacity.activeConnections}/${capacity.maxConnections}`);
console.log(`Queue: ${capacity.queueLength}`);
```

### Reconnection Monitoring

```typescript
const status = socketServer.getReconnectionStatus(ipAddress);
console.log(`Reconnection attempts: ${status.count}`);
console.log(`Last attempt: ${status.lastAttempt}`);
console.log(`Backoff until: ${status.backoffUntil}`);
```

### Suspicious Activity Monitoring

Query the database:
```sql
SELECT 
    activity_type,
    COUNT(*) as count,
    MAX(timestamp) as last_occurrence
FROM suspicious_activity_logs
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY activity_type
ORDER BY count DESC;
```

## Error Codes

| Code | Description | Action |
|------|-------------|--------|
| `RECONNECTION_THROTTLED` | Too many reconnection attempts | Wait for backoff period |
| `IP_BLOCKED` | IP permanently blocked | Contact support |
| `SYSTEM_AT_CAPACITY` | System at max capacity | Retry later |
| `TOO_MANY_CONNECTIONS` | Concurrent connection limit | Close other connections |

## Configuration

All configuration constants are defined in the respective service classes:

- **ConnectionManagerService**: Backoff and capacity settings
- **RateLimiterService**: Rate limit thresholds and durations
- **PublicRoomSocketServer**: Ping intervals and cleanup schedules

## Testing

Manual testing should verify:

1. **Reconnection Backoff**
   - Connect and disconnect rapidly 3+ times
   - Verify exponential backoff is applied
   - Verify backoff resets after window expires

2. **Suspicious Activity Logging**
   - Trigger various violations
   - Verify logs are created in database
   - Verify IP blocking after 10+ violations

3. **System Capacity**
   - Simulate 100+ concurrent connections
   - Verify queueing behavior
   - Verify queue processing on disconnect

4. **IP Blocking**
   - Trigger 10+ suspicious activities
   - Verify permanent block is applied
   - Verify error message is returned

## Future Enhancements

Potential improvements:
- Admin dashboard for monitoring suspicious activity
- Configurable thresholds via environment variables
- Whitelist/blacklist management
- Geographic IP analysis
- Machine learning for abuse detection
