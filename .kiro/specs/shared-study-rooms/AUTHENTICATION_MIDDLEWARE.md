# JWT Authentication Middleware - Reuse Confirmation

## Task 3.1: Create or reuse JWT authentication middleware

### Status: ✅ REUSED EXISTING MIDDLEWARE

The existing JWT authentication middleware at `src/middlewares/authentication.ts` fully satisfies all requirements for the Shared Study Rooms feature.

## Middleware Location
- **File**: `src/middlewares/authentication.ts`
- **Export**: `authenticate` function
- **Type**: `AuthenticatedRequest` interface

## Requirements Validation

### ✅ Requirement 2.1: Verify JWT token from Authorization header
**Implementation**: Lines 18-28
```typescript
const authHeader = req.headers.authorization;

if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
        success: false,
        message: "Access token required",
    });
    return;
}

const token = authHeader.substring(7); // Remove "Bearer " prefix
```

### ✅ Requirement 9.1: Extract user_id from token payload
**Implementation**: Lines 31-32, 58-66
```typescript
const payload = JwtService.verifyAccessToken(token);

// Fetch user from database to ensure they still exist
const user = await PRISMA_DB_CLIENT.user.findUnique({
    where: { id: payload.userId },
    // ...
});

req.user = {
    id: user.id,  // user_id attached to request
    email: user.email,
    firstName: user.firstName || undefined,
    lastName: user.lastName || undefined,
    role: user.role,
    isEmailVerified: user.isEmailVerified,
};
```

### ✅ Requirement 9.2: Reject requests with 401 if token is missing
**Implementation**: Lines 21-26
```typescript
if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
        success: false,
        message: "Access token required",
    });
    return;
}
```

### ✅ Requirement 9.3: Reject requests with 401 if token is invalid or expired
**Implementation**: Lines 49-55
```typescript
} catch (jwtError) {
    res.status(401).json({
        success: false,
        message: "Invalid or expired token",
    });
    return;
}
```

Also validates user still exists in database (Lines 40-48):
```typescript
if (!user) {
    res.status(401).json({
        success: false,
        message: "User not found",
    });
    return;
}
```

### ✅ Requirement 15.2: Attach user_id to request object for downstream handlers
**Implementation**: Lines 58-66
```typescript
req.user = {
    id: user.id,           // user_id available as req.user.id
    email: user.email,
    firstName: user.firstName || undefined,
    lastName: user.lastName || undefined,
    role: user.role,
    isEmailVerified: user.isEmailVerified,
};
next();
```

## Additional Features

The middleware provides additional functionality beyond the basic requirements:

1. **Role-based Authorization**: `requireRole(roles: string[])` middleware for admin endpoints
2. **Email Verification Check**: `requireEmailVerification` middleware (currently disabled in dev)
3. **Database Validation**: Verifies user still exists in database, not just token validity
4. **Type Safety**: Exports `AuthenticatedRequest` interface for TypeScript support

## Usage in Shared Study Rooms

The room routes will use this middleware as follows:

```typescript
import { authenticate, requireRole } from "../../middlewares/authentication";
import type { AuthenticatedRequest } from "../../middlewares/authentication";

// Apply to all room endpoints
router.get("/api/rooms", authenticate, getRoomList);
router.post("/api/rooms/:id/join", authenticate, joinRoom);
router.post("/api/rooms/:id/leave", authenticate, leaveRoom);
router.post("/api/rooms/:id/chat", authenticate, sendMessage);
router.post("/api/rooms/:id/timer-sync", authenticate, syncTimer);

// Admin-only moderation endpoint
router.post("/api/admin/rooms/:id/moderate", 
    authenticate, 
    requireRole(["ADMIN", "SUPER_ADMIN"]), 
    moderateParticipant
);
```

## Accessing User Data in Controllers

Controllers can access authenticated user data via `req.user`:

```typescript
import type { AuthenticatedRequest } from "../../middlewares/authentication";

async function joinRoom(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.id;  // Type-safe access to user_id
    const roomId = req.params.id;
    
    // Use userId in business logic
    await roomService.joinRoom(roomId, userId);
}
```

## JWT Service Details

The middleware uses `JwtService` from `src/utils/jwt.ts`:
- **Token Verification**: `JwtService.verifyAccessToken(token)` validates signature and expiration
- **Secret Key**: Uses `process.env.JWT_SECRET` for verification
- **Token Expiration**: Default 15 minutes (configurable via `JWT_EXPIRES_IN`)
- **Payload Structure**: `{ userId: number, email: string, role: string }`

## Conclusion

**No new middleware creation is required.** The existing authentication middleware fully implements all requirements for task 3.1 and can be directly imported and used in the Shared Study Rooms feature.

**Task Status**: ✅ COMPLETE (via reuse)
