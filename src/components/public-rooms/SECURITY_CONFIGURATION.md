# Security Configuration - Public Study Rooms

## Overview

This document details the security headers, CORS configuration, rate limiting, IP privacy measures, and request logging implemented for the Public Study Rooms feature.

**Requirements Addressed:**
- 10.3: Configure CORS for public endpoints
- 10.4: Add security headers
- 10.5: Ensure IP privacy in all responses and add request logging

## Security Headers (Helmet.js)

### Implementation Location
`src/app.ts` - Applied globally to all routes

### Configured Headers

#### 1. Content Security Policy (CSP)
Prevents XSS attacks by controlling which resources can be loaded:
```typescript
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],           // Only load resources from same origin
    styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles (for React)
    scriptSrc: ["'self'"],            // Only execute scripts from same origin
    imgSrc: ["'self'", "data:", "https:"], // Allow images from same origin, data URIs, and HTTPS
    connectSrc: ["'self'"],           // Only connect to same origin APIs
    fontSrc: ["'self'"],              // Only load fonts from same origin
    objectSrc: ["'none'"],            // Block plugins like Flash
    mediaSrc: ["'self'"],             // Only load media from same origin
    frameSrc: ["'none'"],             // Prevent embedding in iframes
  },
}
```

#### 2. HTTP Strict Transport Security (HSTS)
Forces HTTPS connections:
```typescript
hsts: {
  maxAge: 31536000,        // 1 year in seconds
  includeSubDomains: true, // Apply to all subdomains
  preload: true,           // Enable HSTS preload list
}
```

#### 3. X-Frame-Options
Prevents clickjacking attacks:
```typescript
frameguard: {
  action: "deny",  // Completely prevent page from being embedded in frames
}
```

#### 4. X-Content-Type-Options
Prevents MIME type sniffing:
```typescript
noSniff: true  // Forces browsers to respect declared content types
```

#### 5. X-XSS-Protection
Legacy XSS protection for older browsers:
```typescript
xssFilter: true  // Enables browser's built-in XSS filter
```

#### 6. X-Powered-By
Hides server technology:
```typescript
hidePoweredBy: true  // Removes "X-Powered-By: Express" header
```

#### 7. Referrer-Policy
Controls referrer information:
```typescript
referrerPolicy: {
  policy: "strict-origin-when-cross-origin"  // Only send origin on cross-origin requests
}
```

## CORS Configuration

### Implementation Location
`src/app.ts` - Applied globally to all routes

### Configuration Details
```typescript
cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: [
    'X-RateLimit-Limit',      // Rate limit maximum
    'X-RateLimit-Remaining',  // Remaining requests
    'X-RateLimit-Reset',      // Rate limit reset time
    'Retry-After'             // Retry after seconds (for 429 responses)
  ],
  maxAge: 86400,  // 24 hours - cache preflight requests
})
```

### Public Endpoint Access
- All `/api/public/*` endpoints are accessible without authentication
- CORS allows requests from configured frontend URL
- Rate limiting headers are exposed to clients for better UX

## Rate Limiting Headers

### Implementation Location
`src/components/public-rooms/rate-limiter.middleware.ts`

### Headers Sent with Every Response

#### API Rate Limiting (100 requests/minute)
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2024-01-15T10:30:00.000Z
```

#### Join Attempt Rate Limiting (5 attempts/minute)
```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 2024-01-15T10:30:00.000Z
```

#### Rate Limit Exceeded Response
```
HTTP/1.1 429 Too Many Requests
Retry-After: 60

{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again in 60 seconds",
    "retryAfter": 60
  }
}
```

### Rate Limit Types

| Action | Limit | Window | Block Duration | Middleware |
|--------|-------|--------|----------------|------------|
| API Requests | 100 | 1 minute | 60 seconds | `apiRateLimitMiddleware` |
| Join Attempts | 5 | 1 minute | 5 minutes | `joinAttemptRateLimitMiddleware` |
| Chat Messages | 10 | 1 minute | 30 seconds | `checkChatRateLimit` (Socket.io) |

## IP Privacy Measures

### Requirement 10.3, 10.4, 10.5: IP addresses must never be exposed

### 1. IP Hashing
**Location:** `src/components/public-rooms/security.service.ts`

All IP addresses are hashed using SHA-256 before storage:
```typescript
static hashIpAddress(ipAddress: string): string {
  return crypto.createHash("sha256").update(ipAddress).digest("hex");
}
```

### 2. Database Storage
**Location:** `prisma/schema/public-rooms.prisma`

Only hashed IPs are stored:
```prisma
model AnonymousUser {
  id            String   @id @default(uuid())
  hashedIp      String   @unique  // ✓ Hashed, not raw IP
  displayName   String
  // ...
}
```

### 3. API Responses - IP Privacy Verification

#### ✓ GET /api/public/rooms
Returns only room information, no user data:
```json
{
  "success": true,
  "data": {
    "rooms": [
      {
        "id": "room-uuid",
        "name": "Study Room 1",
        "currentOccupancy": 3,
        "capacity": 10,
        "isFull": false
      }
    ]
  }
}
```
**IP Exposure:** None ✓

#### ✓ POST /api/public/users
Returns only user ID and display name:
```json
{
  "success": true,
  "data": {
    "userId": "user-uuid",
    "displayName": "John Doe"
  }
}
```
**IP Exposure:** None ✓ (hashedIp is filtered out)

#### ✓ POST /api/public/rooms/:roomId/join
Returns room and participant information:
```json
{
  "success": true,
  "data": {
    "room": {
      "id": "room-uuid",
      "name": "Study Room 1",
      "currentOccupancy": 4,
      "capacity": 10,
      "isFull": false
    },
    "participants": [
      {
        "id": "user-uuid",
        "displayName": "John Doe",
        "isVideoEnabled": false,
        "isAudioEnabled": false,
        "joinedAt": "2024-01-15T10:00:00.000Z"
      }
    ]
  }
}
```
**IP Exposure:** None ✓ (only user ID and display name)

#### ✓ Socket.io Events
All socket events emit only:
- User ID
- Display name
- Media states (video/audio)
- Message content (sanitized)
- Timestamps

**IP Exposure:** None ✓

### 4. Logging - IP Privacy

**Location:** `src/middlewares/requestLogging.ts`

Logs only hash prefix (first 8 characters):
```typescript
const hashedIp = SecurityService.hashIpAddress(ipAddress);
const ipPrefix = hashedIp.substring(0, 8); // Only log first 8 chars

logger.info("Incoming request", {
  method: req.method,
  path: req.path,
  ipPrefix,  // ✓ Only prefix of hash, not full hash or raw IP
  userAgent: req.get("user-agent"),
  timestamp: new Date().toISOString(),
});
```

**Example Log Output:**
```json
{
  "level": "info",
  "message": "Incoming request",
  "method": "POST",
  "path": "/api/public/users",
  "ipPrefix": "a3f5b2c1",
  "userAgent": "Mozilla/5.0...",
  "timestamp": "2024-01-15T10:00:00.000Z"
}
```

### 5. Error Responses - IP Privacy

Error responses never include IP information:
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again in 60 seconds",
    "retryAfter": 60
  }
}
```

## Request Logging

### Implementation Location
`src/middlewares/requestLogging.ts`

### Logged Information

#### Request Logging
```typescript
logger.info("Incoming request", {
  method: req.method,           // HTTP method
  path: req.path,               // Request path
  ipPrefix,                     // First 8 chars of hashed IP
  userAgent: req.get("user-agent"),
  timestamp: new Date().toISOString(),
});
```

#### Response Logging
```typescript
logger.info("Request completed", {
  method: req.method,
  path: req.path,
  statusCode: res.statusCode,   // HTTP status code
  duration: `${duration}ms`,    // Request duration
  ipPrefix,                     // First 8 chars of hashed IP
  timestamp: new Date().toISOString(),
});
```

### Log Files
- **Combined logs:** `logs/combined.log` - All requests
- **Error logs:** `logs/error.log` - Errors only
- **Console:** Development mode only

### Monitoring Use Cases
1. **Performance Monitoring:** Track request durations
2. **Error Tracking:** Identify failing endpoints
3. **Abuse Detection:** Identify suspicious patterns by IP prefix
4. **Usage Analytics:** Track endpoint usage
5. **Debugging:** Trace request flow

## Trust Proxy Configuration

### Implementation Location
`src/app.ts`

```typescript
app.set("trust proxy", 1);
```

### Purpose
- Extracts real client IP from `X-Forwarded-For` header
- Required when behind reverse proxy (nginx, load balancer)
- Ensures accurate IP-based rate limiting and identification

## Security Verification Checklist

### ✓ Helmet.js Security Headers
- [x] Content Security Policy configured
- [x] HSTS enabled (force HTTPS)
- [x] X-Frame-Options set to deny
- [x] X-Content-Type-Options enabled
- [x] X-XSS-Protection enabled
- [x] X-Powered-By header hidden
- [x] Referrer-Policy configured

### ✓ CORS Configuration
- [x] Origin restricted to frontend URL
- [x] Credentials enabled for cookies
- [x] Methods explicitly allowed
- [x] Rate limit headers exposed
- [x] Preflight caching enabled

### ✓ Rate Limiting
- [x] API rate limiting (100/min)
- [x] Join attempt limiting (5/min)
- [x] Chat rate limiting (10/min)
- [x] Rate limit headers sent
- [x] Retry-After header on 429

### ✓ IP Privacy
- [x] IPs hashed before storage (SHA-256)
- [x] No raw IPs in database
- [x] No IPs in API responses
- [x] No IPs in Socket.io events
- [x] Only hash prefix in logs (8 chars)
- [x] No IPs in error messages

### ✓ Request Logging
- [x] Request method and path logged
- [x] Response status and duration logged
- [x] Only IP hash prefix logged
- [x] User agent logged
- [x] Timestamps included
- [x] Separate error log file

## Environment Variables

Required environment variables for security configuration:

```env
# Frontend URL for CORS
FRONTEND_URL=http://localhost:3000

# Node environment
NODE_ENV=production

# Trust proxy setting (1 for single proxy)
TRUST_PROXY=1
```

## Production Recommendations

### 1. HTTPS Only
- Deploy behind HTTPS reverse proxy
- HSTS will force HTTPS connections
- Update FRONTEND_URL to use https://

### 2. Rate Limiting
- Consider using Redis for distributed rate limiting
- Adjust limits based on actual usage patterns
- Monitor rate limit violations

### 3. Logging
- Use log aggregation service (e.g., ELK, Splunk)
- Set up alerts for suspicious activity
- Rotate log files regularly

### 4. Monitoring
- Track rate limit violations
- Monitor error rates
- Set up alerts for unusual patterns

### 5. Regular Security Audits
- Review security headers periodically
- Update helmet.js regularly
- Monitor security advisories

## Testing Security Configuration

### Manual Testing

#### 1. Test Security Headers
```bash
curl -I http://localhost:8100/api/public/rooms
```
Expected headers:
- `Strict-Transport-Security`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`

#### 2. Test CORS
```bash
curl -H "Origin: http://localhost:3000" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     http://localhost:8100/api/public/rooms
```
Expected: CORS headers present

#### 3. Test Rate Limiting
```bash
for i in {1..101}; do
  curl http://localhost:8100/api/public/rooms
done
```
Expected: 429 response on 101st request

#### 4. Test IP Privacy
```bash
curl http://localhost:8100/api/public/users \
     -H "Content-Type: application/json" \
     -d '{"displayName":"Test User"}'
```
Expected: Response contains only `userId` and `displayName`, no IP

## Summary

All security requirements have been implemented:

✅ **Requirement 10.3:** CORS configured for public endpoints with proper origin restrictions and exposed rate limit headers

✅ **Requirement 10.4:** Security headers added via helmet.js including CSP, HSTS, X-Frame-Options, and more

✅ **Requirement 10.5:** IP privacy ensured - IPs are hashed before storage, never exposed in responses, and only hash prefixes logged

✅ **Requirement 10.5:** Request logging implemented with IP privacy protection, tracking all requests with method, path, status, duration, and IP prefix

The implementation provides defense-in-depth security with multiple layers:
1. **Transport Security:** HSTS forces HTTPS
2. **Content Security:** CSP prevents XSS
3. **Clickjacking Protection:** X-Frame-Options
4. **Rate Limiting:** Prevents abuse with proper headers
5. **IP Privacy:** Complete protection of user IP addresses
6. **Monitoring:** Comprehensive request logging for security analysis
