# Super Admin System

A comprehensive, data-driven backend system for monitoring, analytics, moderation, and control of the Study With Me platform.

## 🎯 Features

### ✅ Implemented

1. **Global Platform Analytics**
   - Real-time user counts (total, online, active)
   - Session statistics (daily/weekly totals, completion rates)
   - Peak concurrent user tracking
   - Historical trends (up to 365 days)

2. **Room-Level Analytics**
   - Per-room occupancy metrics (current, peak, average)
   - Join/leave tracking with failure rates
   - Time spent at capacity
   - Message activity per room
   - Historical data with date ranges

3. **Live Room Monitoring**
   - Real-time room state observation
   - Active user lists with media status (camera/mic)
   - Timer state monitoring
   - Activity metrics (messages, joins in last 24h)
   - Read-only monitoring (doesn't affect room state)

4. **Capacity & Load Management**
   - Capacity event tracking (reached/released/rejected)
   - Failed join attempt logging
   - Peak usage time slot identification
   - Hourly and daily distribution analysis

5. **User Engagement Analytics**
   - Sessions per user (aggregated)
   - Average session duration
   - Camera/mic usage rates
   - Chat participation metrics
   - Distribution analysis (min/max/median/p90)

6. **Session Quality Metrics**
   - Completion vs abandonment rates
   - Pause frequency and duration
   - Duration accuracy (planned vs actual)
   - Early exit tracking

7. **Moderation & Safety**
   - Mute/kick/ban/warn actions
   - Active moderation tracking
   - Repeat offender identification
   - Per-user moderation history
   - Temporary and permanent actions

8. **Chat Statistics**
   - Message counts per room
   - Message type distribution
   - Top chatters identification
   - Activity rate over time

9. **System Health Monitoring**
   - Active socket connection tracking
   - Failed connection monitoring
   - API response time metrics
   - Error rate tracking (4xx/5xx)
   - Timer desynchronization detection
   - Threshold-based alerts

10. **Admin Controls**
    - Lock/unlock rooms
    - Reset room timers
    - Clear room chat
    - Force remove all users
    - All actions audited

11. **Audit Logs**
    - Immutable action logging
    - Queryable by user, action, resource, date
    - IP address and user agent tracking
    - Metadata storage for context

12. **Data Export**
    - CSV export for room usage
    - CSV export for moderation logs
    - Date range filtering

## 📁 File Structure

```
src/components/admin/
├── admin.service.ts          # Business logic layer
├── admin.controller.ts       # HTTP request handlers
├── admin.routes.ts           # API route definitions
├── admin.cron.ts            # Automated aggregation jobs
├── __tests__/
│   ├── admin.service.unit.test.ts
│   └── admin.integration.test.ts
└── README.md                # This file

prisma/schema/
└── admin.prisma             # Database schema for admin features

scripts/
└── admin-load-test.ts       # Load testing script

SUPER_ADMIN_GUIDE.md         # Complete API documentation
```

## 🗄️ Database Schema

### New Tables

- **platform_stats** - Daily aggregated platform metrics
- **room_analytics** - Daily per-room analytics
- **room_states** - Real-time room state snapshots
- **user_presence** - Current user locations and media state
- **capacity_events** - Capacity limit events
- **moderation_actions** - All moderation actions
- **audit_logs** - Immutable admin action logs
- **system_metrics** - System health metrics

### Schema Updates

- **rooms** - Added `isLocked` field
- **users** - Added relations for moderation and audit

## 🚀 Getting Started

### 1. Run Migrations

```bash
npm run prisma:migrate
```

### 2. Generate Prisma Client

```bash
npm run prisma:generate
```

### 3. Seed Initial Data (Optional)

```bash
npm run db:seed
```

### 4. Start Server

```bash
npm run dev
```

### 5. Create Super Admin User

```typescript
await prisma.user.create({
  data: {
    email: 'admin@example.com',
    password: await bcrypt.hash('secure-password', 10),
    role: 'SUPER_ADMIN',
    isEmailVerified: true
  }
});
```

## 🧪 Testing

### Run Unit Tests

```bash
npm run test:admin
```

### Run Integration Tests

```bash
npm run test -- admin.integration.test
```

### Run Load Test

Simulates 10 rooms with 50 users each:

```bash
npm run test:admin:load
```

Keep test data for inspection:

```bash
npm run test:admin:load -- --keep-data
```

## 📊 API Endpoints

All endpoints require `SUPER_ADMIN` role and Bearer token authentication.

Base URL: `/api/admin`

### Analytics
- `GET /analytics/platform/summary` - Platform overview
- `GET /analytics/platform/trends` - Historical trends
- `GET /analytics/rooms` - All rooms analytics
- `GET /analytics/rooms/:roomId` - Specific room analytics
- `GET /analytics/engagement` - User engagement metrics
- `GET /analytics/sessions/quality` - Session quality metrics
- `GET /analytics/chat` - Chat statistics

### Monitoring
- `GET /monitoring/rooms` - Live room monitoring
- `GET /monitoring/rooms/:roomId` - Room details

### Capacity
- `GET /capacity/history` - Capacity event history
- `GET /capacity/peak-slots` - Peak usage times

### Moderation
- `GET /moderation/dashboard` - Moderation overview
- `GET /moderation/history/:userId` - User moderation history
- `POST /moderation/mute` - Mute user
- `POST /moderation/kick` - Kick user
- `POST /moderation/ban` - Ban user
- `POST /moderation/unban` - Unban user

### System
- `GET /system/health` - System health metrics
- `GET /system/alerts` - Active alerts

### Room Controls
- `POST /rooms/:roomId/lock` - Lock room
- `POST /rooms/:roomId/unlock` - Unlock room
- `POST /rooms/:roomId/timer/reset` - Reset timer
- `DELETE /rooms/:roomId/chat` - Clear chat
- `DELETE /rooms/:roomId/users` - Remove all users

### Audit & Export
- `GET /audit-logs` - Query audit logs
- `GET /export/room-usage` - Export room usage CSV
- `GET /export/moderation-logs` - Export moderation CSV

See [SUPER_ADMIN_GUIDE.md](../../../SUPER_ADMIN_GUIDE.md) for detailed API documentation.

## ⏰ Automated Jobs

### Setup Cron Jobs

```typescript
import cron from 'node-cron';
import { adminCronService } from './components/admin/admin.cron';

// Daily at midnight
cron.schedule('0 0 * * *', async () => {
    await adminCronService.aggregateDailyPlatformStats();
    await adminCronService.aggregateDailyRoomAnalytics();
    await adminCronService.cleanupOldData();
});

// Every 5 minutes
cron.schedule('*/5 * * * *', async () => {
    await adminCronService.updateRoomStates();
    await adminCronService.recordSystemMetrics();
});

// Every hour
cron.schedule('0 * * * *', async () => {
    await adminCronService.expireModerationActions();
});
```

### Job Descriptions

**Daily Jobs:**
- Aggregate platform statistics
- Aggregate room analytics
- Cleanup old data (90+ days)

**5-Minute Jobs:**
- Update room states
- Record system metrics

**Hourly Jobs:**
- Expire temporary moderation actions

## 🔒 Security

### Authentication
- All endpoints require valid JWT token
- Token must belong to user with `SUPER_ADMIN` role

### Authorization
- Role check middleware on all routes
- Separate from student API endpoints

### Audit Trail
- All admin actions logged immutably
- IP address and user agent captured
- Queryable for compliance

### Best Practices
1. Use strong passwords for super admin accounts
2. Enable two-factor authentication
3. Restrict admin access by IP (firewall/VPN)
4. Apply rate limiting to admin endpoints
5. Monitor audit logs regularly
6. Rotate admin credentials periodically

## 📈 Performance

### Optimizations
- Proper database indexes on all query fields
- Daily pre-aggregation of statistics
- Pagination on large result sets
- Efficient SQL queries with proper joins

### Indexes
```sql
-- Room analytics
CREATE INDEX idx_room_analytics_room_date ON room_analytics(room_id, date);
CREATE INDEX idx_room_analytics_date ON room_analytics(date);

-- Capacity events
CREATE INDEX idx_capacity_events_room_timestamp ON capacity_events(room_id, timestamp);
CREATE INDEX idx_capacity_events_type_timestamp ON capacity_events(event_type, timestamp);

-- User presence
CREATE INDEX idx_user_presence_room ON user_presence(room_id);
CREATE INDEX idx_user_presence_user ON user_presence(user_id);
CREATE INDEX idx_user_presence_joined ON user_presence(joined_at);

-- Audit logs
CREATE INDEX idx_audit_logs_user_timestamp ON audit_logs(user_id, timestamp);
CREATE INDEX idx_audit_logs_action_timestamp ON audit_logs(action, timestamp);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource, resource_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
```

## 🐛 Troubleshooting

### Common Issues

**Issue:** Analytics showing zero values
- **Solution:** Run cron jobs to aggregate data, or wait for next scheduled run

**Issue:** Room occupancy mismatch
- **Solution:** Run `updateRoomStates()` cron job to sync

**Issue:** Moderation actions not expiring
- **Solution:** Ensure hourly cron job is running

**Issue:** High database load
- **Solution:** Check indexes are created, consider adding Redis cache

## 🔄 Future Enhancements

Potential additions (not currently implemented):
- Real-time WebSocket dashboard for live monitoring
- Custom alert rules and notifications
- Advanced analytics (cohort analysis, retention)
- Automated moderation suggestions
- Performance benchmarking tools
- Multi-tenant support
- Role hierarchy (moderators, support staff)

## 📝 Contributing

When adding new features:
1. Update schema in `admin.prisma`
2. Add service methods in `admin.service.ts`
3. Add controller methods in `admin.controller.ts`
4. Add routes in `admin.routes.ts`
5. Write unit tests
6. Write integration tests
7. Update documentation
8. Add audit logging for admin actions

## 📚 Resources

- [Complete API Guide](../../../SUPER_ADMIN_GUIDE.md)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Express.js Documentation](https://expressjs.com/)
- [Jest Testing](https://jestjs.io/)

## 📄 License

Same as parent project.
