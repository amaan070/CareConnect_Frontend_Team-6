# CareConnect – Handover Note

**Audience:** the team that picks this project up next.
**What this covers:** the state of the database layer, API and frontend as we hand them over, and the changes we made on top of the A1 database design.
**How we checked:** by reading the code and running the SQL and Mongo scripts as described in the README. `[FILL: state honestly what you ran end to end and what you did not]`

## What works
- **Schema:** sensible constraints (`hsa_balance >= 0`, coordinate range checks) and a partial unique index `idx_active_consult` that allows only one `WAITING` / `IN_CONSULTATION` appointment per patient.
- **Booking:** the `book_appointment` procedure locks the patient row (`FOR UPDATE`), checks the clinic and the balance, then deducts. The API wraps it in one transaction and returns the HSA balance before and after, plus the audit row. Errors are turned into readable messages (insufficient balance → 400, active appointment already exists → 409).
- **Audit trail:** every balance change is logged by a trigger. The table is now append-only (see below).
- **Analytics:** window-function revenue query (7-row moving average, `DENSE_RANK`) and the `mv_clinic_monthly_discharges` materialized view with a refresh endpoint.
- **MongoDB:** collection validation, a `2dsphere` index and a TTL index on `NursePings`. The nearby-nurses endpoint uses `$geoNear` within 5 km.

## What we changed and why
| File | Change | Reason |
|---|---|---|
| `sql/03_triggers_and_audit.sql` | Balance trigger now fires only on `UPDATE OF hsa_balance` and logs only when the value changes | Avoid needless trigger calls |
| `sql/03_triggers_and_audit.sql` | Added `fn_protect_wallet_audit()` with a row-level trigger (UPDATE/DELETE) and a TRUNCATE trigger on `wallet_audit_logs` | Make the audit trail append-only; inserts are still allowed |
| `sql/01_schema_ddl.sql` | `wallet_audit_logs.patient_id` changed from `ON DELETE CASCADE` to `ON DELETE RESTRICT` | Deleting a patient must not erase their audit history |
| `api/routes/map.js` | Nearby nurses now use a `$geoNear` stage instead of grouping all pings and computing distance in JavaScript | Let the database use the geospatial index and read only pings inside the radius |
| `README.md` | Rewritten for A1b (setup for API and web, team and submission details) | Submission traceability |

**Sign convention:** `amount_changed` is stored **signed** (`new balance − old balance`) and `action_type` (`DEDUCTION` / `CREDIT`) repeats the direction. A running total is therefore a plain `SUM(amount_changed)`.

**Note on the audit protection:** the triggers stop normal application and user access. A database superuser or table owner can still disable them (`ALTER TABLE ... DISABLE TRIGGER`), so this is protection against mistakes and misuse, not against a malicious DBA.

## Known issues and limitations
- **Seeder and trigger use different `action_type` values.** The trigger writes `DEDUCTION` / `CREDIT`; the seeder writes `APPOINTMENT_DEDUCTION` for its generated rows. Both are valid for the column, but queries that filter on `action_type` must handle both. Not changed yet.
- **The Postgres seeder is not re-runnable.** It only inserts. Run it on a fresh database, or drop and recreate the database first. (`TRUNCATE` and `DELETE` on `wallet_audit_logs` are now blocked by design.)
- **Existing databases need a migration.** `CREATE TABLE IF NOT EXISTS` does not change an existing table. On a database created before this change, re-create it from `sql/01` to `sql/05`, or run `ALTER TABLE wallet_audit_logs DROP CONSTRAINT wallet_audit_logs_patient_id_fkey, ADD CONSTRAINT wallet_audit_logs_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT;` and then re-run `sql/03_triggers_and_audit.sql`.
- **Nurse pings expire after 2 hours (TTL).** Seeded nurses disappear after two hours, so re-run `mongo_seeder.py` shortly before a demo.
- **Seeder DSN placeholder.** `postgres_seeder.py` falls back to a placeholder password if `PG_DSN` is not set. Always set `PG_DSN` from the environment and never commit a real password.
- **Audit endpoint has no pagination.** `GET /api/audit-logs/:patientId` returns all rows for the patient.

## Suggestions for whoever continues
1. Make the seeder write the same `action_type` as the trigger.
2. Add a `.env.example` for the API and `start` / `seed` npm scripts.
3. Add pagination to the audit endpoint and a way to create a new nurse ping for demos.
4. Add automated tests for booking (insufficient balance, duplicate active appointment) and for the append-only audit triggers.
