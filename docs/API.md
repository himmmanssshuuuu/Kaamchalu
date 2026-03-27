# Kaamchallu API Documentation

## Table of Contents
- [Authentication](#authentication)
- [Admin](#admin)
- [Jobs](#jobs)
- [Bookings](#bookings)
- [Workers](#workers)
- [Ratings & Reviews](#ratings--reviews)
- [Notifications](#notifications)

---

## Authentication

### SIGNUP
Method: `POST` URL: `/api/auth/signup` Auth: `Not required`
Request Body:
```json
{
  "phone": "9876543210",
  "password": "securepassword123"
}
```
Response:
```json
{
  "success": true,
  "user": { "id": "...", "email": "9876543210@app.com", ... },
  "session": { "token": "..." }
}
```
Error Responses:
- 400: `{ "success": false, "message": "error reason" }`

### LOGIN
Method: `POST` URL: `/api/auth/login` Auth: `Not required`
Request Body:
```json
{
  "phone": "9876543210",
  "password": "securepassword123"
}
```
Response:
```json
{
  "success": true,
  "session": { "access_token": "...", "user": { ... } }
}
```
Error Responses:
- 401: `{ "success": false, "message": "Invalid login credentials" }`

### SIGNUP_WORKER
Method: `POST` URL: `/api/auth/signup-worker` Auth: `Required`
Request Body:
```json
{
  "full_name": "John Doe",
  "skills": ["Cleaning", "Plumbing"],
  "experience": 5,
  "hourly_rate": 500,
  "service_areas": ["Downtown", "Eastside"],
  "availability": "Weekdays",
  "languages": ["Hindi", "English"],
  "about": "Expert cleaner",
  "aadhaar_number": "123456789012"
}
```
Response:
```json
{
  "success": true,
  "profile": { ... }
}
```

### SIGNUP_CUSTOMER
Method: `POST` URL: `/api/auth/signup-customer` Auth: `Required`
Request Body:
```json
{
  "full_name": "Jane Smith",
  "area": "Westside",
  "pin_code": "110001",
  "email": "jane@example.com"
}
```
Response:
```json
{
  "success": true,
  "profile": { ... }
}
```

### GET_ME
Method: `GET` URL: `/api/auth/me` Auth: `Required`
Response:
```json
{
  "success": true,
  "user": { ... },
  "profile": { ... },
  "worker_profile": { ... }
}
```

---

## Admin

### GET_DASHBOARD
Method: `GET` URL: `/api/admin/dashboard` Auth: `Admin only`
Response:
```json
{
  "success": true,
  "data": {
    "total_workers": { "active": 0, "pending": 0, "suspended": 0 },
    "total_customers": 0,
    "bookings": { "today": 0, "this_week": 0, "this_month": 0 },
    "completion_rate": 0,
    "avg_rating": 0,
    "open_disputes": 0
  }
}
```

### GET_VERIFICATION_QUEUE
Method: `GET` URL: `/api/admin/verification-queue` Auth: `Admin only`
Response:
```json
{
  "success": true,
  "data": [ { "id": "...", "status": "pending_verification", ... } ]
}
```

### MANAGE_USERS
Method: `GET` URL: `/api/admin/users` Auth: `Admin only`
Query Params: `role`, `search`, `status`, `page`, `limit`
Response:
```json
{
  "success": true,
  "data": [ ... ],
  "count": 100
}
```

### GET_DISPUTES
Method: `GET` URL: `/api/admin/disputes` Auth: `Admin only`
Response:
```json
{
  "success": true,
  "data": [ ... ],
  "count": 5
}
```

### RESOLVE_DISPUTE
Method: `PATCH` URL: `/api/admin/disputes/:id` Auth: `Admin only`
Request Body:
```json
{
  "status": "resolved",
  "resolution": "Full refund to customer",
  "admin_notes": "Worker was no-show"
}
```
Response:
```json
{
  "success": true,
  "data": { ... }
}
```

---

## Jobs

### POST_JOB
Method: `POST` URL: `/api/jobs` Auth: `Required (Customer)`
Request Body:
```json
{
  "category": "Cleaning",
  "description": "3 room cleaning",
  "location": "Address string",
  "pin_code": "110001",
  "preferred_date": "2024-04-01",
  "preferred_time": "10:00 AM",
  "budget": 1000,
  "photo_urls": ["url1", "url2"]
}
```
Response:
```json
{
  "success": true,
  "data": { "id": "...", "status": "posted", ... }
}
```

### APPLY_FOR_JOB
Method: `POST` URL: `/api/jobs/:id/apply` Auth: `Required (Worker)`
Response:
```json
{
  "success": true,
  "data": { "job_id": "...", "worker_id": "...", "status": "accepted" }
}
```

### CONFIRM_WORKER
Method: `POST` URL: `/api/jobs/:id/confirm` Auth: `Required (Customer)`
Request Body:
```json
{
  "worker_id": "..."
}
```
Response:
```json
{
  "success": true,
  "data": { "booking_id": "...", ... }
}
```

---

## Bookings

### GET_BOOKINGS
Method: `GET` URL: `/api/bookings` Auth: `Required`
Query Params: `status`, `page`, `limit`
Response:
```json
{
  "success": true,
  "data": [ ... ],
  "count": 10
}
```

### UPDATE_BOOKING_STATUS
Method: `PATCH` URL: `/api/bookings/:id` Auth: `Required`
Request Body:
```json
{
  "action": "start | complete | cancel | dispute",
  "reason": "Text reason for cancel/dispute"
}
```
Response:
```json
{
  "success": true,
  "data": { ... }
}
```

---

## Workers

### UPDATE_PROFILE
Method: `PATCH` URL: `/api/workers/:id` Auth: `Required (Owner)`
Request Body:
```json
{
  "hourly_rate": 600,
  "about": "Updated bio..."
}
```
Response:
```json
{
  "success": true,
  "data": { ... }
}
```

### ADMIN_UPDATE_STATUS
Method: `PATCH` URL: `/api/workers/:id/status` Auth: `Admin only`
Request Body:
```json
{
  "status": "active | suspended | rejected",
  "reason": "Documentation verified"
}
```

---

## Ratings & Reviews

### SUBMIT_RATING
Method: `POST` URL: `/api/ratings` Auth: `Required`
Request Body:
```json
{
  "booking_id": "...",
  "score": 5,
  "review_text": "Great service!"
}
```

---

## Notifications

### GET_NOTIFICATIONS
Method: `GET` URL: `/api/notifications` Auth: `Required`
Response:
```json
{
  "success": true,
  "unread_count": 5,
  "data": [ ... ]
}
```

### READ_ALL_NOTIFICATIONS
Method: `POST` URL: `/api/notifications/read-all` Auth: `Required`
Response:
```json
{
  "success": true,
  "message": "All notifications marked as read"
}
```

---

## Common Error Responses
- **400 Bad Request**: `{ "success": false, "message": "Reason..." }`
- **401 Unauthorized**: `{ "success": false, "message": "Auth required" }`
- **403 Forbidden**: `{ "success": false, "message": "Admin/Owner access required" }`
- **404 Not Found**: `{ "success": false, "message": "Resource not found" }`
- **500 Internal Error**: `{ "success": false, "message": "Server error" }`
