# Study Session Tracking API Documentation

## Overview
The Study Session Tracking API provides comprehensive timer management functionality for students to track their study sessions with pause/resume capabilities, analytics, and cross-device consistency.

## Base URL
```
/api/sessions
```

## Authentication
All endpoints require JWT authentication via the `Authorization` header:
```
Authorization: Bearer <your_jwt_token>
```

## Endpoints

### 1. Start Study Session
**POST** `/api/sessions/start`

Start a new study session. Only one active session per user is allowed.

**Request Body:**
```json
{
  "subject": "Mathematics",
  "topic": "Calculus - Derivatives",
  "sessionType": "POMODORO_25",
  "plannedDuration": 25,
  "notes": "Focus on chain rule problems",
  "deviceId": "optional-device-identifier"
}
```

**Session Types:**
- `POMODORO_25` - 25 minute Pomodoro session
- `POMODORO_50` - 50 minute Pomodoro session  
- `CUSTOM` - Custom duration session
- `DEEP_WORK` - Deep work session (90+ minutes)
- `REVIEW` - Review session

**Response:**
```json
{
  "success": true,
  "message": "Study session started successfully",
  "data": {
    "sessionId": "uuid-string",
    "startTime": "2024-01-20T10:00:00.000Z",
    "plannedDuration": 25,
    "sessionType": "POMODORO_25",
    "subject": "Mathematics",
    "topic": "Calculus - Derivatives",
    "status": "ACTIVE",
    "serverTime": "2024-01-20T10:00:00.000Z"
  }
}
```

### 2. Get Active Session
**GET** `/api/sessions/active`

Retrieve the currently active session for timer resume functionality.

**Response:**
```json
{
  "success": true,
  "message": "Active session retrieved successfully",
  "data": {
    "sessionId": "uuid-string",
    "subject": "Mathematics",
    "topic": "Calculus - Derivatives",
    "sessionType": "POMODORO_25",
    "plannedDuration": 25,
    "startTime": "2024-01-20T10:00:00.000Z",
    "status": "ACTIVE",
    "pausedAt": null,
    "totalPausedTime": 0,
    "pauseCount": 0,
    "elapsedMinutes": 15,
    "remainingMinutes": 10,
    "serverTime": "2024-01-20T10:15:00.000Z",
    "notes": "Focus on chain rule problems"
  }
}
```

### 3. Pause Session
**PUT** `/api/sessions/:id/pause`

Pause an active study session. Idempotent operation.

**Response:**
```json
{
  "success": true,
  "message": "Session paused successfully",
  "data": {
    "sessionId": "uuid-string",
    "status": "PAUSED",
    "pausedAt": "2024-01-20T10:15:00.000Z",
    "serverTime": "2024-01-20T10:15:00.000Z"
  }
}
```

### 4. Resume Session
**PUT** `/api/sessions/:id/resume`

Resume a paused study session.

**Response:**
```json
{
  "success": true,
  "message": "Session resumed successfully",
  "data": {
    "sessionId": "uuid-string",
    "status": "ACTIVE",
    "resumedAt": "2024-01-20T10:20:00.000Z",
    "pauseDuration": 300,
    "serverTime": "2024-01-20T10:20:00.000Z"
  }
}
```

### 5. End Session
**PUT** `/api/sessions/:id/end`

End a study session and calculate final metrics.

**Request Body:**
```json
{
  "completed": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Session ended successfully",
  "data": {
    "sessionId": "uuid-string",
    "status": "COMPLETED",
    "endTime": "2024-01-20T10:25:00.000Z",
    "totalSessionMinutes": 25,
    "actualStudyMinutes": 20,
    "plannedDuration": 25,
    "productivityScore": 80.0,
    "pauseCount": 1,
    "totalPausedTime": 300,
    "subject": "Mathematics",
    "topic": "Calculus - Derivatives",
    "sessionType": "POMODORO_25"
  }
}
```

### 6. Session History
**GET** `/api/sessions`

Get paginated study session history with filtering options.

**Query Parameters:**
- `dateFrom` (optional) - ISO 8601 date string
- `dateTo` (optional) - ISO 8601 date string
- `subject` (optional) - Subject filter
- `sessionType` (optional) - Session type filter
- `status` (optional) - Status filter
- `page` (optional) - Page number (default: 1)
- `limit` (optional) - Items per page (default: 20, max: 100)

**Example:** `/api/sessions?dateFrom=2024-01-01&subject=Mathematics&page=1&limit=10`

**Response:**
```json
{
  "success": true,
  "message": "Session history retrieved successfully",
  "data": {
    "sessions": [
      {
        "id": "uuid-string",
        "subject": "Mathematics",
        "topic": "Calculus - Derivatives",
        "sessionType": "POMODORO_25",
        "plannedDuration": 25,
        "actualStudyTime": 20,
        "productivityScore": 80.0,
        "status": "COMPLETED",
        "startTime": "2024-01-20T10:00:00.000Z",
        "endTime": "2024-01-20T10:25:00.000Z",
        "pauseCount": 1,
        "totalPausedTime": 300,
        "notes": "Focus on chain rule problems"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 50,
      "totalPages": 5,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

### 7. Study Analytics
**GET** `/api/sessions/analytics`

Get comprehensive study analytics and insights.

**Query Parameters:**
- `days` (optional) - Number of days to analyze (default: 30, max: 365)

**Example:** `/api/sessions/analytics?days=7`

**Response:**
```json
{
  "success": true,
  "message": "Study analytics retrieved successfully",
  "data": {
    "period": {
      "days": 7,
      "from": "2024-01-13T10:00:00.000Z",
      "to": "2024-01-20T10:00:00.000Z"
    },
    "summary": {
      "totalSessions": 15,
      "completedSessions": 12,
      "completionRate": 80.0,
      "totalStudyHours": 8.5,
      "avgProductivityScore": 85.2,
      "avgSessionLength": 34
    },
    "subjectBreakdown": [
      {
        "subject": "Mathematics",
        "minutes": 300,
        "hours": 5.0,
        "sessions": 8
      },
      {
        "subject": "Physics",
        "minutes": 210,
        "hours": 3.5,
        "sessions": 7
      }
    ],
    "dailyBreakdown": [
      {
        "date": "2024-01-20",
        "minutes": 120,
        "hours": 2.0,
        "sessions": 4
      }
    ]
  }
}
```

### 8. Cleanup Expired Sessions (Admin Only)
**POST** `/api/sessions/cleanup`

Admin endpoint to cleanup abandoned sessions.

**Request Body:**
```json
{
  "maxHours": 24
}
```

**Response:**
```json
{
  "success": true,
  "message": "Expired sessions cleaned up successfully",
  "data": {
    "expiredCount": 3,
    "cutoffTime": "2024-01-19T10:00:00.000Z"
  }
}
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    {
      "field": "subject",
      "message": "Subject is required"
    }
  ]
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `201` - Created (for starting sessions)
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

## Usage Examples

### Starting a Study Session
```javascript
const response = await fetch('/api/sessions/start', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  },
  body: JSON.stringify({
    subject: 'Computer Science',
    topic: 'Data Structures - Binary Trees',
    sessionType: 'DEEP_WORK',
    plannedDuration: 90,
    notes: 'Implement AVL tree rotation'
  })
});
```

### Resuming Timer on App Load
```javascript
const response = await fetch('/api/sessions/active', {
  headers: {
    'Authorization': 'Bearer ' + token
  }
});

const data = await response.json();
if (data.data) {
  // Resume timer with server time
  const elapsedMs = data.data.elapsedMinutes * 60 * 1000;
  const remainingMs = data.data.remainingMinutes * 60 * 1000;
  // Update UI accordingly
}
```

## Key Features

1. **Cross-Device Consistency**: Server-side time tracking ensures accuracy across devices
2. **Pause/Resume**: Full support for interruptions with accurate time tracking
3. **Analytics**: Comprehensive insights into study patterns and productivity
4. **Validation**: Input validation for all endpoints
5. **Pagination**: Efficient handling of large datasets
6. **Filtering**: Flexible filtering options for session history
7. **Idempotent Operations**: Safe to retry pause/resume operations
8. **Timezone Aware**: All timestamps in UTC for consistency

## Database Schema

The system uses the following main models:
- `StudySession` - Core session data with time tracking
- `PauseEvent` - Individual pause/resume events
- `Subject` - Predefined subjects for consistency
- `StudyGoal` - User-defined study goals and targets