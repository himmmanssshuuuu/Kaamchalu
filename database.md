# 🗄️ DATABASE.md

## 📌 Project: Service Marketplace Backend

This document explains the database schema, relationships, workflows, and security rules implemented using **Supabase (PostgreSQL + RLS)**.

---

# 📊 Database Overview

The system supports:

* User profiles (clients & workers)
* Worker services & skills
* Job posting & applications
* Booking lifecycle
* Ratings & disputes
* Notifications system

---

# 🧱 Tables & Explanation

## 1. profiles

**Purpose:** Stores basic user information.

| Column     | Type      | Description                        |
| ---------- | --------- | ---------------------------------- |
| id         | uuid      | Primary key (linked to auth.users) |
| name       | text      | User’s full name                   |
| phone      | text      | Phone number                       |
| role       | text      | 'client' or 'worker'               |
| created_at | timestamp | Account creation time              |

---

## 2. worker_profiles

**Purpose:** Additional details for workers.

| Column        | Type   | Description        |
| ------------- | ------ | ------------------ |
| id            | uuid   | FK → profiles.id   |
| skills        | text[] | Worker skills      |
| experience    | text   | Experience details |
| hourly_rate   | int    | Cost per hour      |
| service_areas | text[] | Locations served   |

---

## 3. jobs

**Purpose:** Jobs posted by clients.

| Column      | Type      | Description                 |
| ----------- | --------- | --------------------------- |
| id          | uuid      | Primary key                 |
| client_id   | uuid      | FK → profiles.id            |
| title       | text      | Job title                   |
| description | text      | Job details                 |
| location    | text      | Job location                |
| budget      | int       | Budget                      |
| status      | text      | open / assigned / completed |
| created_at  | timestamp | Created time                |

---

## 4. job_applications

**Purpose:** Workers apply to jobs.

| Column     | Type      | Description                   |
| ---------- | --------- | ----------------------------- |
| id         | uuid      | Primary key                   |
| job_id     | uuid      | FK → jobs.id                  |
| worker_id  | uuid      | FK → profiles.id              |
| message    | text      | Proposal                      |
| status     | text      | pending / accepted / rejected |
| created_at | timestamp | Applied time                  |

---

## 5. bookings

**Purpose:** Confirmed job between client and worker.

| Column         | Type      | Description       |
| -------------- | --------- | ----------------- |
| id             | uuid      | Primary key       |
| job_id         | uuid      | FK → jobs.id      |
| client_id      | uuid      | FK → profiles.id  |
| worker_id      | uuid      | FK → profiles.id  |
| status         | text      | booking lifecycle |
| scheduled_date | timestamp | Scheduled time    |
| created_at     | timestamp | Created time      |

---

## 6. ratings

**Purpose:** Feedback after job completion.

| Column      | Type | Description      |
| ----------- | ---- | ---------------- |
| id          | uuid | Primary key      |
| booking_id  | uuid | FK → bookings.id |
| reviewer_id | uuid | FK → profiles.id |
| rating      | int  | Rating (1–5)     |
| review      | text | Comment          |

---

## 7. disputes

**Purpose:** Handle conflicts.

| Column     | Type      | Description       |
| ---------- | --------- | ----------------- |
| id         | uuid      | Primary key       |
| booking_id | uuid      | FK → bookings.id  |
| raised_by  | uuid      | FK → profiles.id  |
| reason     | text      | Issue description |
| status     | text      | open / resolved   |
| created_at | timestamp | Created time      |

---

## 8. notifications

**Purpose:** System alerts for users.

| Column     | Type      | Description       |
| ---------- | --------- | ----------------- |
| id         | uuid      | Primary key       |
| user_id    | uuid      | FK → profiles.id  |
| message    | text      | Notification text |
| is_read    | boolean   | Read status       |
| created_at | timestamp | Timestamp         |

---

# 🔗 Relationships

* profiles → worker_profiles (1:1)
* profiles → jobs (1:N, client)
* profiles → job_applications (1:N, worker)
* jobs → job_applications (1:N)
* jobs → bookings (1:1)
* profiles → bookings (client & worker)
* bookings → ratings (1:1)
* bookings → disputes (1:N)
* profiles → notifications (1:N)

---

# 🔄 Booking Status Flow

```
JOB CREATED
     ↓
WORKERS APPLY
     ↓
CLIENT ACCEPTS APPLICATION
     ↓
BOOKING CREATED
     ↓
PENDING
     ↓
CONFIRMED
     ↓
IN_PROGRESS
     ↓
COMPLETED
     ↓
RATING / REVIEW
     ↓
(OPTIONAL) DISPUTE
```

---

# 🔐 Row Level Security (RLS)

### General Rule:

Users can only access their own data unless explicitly allowed.

---

## profiles

* Users can read & update their own profile

## worker_profiles

* Public can view
* Workers can update their own

## jobs

* Public can view jobs
* Clients manage their own jobs

## job_applications

* Workers apply & view their own
* Clients view applications for their jobs

## bookings

* Only client & worker can access

## ratings

* Only involved users can create/view

## disputes

* Only involved users can access

## notifications

* Users can only see their own notifications

---

# 📦 Storage

### Buckets:

* avatars → profile images
* job-photos → job-related images

### Rules:

* Public can view images
* Authenticated users can upload
* Users upload inside their own folder (user_id)

---

# ✅ Summary

* Fully relational schema
* Secure via RLS
* Supports real-world workflow
* Ready for production scaling

---

## 📁 File Location

Save as:

```
docs/DATABASE.md
```

---

## 👥 Team Note

This document should be shared with:

* Backend team
* Frontend developers
* Automation (n8n) team

It serves as the **single source of truth** for database structure.

---
