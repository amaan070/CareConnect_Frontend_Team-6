# CareConnect — On-Demand Telemedicine (Project 4)

CS6.302 Software System Development — Assignment 1b (Frontend + API on top of the A1 databases)

| | |
|---|---|
| **Team number** | `TEAM 06` |
| **Repository** | `https://github.com/amaan070/CareConnect_Frontend_Team-6` |
| **Final commit hash** | `` |
| **Demo video (≤ 5 min)** | `https://drive.google.com/file/d/1-aRV-R6TcWybbtl23oxVzNaSsfdIJ5yi/view?usp=sharing` |
| **A1 repository we built on** | `https://github.com/Lockstyles/CareConnect_team_13` |

## Team and contributions

| Member | Roll no. | Contribution |
|---|---|---|
| `Amaan Ahmad` | `2026201032` | MongoDB layer — `api/mongo.js` connection, nearby nurses route (`$geoNear`, 5 km, newest ping per nurse) and Leaflet map screen with 10 s polling, reviews analytics (`$facet`) and medical catalog routes/screens, Mongo seeding and `executionStats` performance evidence |
| `Dhruv Bhuva` | `2026201036` | Booking and appointment workflow — booking transaction route (`FOR UPDATE` lock, HSA before/after, `P0001`/`23505` error mapping), Book Appointment screen, appointment status route (WAITING → IN_CONSULTATION → DISCHARGED), API tests (`booking.test.js`, `appointmentStatus.test.js`, test helpers) |
| `Antariksha Jana` | `2026202018` | Frontend shell and design — React + Vite app structure, actor switcher, error boundary and loading/empty/error state views, styling, all 8 wireframes and API sketches, design README, main README |
| `Nikhilesh Patil` | `2026201010` | Postgres browse and analytics — patients, clinics and appointments routes and screens (pagination, search, detail), audit trail route and screen (date filter, running balance), analytics routes and screen (7-day moving average, `DENSE_RANK`, materialized view refresh), `EXPLAIN ANALYZE` evidence, API endpoint doc, handover note, demo video |
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

Follow the steps in order. Every command says which folder to run it from. "Project root" is the folder that contains `api/`, `web/`, `sql/` and `mongo/`.

Commands are given for **macOS / Linux (bash)** and **Windows (PowerShell)** where they differ.

### 2.1 Prerequisites

| Tool | Version | Check with |
|---|---|---|
| PostgreSQL (with `psql`) | 16 | `psql --version` |
| MongoDB Community Server and `mongosh` | 7 | `mongosh --version` |
| Node.js and npm | 20 or newer | `node --version` |
| Python | 3.10 or newer | `python --version` (`python3` on macOS/Linux) |

Both database servers must be running. If a command says `psql` or `mongosh` is not recognised, add its `bin` folder to your PATH.

To avoid typing the Postgres password for every `psql` command, set it once in your terminal:

```bash
# macOS / Linux
export PGPASSWORD='<your-password>'
```
```powershell
# Windows PowerShell
$env:PGPASSWORD = "<your-password>"
```

These variables only last for the current terminal window. Use your own password wherever `<your-password>` appears, without the angle brackets.

### 2.2 Create the Postgres user and database

From any folder (use `psql -U postgres -d postgres`, or `sudo -u postgres psql` on Ubuntu, if `psql postgres` does not work):

```bash
psql postgres
```
```sql
CREATE USER admin WITH PASSWORD '<your-password>';
CREATE DATABASE "CareConnect" OWNER admin;
\q
```

### 2.3 Create the Postgres schema (project root)

Run the files in this order:

```bash
psql -h localhost -U admin -d CareConnect -f sql/01_schema_ddl.sql
psql -h localhost -U admin -d CareConnect -f sql/02_indexes.sql
psql -h localhost -U admin -d CareConnect -f sql/03_triggers_and_audit.sql
psql -h localhost -U admin -d CareConnect -f sql/04_stored_procedures.sql
psql -h localhost -U admin -d CareConnect -f sql/05_materialized_views.sql
```

`sql/06_window_analytics.sql` is the standalone window-analytics query from A1. The app does not need it.

### 2.4 Create the MongoDB collections and indexes (project root)

```bash
mongosh careconnect mongo/01_collections_and_indexes.js
```

`mongo/02_workflow3_geonear.js` and `mongo/03_workflow4_facet.js` are the A1 query scripts. The app does not need them.

### 2.5 Seed the data

```bash
cd data_generation
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

export PG_DSN='dbname=CareConnect user=admin password=<your-password> host=localhost port=5432'
export MONGO_URI='mongodb://localhost:27017'
export MONGO_DB_NAME='careconnect'

python postgres_seeder.py
python mongo_seeder.py
cd ..
```

```powershell
# Windows PowerShell
cd data_generation
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

$env:PG_DSN = "dbname=CareConnect user=admin password=<your-password> host=localhost port=5432"
$env:MONGO_URI = "mongodb://localhost:27017"
$env:MONGO_DB_NAME = "careconnect"

python postgres_seeder.py
python mongo_seeder.py
cd ..
```

If PowerShell refuses to activate the virtual environment, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once and try again. The seeders can take a few minutes.

This creates about 100 clinics, 5,000 patients, 100,000 appointments and 100,000 audit rows in Postgres, and 500,000 nurse pings, 5,000 reviews and 200 catalog entries in MongoDB.

### 2.6 Refresh the materialized view (project root)

The view was created while the tables were still empty, so refresh it once after seeding. Without this, the monthly discharges chart is empty.

```bash
psql -h localhost -U admin -d CareConnect -c "REFRESH MATERIALIZED VIEW mv_clinic_monthly_discharges;"
```

(The Refresh button on the Analytics page does the same thing later.)

### 2.7 Check that the data loaded (project root)

```bash
psql -h localhost -U admin -d CareConnect -c "SELECT (SELECT count(*) FROM patients) AS patients, (SELECT count(*) FROM appointments) AS appointments, (SELECT count(*) FROM wallet_audit_logs) AS audit_rows;"
mongosh careconnect --quiet --eval "printjson({pings: db.NursePings.countDocuments(), reviews: db.PatientReviews.countDocuments(), catalogs: db.MedicalCatalogs.countDocuments()})"
```

You should see roughly 5000 patients, 100000 appointments and 100000 audit rows, then 500000 pings, 5000 reviews and 200 catalogs.

> **Nurse pings expire after 2 hours** (TTL index). If the map is empty later, re-seed MongoDB. The Mongo seeder only inserts and never clears, so empty the three collections first, otherwise reviews and catalog entries are duplicated. From the project root:
>
> ```bash
> mongosh careconnect --eval "db.NursePings.deleteMany({}); db.PatientReviews.deleteMany({}); db.MedicalCatalogs.deleteMany({})"
> ```
>
> Then run `python mongo_seeder.py` again from `data_generation/` with the virtual environment active and the variables above set.

### 2.8 Start the API (`api/` folder)

Copy `api/.env.example` to `api/.env` and put your password in it:

```bash
cd api
cp .env.example .env        # Windows PowerShell: copy .env.example .env
```

Edit `.env` so that `PG_PASSWORD` is your Postgres password, then:

```bash
npm install
npm start                   # same as: node server.js
```

The API listens on http://localhost:5000. Check it: open http://localhost:5000/api/test-db and http://localhost:5000/api/test-mongo in a browser. Both should return a success message. Leave this terminal running.

### 2.9 Start the frontend (`web/` folder, new terminal)

```bash
cd web
npm install
npm run dev
```

Open the address it prints (normally http://localhost:5173). The frontend calls the API at `http://localhost:5000`, so the API must already be running.

**Trying a booking:** the seed data gives every one of the 5,000 patients exactly one active appointment (2,500 waiting and 2,500 in consultation). A patient can have only one active appointment, so a new booking is refused with "already has an active appointment" until that appointment is discharged. To try a successful booking, first open the patient's appointment and move it WAITING -> IN_CONSULTATION -> DISCHARGED, then book. Booking for a patient who has not been discharged shows the error case.

### 2.10 Run the tests (`api/` folder, any terminal)

```bash
cd api
npm test
```

The tests use a fake database, so they need no Postgres or MongoDB and can run while the API is running. They need Node 20 or newer. At the end you should see `fail 0`. Lines starting with `Error:` in the output are expected logging from the failure cases being tested.

We test the API layer only. The database layer (schema, triggers, procedures) is inherited from A1 and is not covered by automated tests here.

- `api/test/booking.test.js` - the booking transaction: success (before/after balance, new audit row, commit), insufficient balance (readable 400, rollback), patient with an active appointment (409), unexpected errors (generic 500, no details leaked), unknown patient, bad input, and that the database connection is always released.
- `api/test/appointmentStatus.test.js` - only WAITING -> IN_CONSULTATION -> DISCHARGED is allowed; skipping, going back and repeating are refused without writing.

### 2.11 Start over from scratch

Stop the API first (Ctrl+C), then drop both databases and repeat sections 2.2 to 2.6:

```bash
psql postgres
```
```sql
DROP DATABASE IF EXISTS "CareConnect";
CREATE DATABASE "CareConnect" OWNER admin;
\q
```
```bash
mongosh careconnect --eval "db.dropDatabase()"
```

The Postgres seeder only inserts rows, so run it on a fresh database.

### 2.12 Troubleshooting

| Problem | Fix |
|---|---|
| `ENOENT ... no such file` for a `.sql` or `.js` script | You are in the wrong folder. Run it from the project root. |
| `source` is not recognised (Windows) | Use `venv\Scripts\activate` instead. |
| `export` is not recognised (Windows) | Use `$env:NAME = "value"` instead. |
| `database "CareConnect" is being accessed by other users` | Stop the API (Ctrl+C) and try the drop again. |
| `password authentication failed` | The password in `api/.env`, `PG_DSN` or `PGPASSWORD` does not match the Postgres user. |
| Monthly discharges chart is empty | Run section 2.6. |
| Map shows no nurses | Pings expire after 2 hours. Empty the three Mongo collections and re-run `mongo_seeder.py` (see the note in section 2.7). |
| `permission denied to create extension "uuid-ossp"` | Run `sql/01_schema_ddl.sql` once as the `postgres` user. |
| Port 5000 already in use | Stop the other program using it. The frontend expects port 5000. |
| Frontend loads but shows errors | The API is not running, or `api/.env` is wrong. Check http://localhost:5000/api/test-db. |

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
├── api/            Express API (routes/, test/, db.js, mongo.js, server.js, .env.example)
├── web/            React + Vite frontend
├── sql/            Postgres schema, indexes, triggers, procedures, views
├── mongo/          Collections, indexes, workflow scripts
├── data_generation/  Seeders
├── performance/    EXPLAIN / executionStats evidence
└── docs/           API doc, handover note, wireframes, ERD
```

---

## 7. Known limitations

- The audit trail endpoint returns all rows for a patient (no pagination yet).
- The API base URL is hard-coded to `http://localhost:5000` in the frontend.
- The Postgres seeder is not re-runnable on a populated database; start from a fresh database (section 2.11).
- Automated tests cover the API layer only.
