# TimetableOS — Enterprise Timetable Management System
## Complete Setup & Deployment Guide

---

## System Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│  FRONTEND  React 18 + TailwindCSS + Zustand + React Query│
│            Custom drag-drop timetable grid               │
│            Socket.IO client for real-time updates        │
└────────────────────┬────────────────────────────────────┘
                     │ REST + WebSocket
┌────────────────────▼────────────────────────────────────┐
│  BACKEND   FastAPI (async) + SQLAlchemy + Pydantic       │
│  Services: TimetableService, RealtimeService             │
│  AI:       OR-Tools CP-SAT → XGBoost Scorer              │
└────────┬──────────────────────────────────┬─────────────┘
         │                                  │
┌────────▼──────────┐            ┌──────────▼──────────────┐
│  MSSQL 2022       │            │  Redis 7                 │
│  Central timetable│            │  Socket.IO adapter       │
│  All ORM models   │            │  Token cache             │
└───────────────────┘            └─────────────────────────┘
```

---

## Prerequisites

- Docker Desktop 4.x+ (Windows/Mac) or Docker Engine 24+ (Linux)
- Docker Compose v2.x
- Git
- Node.js 20+ (local dev only)
- Python 3.11+ (local dev only)

---

## Quick Start (Docker — Recommended)

### 1. Clone and configure

```bash
git clone <your-repo-url> timetable-system
cd timetable-system

# Copy environment file
cp .env.example .env

# Edit secrets (IMPORTANT for production)
# Change: MSSQL_SA_PASSWORD, SECRET_KEY
nano .env
```

### 2. Launch the full stack

```bash
docker compose up --build
```

First boot takes 3–5 minutes (MSSQL initialisation + pip installs).

### 3. Access

| Service        | URL                          |
|----------------|------------------------------|
| Frontend       | http://localhost:3000        |
| Backend API    | http://localhost:8000        |
| API Docs       | http://localhost:8000/docs   |
| Nginx proxy    | http://localhost:80          |

### 4. Default credentials (from seed)

| Role    | Email                      | Password       |
|---------|----------------------------|----------------|
| Admin   | admin@timetable.com        | Admin@1234     |
| Teacher | t001@timetable.com         | Teacher@1234   |
| Student | student@timetable.com      | Student@1234   |

You can also create new accounts from the frontend.
- Go to `http://localhost:3000/signup`
- Choose a role, provide your email and password
- Teachers must provide department, employee ID, and name
- Students must provide section, batch, student ID, and name

---

## Local Development (No Docker)

### Backend

```bash
cd backend

# Create virtualenv
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment
cp ../.env.example .env
# Edit DATABASE_URL to point to your local MSSQL instance

# Run migrations
alembic upgrade head

# Seed database
python -m app.db.seed

# Start server (development)
uvicorn app.main:socket_app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd frontend

npm install
npm run dev
# → http://localhost:3000
```

---

## Step-by-Step: First Timetable

Once logged in as Admin:

### Step 1 — Configure Department
1. Go to **Departments** → Create department (e.g. CSE)
2. Set lab slot preference to "Morning"

### Step 2 — Create Academic Structure
1. **Academic Years** → Add SE (year 2)
2. **Sections** → Add SE-A, SE-B under SE
3. **Batches** → Add A1, A2, A3 under SE-A

### Step 3 — Configure Timetable Settings
```
POST /api/v1/admin/timetable-settings
{
  "department_id": "<CSE_ID>",
  "working_days": "monday,tuesday,wednesday,thursday,friday",
  "lectures_per_day": 7,
  "break_after_lectures": 3,
  "lecture_start_time": "09:00",
  "lecture_duration_min": 60,
  "lunch_after_slot": 3,
  "lunch_duration_min": 45
}
```
This auto-generates timeslots.

### Step 4 — Add Subjects & Frequencies
1. Add subjects (DBMS, OS, CN)
2. Set lecture frequencies per section:
   - DBMS/SE-A: 3 theory/week, 1 tutorial/week, 1 lab/week

### Step 5 — Add Teachers & Assign Subjects
1. Create teachers
2. Assign: `POST /api/v1/admin/teachers/assign-subject`
   - DBMS theory → Teacher A
   - DBMS tutorial → Teacher A (per batch)
   - DBMS lab → Teacher A (per batch)

### Step 6 — Generate Timetable
```
POST /api/v1/timetable/generate
{
  "department_id": "<CSE_ID>",
  "academic_year_id": "<SE_ID>",
  "version_name": "Week 1",
  "num_candidates": 5
}
```

OR via the Admin UI: **Timetable** → Configure → Click "Generate"

### Step 7 — Publish
```
POST /api/v1/timetable/versions/<VERSION_ID>/publish
```

All dashboards auto-update via WebSocket.

---

## API Quick Reference

### Auth
```
POST /api/v1/auth/login
POST /api/v1/auth/signup
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

### Admin
```
GET/POST        /api/v1/admin/departments
PATCH/DELETE    /api/v1/admin/departments/{id}
GET/POST        /api/v1/admin/sections/{academic_year_id}
GET/POST        /api/v1/admin/teachers
POST            /api/v1/admin/teachers/assign-subject
GET/POST        /api/v1/admin/classrooms
POST            /api/v1/admin/timetable-settings
PATCH           /api/v1/admin/constraints/{dept_id}
```

### Timetable
```
POST   /api/v1/timetable/generate
POST   /api/v1/timetable/versions/{id}/publish
GET    /api/v1/timetable/versions/{id}/all           ← Admin view
GET    /api/v1/timetable/versions/{id}/teacher/{tid} ← Teacher view
GET    /api/v1/timetable/me/{version_id}             ← Auto-detected
POST   /api/v1/timetable/move                        ← Drag-drop
POST   /api/v1/timetable/classroom-availability
```

---

## WebSocket Events

Connect with Socket.IO to `ws://localhost:8000`:
```js
const socket = io("http://localhost:8000", {
  auth: {
    token: "<access_token>",
    rooms: ["teacher:xxx", "section:yyy"]
  }
});

socket.on("TIMETABLE_UPDATED", (data) => { /* refresh timetable */ });
socket.on("TEACHER_UPDATED",   (data) => { /* refresh teacher list */ });
socket.on("CLASSROOM_UPDATED", (data) => { /* refresh classroom */ });
socket.on("SECTION_UPDATED",   (data) => { /* refresh sections */ });
```

---

## Database Schema Overview

```
users ──────────────── teachers ──── teacher_subject_assignments
     └──────────────── students                │
                                               ▼
departments                         timetable_entries (CENTRAL TABLE)
    └── academic_years                  ├── timeslots
         └── sections                   ├── subjects
              └── batches               ├── classrooms
                                        ├── teachers
subjects ── lecture_frequencies         ├── sections
                                        └── batches
timetable_versions
    └── timetable_entries ── timetable_history
```

**Key design principle:** There is ONE `timetable_entries` table.
All role-based views (teacher, student, admin, classroom) are SQL queries with different WHERE clauses.
Never duplicate data.

---

## Lab Scheduling (Admin-Configurable)

Lab sessions require 2 consecutive slots. Configure per department:

```bash
# Option 1: Morning preference (OR-Tools prioritises slots 0,1,2,3)
PATCH /api/v1/admin/departments/{id}
{ "lab_slot_preference": "morning" }

# Option 2: Afternoon
{ "lab_slot_preference": "afternoon" }

# Option 3: Specific slot indices
{
  "lab_slot_preference": "admin_configured",
  "lab_preferred_slot_indices": "3,4,5"
}
```

---

## XGBoost Model Training

When admins rate generated timetables, feedback is stored in `ml_feedback`.
Train the model:

```bash
# Inside backend container
docker exec -it timetable_backend python -c "
from app.db.database import SessionLocal
from app.models.models import MLFeedback, TimetableEntry, TimetableVersion
from app.services.ai.scorer import TimetableScorer, FEATURE_NAMES
# ... load feedback and train
"
```

Until enough feedback is collected, the heuristic scorer is used automatically.

---

## Production Deployment

### Environment changes needed:
```bash
ENVIRONMENT=production
SECRET_KEY=<256-bit-random-string>
MSSQL_SA_PASSWORD=<strong-password>
CORS_ORIGINS=["https://yourdomain.com"]
```

### SSL/TLS:
Place certificates in `docker/nginx/certs/` and update `nginx.conf`.

### Scaling:
- Backend: `docker compose up --scale backend=3`
- Redis is required for Socket.IO multi-instance sync (already configured)

---

## Project Structure

```
timetable-system/
├── docker-compose.yml
├── .env.example
├── docker/
│   ├── nginx/nginx.conf
│   └── mssql/init.sql
│
├── backend/
│   ├── app/
│   │   ├── main.py                    ← FastAPI app + Socket.IO mount
│   │   ├── core/
│   │   │   ├── config.py              ← Pydantic settings
│   │   │   └── security.py            ← JWT + bcrypt
│   │   ├── db/
│   │   │   ├── database.py            ← SQLAlchemy engine
│   │   │   ├── seed.py                ← Initial data
│   │   │   └── repositories/
│   │   │       └── repositories.py    ← All repository classes
│   │   ├── models/
│   │   │   └── models.py              ← All ORM models (MSSQL schema)
│   │   ├── schemas/
│   │   │   └── schemas.py             ← Pydantic request/response
│   │   ├── api/v1/
│   │   │   ├── deps/dependencies.py   ← Auth guards, DI
│   │   │   └── endpoints/
│   │   │       ├── auth.py            ← Login/signup/refresh
│   │   │       ├── admin.py           ← All admin CRUD
│   │   │       └── timetable.py       ← Timetable views + moves
│   │   └── services/
│   │       ├── timetable_service.py   ← Generation + move logic
│   │       ├── realtime.py            ← Socket.IO service
│   │       └── ai/
│   │           ├── solver.py          ← OR-Tools CP-SAT
│   │           └── scorer.py         ← XGBoost ranker
│   ├── alembic/
│   └── requirements.txt
│
└── frontend/
    └── src/
        ├── api/index.ts               ← Axios + all API calls
        ├── store/authStore.ts         ← Zustand auth state
        ├── hooks/useSocket.ts         ← Socket.IO hook
        ├── types/index.ts             ← All TypeScript types
        ├── router.tsx                 ← Protected routes
        ├── components/
        │   ├── shared/TimetableGrid.tsx ← Drag-drop grid
        │   ├── ui/index.tsx           ← Design system components
        │   └── admin/AdminLayout.tsx  ← ERP sidebar layout
        └── pages/
            ├── auth/LoginPage.tsx
            ├── admin/AdminDashboard.tsx
            ├── admin/AdminTimetablePage.tsx
            ├── teacher/TeacherDashboard.tsx
            └── student/StudentDashboard.tsx
```

---

## Troubleshooting

**MSSQL connection refused:**
```bash
docker compose logs mssql
# Wait for "SQL Server is now ready for client connections" then restart backend
docker compose restart backend
```

**OR-Tools solver timeout:**
- Increase `OR_TOOLS_TIME_LIMIT_SECONDS` in `.env`
- Reduce `num_candidates` in the generate request
- Check that all teacher assignments exist for each subject/section/batch

**WebSocket not connecting:**
- Ensure CORS_ORIGINS includes your frontend URL
- Check that Redis is running: `docker compose ps redis`

**Alembic migration errors:**
```bash
docker exec -it timetable_backend alembic downgrade base
docker exec -it timetable_backend alembic upgrade head
```
