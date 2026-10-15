# CareConnect — On-Demand Telemedicine (Project 4)

CS6.302 Software System Development — Assignment 1b (Frontend + API on top of the A1 databases)

| | |
|---|---|
| **Team number** | `[FILL: team number]` |
| **Repository** | `[FILL: repo URL]` |
| **Final commit hash** | `[FILL: output of git rev-parse HEAD]` |
| **Demo video (≤ 5 min)** | `[FILL: link]` |
| **A1 repository we built on** | `[FILL: A1 repo URL / team]` |

## Team and contributions

| Member | Roll no. | Contribution |
|---|---|---|
| `[FILL]` | `[FILL]` | `[FILL: e.g. Postgres routes — patients, clinics, appointments, booking]` |
| `[FILL]` | `[FILL]` | `[FILL: e.g. Analytics screens, materialized view refresh]` |
| `[FILL]` | `[FILL]` | `[FILL: e.g. MongoDB routes — map ($geoNear), reviews ($facet)]` |
| `[FILL]` | `[FILL]` | `[FILL: e.g. Wireframes, API doc, design system, demo video]` |

---

## 1. Overview

CareConnect has two databases and a thin web layer on top:

- **PostgreSQL** — patients, clinics, appointments and the wallet audit trail (transactional data).
- **MongoDB** — medical catalogs, patient reviews and nurse location pings (flexible, geospatial data).
- **`api/`** — Node.js + Express REST API talking to both databases (port 5000).
- **`web/`** — React + Vite frontend (Leaflet for the map).

### Screens

| Screen | Data source |
|---|---|
| Patients, Clinics, Appointments (pagination, search, detail) | PostgreSQL |
| Book appointment (HSA before/after, friendly errors, new audit row) | PostgreSQL stored procedure `book_appointment` |
| Appointment status updates | PostgreSQL (WAITING → IN_CONSULTATION → DISCHARGED) |
| Audit trail (date filter, running balance) | PostgreSQL `wallet_audit_logs` |
| Analytics (7-day moving average, `DENSE_RANK`, monthly discharges with refresh) | PostgreSQL window functions + materialized view |
| Nearby nurses map (5 km, distance-sorted list, polls every 10 s) | MongoDB `$geoNear` |
| Reviews analytics and medical catalog | MongoDB `$facet` + `MedicalCatalogs` |

---

## 2. Setup

### 2.1 Prerequisites

- PostgreSQL 16, MongoDB 7
- Node.js 20+ and npm
- Python 3.10+ (for the seeders)

### 2.2 Databases

Create the Postgres user and database, then start MongoDB:

```bash
psql postgres
CREATE USER admin WITH PASSWORD '<your-password>';
CREATE DATABASE "CareConnect" OWNER admin;
\q
```

Ubuntu and macOS install steps for both databases are the same as in A1 (`brew install postgresql@16 mongodb-community@7.0`, or the apt packages for Ubuntu).

### 2.3 Schema, indexes, triggers, procedures, views

```bash
psql -h localhost -U admin -d CareConnect -f sql/01_schema_ddl.sql
psql -h localhost -U admin -d CareConnect -f sql/02_indexes.sql
psql -h localhost -U admin -d CareConnect -f sql/03_triggers_and_audit.sql
psql -h localhost -U admin -d CareConnect -f sql/04_stored_procedures.sql
psql -h localhost -U admin -d CareConnect -f sql/05_materialized_views.sql

mongosh careconnect mongo/01_collections_and_indexes.js
```

`sql/06_window_analytics.sql` is the standalone window-analytics query from A1 (not required for the app).

### 2.4 Seed data

```bash
cd data_generation
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

export PG_DSN='dbname=CareConnect user=admin password=<your-password> host=localhost port=5432'
export MONGO_URI='mongodb://localhost:27017'
export MONGO_DB_NAME='careconnect'

python postgres_seeder.py
python mongo_seeder.py
```

Seeds 100 clinics, 5,000 patients, 100,000 appointments and 100,000 audit rows in Postgres, and 500,000 nurse pings, 5,000 reviews and 200 catalog entries in MongoDB.

> **Demo note:** nurse pings have a 2-hour TTL (`expireAfterSeconds: 7200`). If the map is empty, re-run `python mongo_seeder.py` shortly before the demo.

### 2.5 Run the API

Create `api/.env`:

```
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=CareConnect
PG_USER=admin
PG_PASSWORD=<your-password>
MONGODB_URI=mongodb://127.0.0.1:27017
```

```bash
cd api
npm install
node server.js        # http://localhost:5000
```

Health checks: `GET /api/test-db` and `GET /api/test-mongo`.

### 2.6 Run the frontend

```bash
cd web
npm install
npm run dev           # http://localhost:5173
```

The frontend calls the API at `http://localhost:5000`, so start the API first.

---

## 3. Design decisions and assumptions

- **UUID primary keys** (`uuid-ossp`), and `appointments.status` as a Postgres `ENUM`.
- **One active appointment per patient** is enforced by the partial unique index `idx_active_consult` (status `WAITING` or `IN_CONSULTATION`). The booking API turns the resulting `23505` error into "Patient already has an active appointment".
- **Booking** runs in one transaction: it locks the patient row (`FOR UPDATE`), reads the HSA balance, calls `book_appointment`, reads the balance again and returns before/after plus the audit row written by the trigger. Procedure errors (`P0001`, e.g. insufficient balance) are returned as readable 400 messages.
- **Audit trail** is written by a trigger on `patients.hsa_balance`. `amount_changed` is stored signed (`NEW - OLD`), so the running balance column is a plain window `SUM`. Entries are shown newest first.
- **Analytics** — the clinic-revenue endpoint counts the copay of `DISCHARGED` appointments by day, takes a 7-row moving average per clinic and ranks clinics per day with `DENSE_RANK`. The monthly discharge summary reads the materialized view `mv_clinic_monthly_discharges`; the refresh button runs `REFRESH MATERIALIZED VIEW`.
- **Nearby nurses** — `GET /api/map/nearest-nurses` uses a `$geoNear` stage on the `2dsphere` index with `maxDistance: 5000` and `is_active: true`. It returns each nurse once (their newest active ping inside the radius), sorted nearest first. A nurse whose newest ping is outside the radius, or is inactive, is not listed.
- **Actor switcher** — a demo-only role/patient switcher (stored in the browser). It is not real authentication.
- **Seed geography** — clusters around Chennai (lat 12.90–13.20, lon 80.10–80.35).

---

## 4. Performance evidence

- `performance/postgres_explain_analyzes.txt` — `EXPLAIN ANALYZE` of the window analytics query (uses `idx_appointments_clinic_id`, no sequential scan on `appointments`).
- `performance/mongo_execution_stats.json` — `executionStats` for the `$geoNear` and `$facet` workflows.

---

## 5. Documentation

- `docs/api_endpoints.md` — API reference
- `docs/handover_note.md` — handover note
- `docs/design/` — 8 wireframes and API sketches
- `docs/relational_erd.png`, `docs/mongo_schema_map.json` — data model

---

## 6. Repository structure

```
<team_number>_a1b/
├── README.md
├── api/            Express API (routes/, db.js, mongo.js, server.js)
├── web/            React + Vite frontend
├── sql/            Postgres schema, indexes, triggers, procedures, views
├── mongo/          Collections, indexes, workflow scripts
├── data_generation/  Seeders
├── performance/    EXPLAIN / executionStats evidence
└── docs/           API doc, handover note, wireframes, ERD
```

---

## 7. Known limitations

- Run end to end only after completing the setup above; fill in the commit hash and demo link before submitting.
- The audit trail endpoint returns all rows for a patient (no pagination yet).
- The API base URL is hard-coded to `http://localhost:5000` in the frontend.
