# Super Admin System - Complete Guide

## Overview

The Super Admin system provides comprehensive monitoring, analytics, moderation, and control capabilities for the Study With Me platform. This is a **data-driven, deterministic system** with no AI features.

## Table of Contents

1. [Authentication & Access](#authentication--access)
2. [Platform Analytics](#platform-analytics)
3. [Room Analytics](#room-analytics)
4. [Live Monitoring](#live-monitoring)
5. [Capacity Management](#capacity-management)
6. [User Engagement](#user-engagement)
7. [Session Quality](#session-quality)
8. [Moderation & Safety](#moderation--safety)
9. [Chat Statistics](#chat-statistics)
10. [System Health](#system-health)
11. [Room Controls](#room-controls)
12. [Audit Logs](#audit-logs)
13. [Data Export](#data-export)
14. [Automated Jobs](#automated-jobs)

---

## Authentication & Access

### Requirements
- User must have `SUPER_ADMIN` role
- All requests require Bearer token authentication
- Base URL: `/api/admin`

### Example Request
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.example.com/api/admin/analytics/platform/summary
```

---

## Platform Analytics

### 1. Platform Summary
**GET** `/api/admin/analytics/platform/summary`

Get high-level overview of platform health.

**Response:**
```json
{
  "success": true,
  "data": {
    "users": {
      "total": 1000,
      "online": 50,
      "dailyActive": 200,
      "weeklyActive": 450
    },
    "sessions": {
      "today": 150,
      "week": 1200,
      "avgDuration": 45,
      "weeklyAvgDuration": 42
    },
    "rooms": {
      "active": 5,
      "total": 10
    },
    "peak": {
      "concurrentUsers": 75
    }
  }
}
```

### 2. Platform Trends
**GET** `/api/admin/analytics/platform/trends?days=30`

Get historical trends over time.

**Query Parameters:**
- `days` (optional): Number of days (1-365, default: 30)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "date": "2024-01-15",
      "users": {
        "total": 1000,
        "new": 10,
        "active": 200,
        "peakConcurrent": 75
      },
      "sessions": {
        "total": 150,
        "completed": 135,
        "abandoned": 15,
        "avgDuration": 45
      },
      "rooms": {
        "totalJoins": 200,
        "failedJoins": 5,
        "avgOccupancy": 25.5
      },
      "engagement": {
        "messages": 1500,
        "cameraOnRate": 0.75,
        "micOnRate": 0.60
      }
    }
  ]
}
```

---

## Room Analytics

### 1. All Rooms Analytics
**GET** `/api/admin/analytics/rooms?days=1`

Get analytics for all rooms.

**Query Parameters:**
- `days` (optional): Number of days (default: 1)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "roomId": "room-1",
      "name": "Room 1",
      "currentOccupancy": 25,
      "isLocked": false,
      "totalJoins": 100,
      "failedJoins": 5,
      "peakOccupancy": 45,
      "lastActivity": "2024-01-15T14:30:00Z"
    }
  ]
}
```

### 2. Specific Room Analytics
**GET** `/api/admin/analytics/rooms/:roomId?days=7`

Get detailed analytics for a specific room.

**Query Parameters:**
- `days` (optional): Number of days (1-90, default: 7)

**Response:**
```json
{
  "success": true,
  "data": {
    "roomId": "room-1",
    "period": {
      "days": 7,
      "startDate": "2024-01-08"
    },
    "summary": {
      "totalJoins": 500,
      "failedJoins": 25,
      "peakOccupancy": 48,
      "avgOccupancy": 32.5,
      "totalMessages": 2500,
      "timeAtCapacity": 120,
      "failureRate": 5.0
    },
    "daily": [
      {
        "date": "2024-01-14",
        "joins": 75,
        "failedJoins": 3,
        "peakOccupancy": 45,
        "avgOccupancy": 30.5,
        "messages": 350,
        "timeAtCapacity": 15
      }
    ]
  }
}
```

---

## Live Monitoring

### 1. Live Room Monitoring
**GET** `/api/admin/monitoring/rooms`

Monitor all active rooms in real-time.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "roomId": "room-1",
      "name": "Room 1",
      "occupancy": 25,
      "capacity": 50,
      "isLocked": false,
      "timer": {
        "active": true,
        "startedAt": "2024-01-15T14:00:00Z",
        "duration": 1500,
        "pausedAt": null
      },
      "users": [
        {
          "userId": 1,
          "email": "user@example.com",
          "name": "John Doe",
          "joinedAt": "2024-01-15T14:05:00Z",
          "cameraOn": true,
          "micOn": false,
          "lastActivity": "2024-01-15T14:30:00Z"
        }
      ],
      "activity": {
        "messagesLast24h": 150,
        "joinsLast24h": 50,
        "lastActivityAt": "2024-01-15T14:30:00Z"
      }
    }
  ]
}
```

### 2. Room Details
**GET** `/api/admin/monitoring/rooms/:roomId`

Get detailed information about a specific room.

---

## Capacity Management

### 1. Capacity History
**GET** `/api/admin/capacity/history?roomId=room-1&days=7`

View capacity events and room load history.

**Query Parameters:**
- `roomId` (optional): Filter by specific room
- `days` (optional): Number of days (default: 7)

**Response:**
```json
{
  "success": true,
  "data": {
    "period": {
      "days": 7,
      "startDate": "2024-01-08"
    },
    "summary": [
      {
        "roomId": "room-1",
        "roomName": "Room 1",
        "capacityReached": 15,
        "joinRejected": 25,
        "totalTimeAtCapacity": 180
      }
    ],
    "events": [
      {
        "roomId": "room-1",
        "roomName": "Room 1",
        "eventType": "CAPACITY_REACHED",
        "occupancy": 50,
        "timestamp": "2024-01-15T14:00:00Z",
        "duration": 600
      }
    ]
  }
}
```

### 2. Peak Usage Slots
**GET** `/api/admin/capacity/peak-slots?days=30`

Identify peak usage times.

**Response:**
```json
{
  "success": true,
  "data": {
    "hourlyDistribution": [
      { "hour": 14, "count": 25 },
      { "hour": 15, "count": 22 }
    ],
    "dayDistribution": [
      { "day": 1, "count": 50 },
      { "day": 2, "count": 45 }
    ],
    "peakHour": 14,
    "peakDay": 1
  }
}
```

---

## User Engagement

**GET** `/api/admin/analytics/engagement?days=7`

Get aggregated user engagement metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "period": {
      "days": 7,
      "startDate": "2024-01-08"
    },
    "sessions": {
      "avgPerUser": 3.5,
      "avgDuration": 45,
      "totalUsers": 200
    },
    "media": {
      "cameraOnRate": 75.5,
      "micOnRate": 60.2
    },
    "chat": {
      "avgMessagesPerUser": 12.5,
      "activeUsers": 150
    },
    "distribution": {
      "sessionsPerUser": {
        "min": 1,
        "max": 15,
        "median": 3,
        "p90": 8
      },
      "messagesPerUser": {
        "min": 0,
        "max": 50,
        "median": 10,
        "p90": 25
      }
    }
  }
}
```

---

## Session Quality

**GET** `/api/admin/analytics/sessions/quality?days=7`

Measure study session effectiveness.

**Response:**
```json
{
  "success": true,
  "data": {
    "period": {
      "days": 7,
      "startDate": "2024-01-08"
    },
    "overview": {
      "totalSessions": 1000,
      "completed": 850,
      "abandoned": 120,
      "expired": 30,
      "completionRate": 85.0,
      "abandonmentRate": 12.0
    },
    "quality": {
      "avgPauseCount": 2.5,
      "avgPausedTime": 5.2,
      "durationAccuracy": 92.5
    }
  }
}
```

---

## Moderation & Safety

### 1. Moderation Dashboard
**GET** `/api/admin/moderation/dashboard?days=30`

Get overview of moderation activities.

**Response:**
```json
{
  "success": true,
  "data": {
    "period": {
      "days": 30,
      "startDate": "2023-12-16"
    },
    "summary": {
      "totalActions": 50,
      "activeMutes": 5,
      "activeBans": 2,
      "repeatOffenders": 3
    },
    "actionsByType": [
      { "type": "MUTE", "count": 25 },
      { "type": "KICK", "count": 15 },
      { "type": "BAN", "count": 5 },
      { "type": "WARN", "count": 5 }
    ],
    "recentActions": [...],
    "activeMutes": [...],
    "activeBans": [...]
  }
}
```

### 2. User Moderation History
**GET** `/api/admin/moderation/history/:userId`

Get moderation history for a specific user.

### 3. Mute User
**POST** `/api/admin/moderation/mute`

```json
{
  "userId": 123,
  "roomId": "room-1",
  "reason": "Spam messages",
  "duration": 30
}
```

### 4. Kick User
**POST** `/api/admin/moderation/kick`

```json
{
  "userId": 123,
  "roomId": "room-1",
  "reason": "Disruptive behavior"
}
```

### 5. Ban User
**POST** `/api/admin/moderation/ban`

```json
{
  "userId": 123,
  "reason": "Repeated violations",
  "duration": 7
}
```

### 6. Unban User
**POST** `/api/admin/moderation/unban`

```json
{
  "userId": 123
}
```

---

## Chat Statistics

**GET** `/api/admin/analytics/chat?roomId=room-1&days=7`

Get chat interaction statistics.

**Query Parameters:**
- `roomId` (optional): Filter by specific room
- `days` (optional): Number of days (default: 7)

**Response:**
```json
{
  "success": true,
  "data": {
    "period": {
      "days": 7,
      "startDate": "2024-01-08"
    },
    "summary": {
      "totalMessages": 5000,
      "avgPerDay": 714
    },
    "byRoom": [
      {
        "roomId": "room-1",
        "roomName": "Room 1",
        "count": 2500
      }
    ],
    "byType": [
      { "type": "TEXT", "count": 4500 },
      { "type": "EMOJI", "count": 500 }
    ],
    "topChatters": [
      { "userId": 1, "messageCount": 150 }
    ]
  }
}
```

---

## System Health

### 1. System Health
**GET** `/api/admin/system/health`

Get current system health metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "timestamp": "2024-01-15T14:30:00Z",
    "connections": {
      "active": 50,
      "failed": 2
    },
    "performance": {
      "avgResponseTime": 150,
      "errorRate4xx": 1.5,
      "errorRate5xx": 0.2
    },
    "issues": {
      "timerDesyncEvents": 0
    },
    "history": [...]
  }
}
```

### 2. System Alerts
**GET** `/api/admin/system/alerts`

Get active system alerts.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "severity": "warning",
      "message": "2 room(s) at maximum capacity",
      "timestamp": "2024-01-15T14:30:00Z"
    }
  ]
}
```

---

## Room Controls

### 1. Lock Room
**POST** `/api/admin/rooms/:roomId/lock`

```json
{
  "reason": "Maintenance"
}
```

### 2. Unlock Room
**POST** `/api/admin/rooms/:roomId/unlock`

### 3. Reset Room Timer
**POST** `/api/admin/rooms/:roomId/timer/reset`

### 4. Clear Room Chat
**DELETE** `/api/admin/rooms/:roomId/chat`

### 5. Remove All Users
**DELETE** `/api/admin/rooms/:roomId/users`

```json
{
  "reason": "Emergency maintenance"
}
```

---

## Audit Logs

**GET** `/api/admin/audit-logs`

Query audit logs with filters.

**Query Parameters:**
- `userId` (optional): Filter by user ID
- `action` (optional): Filter by action type
- `resource` (optional): Filter by resource type
- `startDate` (optional): Start date (ISO 8601)
- `endDate` (optional): End date (ISO 8601)
- `limit` (optional): Max results (default: 100)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "log-1",
      "user": {
        "id": 1,
        "email": "admin@example.com",
        "name": "Admin User",
        "role": "SUPER_ADMIN"
      },
      "action": "ROOM_LOCKED",
      "resource": "room",
      "resourceId": "room-1",
      "description": "Room Room 1 locked: Maintenance",
      "metadata": {
        "reason": "Maintenance"
      },
      "timestamp": "2024-01-15T14:30:00Z",
      "ipAddress": "192.168.1.1"
    }
  ]
}
```

---

## Data Export

### 1. Export Room Usage
**GET** `/api/admin/export/room-usage?startDate=2024-01-01&endDate=2024-01-31`

Download room usage data as CSV.

**Query Parameters:**
- `startDate` (optional): Start date (ISO 8601)
- `endDate` (optional): End date (ISO 8601)

**Response:** CSV file download

### 2. Export Moderation Logs
**GET** `/api/admin/export/moderation-logs?startDate=2024-01-01&endDate=2024-01-31`

Download moderation logs as CSV.

---

## Automated Jobs

The system includes automated cron jobs for data aggregation and maintenance:

### Daily Jobs (Run at Midnight)
1. **Aggregate Platform Stats** - Calculates daily platform metrics
2. **Aggregate Room Analytics** - Calculates per-room daily metrics
3. **Cleanup Old Data** - Removes data older than 90 days

### Every 5 Minutes
1. **Update Room States** - Refreshes real-time room state
2. **Record System Metrics** - Captures system health metrics

### Hourly
1. **Expire Moderation Actions** - Deactivates expired mutes/bans

### Setup Example (using node-cron)

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

---

## Database Schema

The system adds the following tables:

- `platform_stats` - Daily platform metrics
- `room_analytics` - Daily per-room metrics
- `room_states` - Real-time room state
- `user_presence` - Current user locations
- `capacity_events` - Capacity limit events
- `moderation_actions` - Moderation history
- `audit_logs` - All admin actions
- `system_metrics` - System health metrics

---

## Testing

### Run Unit Tests
```bash
npm run test -- admin.service.unit.test
```

### Run Integration Tests
```bash
npm run test -- admin.integration.test
```

### Load Test
See `scripts/admin-load-test.ts` for simulating 10 rooms × 50 users.

---

## Security Considerations

1. **Role-Based Access** - All endpoints require SUPER_ADMIN role
2. **Audit Logging** - All actions are logged immutably
3. **Rate Limiting** - Apply rate limits to admin endpoints
4. **IP Whitelisting** - Consider restricting admin access by IP
5. **Two-Factor Auth** - Recommended for super admin accounts

---

## Performance Optimization

1. **Indexes** - All analytics queries use proper indexes
2. **Aggregation** - Daily stats pre-computed via cron
3. **Pagination** - Large result sets are limited
4. **Caching** - Consider Redis for frequently accessed metrics

---

## Monitoring & Alerts

Set up alerts for:
- Rooms at capacity for > 30 minutes
- Error rate > 5%
- Failed connections > 50/hour
- Timer desync events > 10/hour

---

## Support

For issues or questions, contact the development team or refer to the codebase documentation.
