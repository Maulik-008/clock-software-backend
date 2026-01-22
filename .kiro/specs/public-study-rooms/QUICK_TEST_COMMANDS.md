# Quick Test Commands - Public Study Rooms

## Setup

```bash
# 1. Run migrations
npm run prisma:migrate

# 2. Create 10 test rooms (use Prisma Studio)
npm run prisma:studio
# Or update seed.ts and run:
npm run db:seed

# 3. Start server
npm run dev
```

## Quick Test Sequence

```bash
# Set your base URL
BASE_URL="http://localhost:3000/api/public"

# 1. Get rooms list
curl -X GET $BASE_URL/rooms

# 2. Create user (save the userId from response)
curl -X POST $BASE_URL/users \
  -H "Content-Type: application/json" \
  -d '{"displayName": "Test User"}'

# 3. Join room (replace ROOM_ID and USER_ID)
curl -X POST $BASE_URL/rooms/ROOM_ID/join \
  -H "Content-Type: application/json" \
  -d '{"userId": "USER_ID"}'

# 4. Leave room
curl -X POST $BASE_URL/rooms/ROOM_ID/leave \
  -H "Content-Type: application/json" \
  -d '{"userId": "USER_ID"}'
```

## Validation Tests

```bash
# Test empty display name (should fail)
curl -X POST $BASE_URL/users \
  -H "Content-Type: application/json" \
  -d '{"displayName": ""}'

# Test XSS sanitization
curl -X POST $BASE_URL/users \
  -H "Content-Type: application/json" \
  -d '{"displayName": "<script>alert(\"XSS\")</script>"}'

# Test display name too long (should fail)
curl -X POST $BASE_URL/users \
  -H "Content-Type: application/json" \
  -d '{"displayName": "This is a very long name that exceeds the fifty character limit"}'
```

## Rate Limit Tests

```bash
# Test API rate limit (100 requests/min)
for i in {1..101}; do
  echo "Request $i"
  curl -X GET $BASE_URL/rooms
done

# Test join rate limit (5 attempts/min)
for i in {1..6}; do
  echo "Join attempt $i"
  curl -X POST $BASE_URL/rooms/ROOM_ID/join \
    -H "Content-Type: application/json" \
    -d '{"userId": "USER_ID"}'
done
```

## Verification Checklist

- [ ] GET /rooms returns 10 rooms
- [ ] POST /users creates user with hashed IP
- [ ] POST /join adds user to room
- [ ] POST /leave removes user from room
- [ ] Display name validation works
- [ ] XSS sanitization works
- [ ] Room capacity enforced
- [ ] Single room membership enforced
- [ ] API rate limit (100/min) works
- [ ] Join rate limit (5/min) works
- [ ] No IP addresses in responses
- [ ] All endpoints work without auth

## Expected Port

Default: `http://localhost:3000`

Check your `.env` file or server configuration if different.
