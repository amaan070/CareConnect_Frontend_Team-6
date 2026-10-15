# CareConnect – Handover Note

**Scope:** comparison of the original backend (`CareConnect_team_13-main`) with our updated version (`13_a1`).
**Method:** file-by-file diff and code review. We did not run either version end to end, so "worked / did not work" below reflects what the code shows, not observed runtime behaviour.

## What worked
- **Schema design:** sensible constraints (`hsa_balance >= 0`, coordinate range checks) and a partial unique index (`idx_active_consult`) that enforces one active appointment per patient.
- **`book_appointment` procedure:** locks the patient row (`FOR UPDATE`), then checks the clinic and balance before deducting. This is safe against concurrent double-spend.
- **Analytics layer:** indexes, materialized view and window queries were sound and needed no changes.
- **MongoDB layer:** collection validation, `2dsphere` index and the TTL index on `NursePings` are well documented in `mongo/01_collections_and_indexes.js`.
- **Seeders:** generate realistic volume (100k appointments, 500k nurse pings) with exact status counts.

## What did not work (or was risky)
- `wallet_audit_logs` could be edited or deleted, and `ON DELETE CASCADE` meant deleting a patient silently erased their audit history.
- The Postgres seeder was not re-runnable: running it twice stacked duplicate data.
- The seeder writes audit rows (`APPOINTMENT_DEDUCTION`, negative amount) in a different form from the trigger's rows (`DEDUCTION`).
- The 2-hour TTL on `NursePings` means seeded nurses disappear after two hours, which looks like a bug when demoing a few hours after seeding.
- The seeder contained a `<your_password>` placeholder default, which made a hardcoded password easy to introduce.

## What we changed and why
| File | Change | Reason |
|---|---|---|
| `sql/03_triggers_and_audit.sql` | Trigger now fires only on `UPDATE OF hsa_balance` when the value actually changes; `amount_changed` stored as `ABS(...)` | Avoid needless trigger calls; record a magnitude with `action_type` giving direction |
| `sql/03_triggers_and_audit.sql` | Added `fn_protect_wallet_audit()` with row-level (UPDATE/DELETE) and TRUNCATE triggers | Make the audit trail append-only |
| `sql/01_schema_ddl.sql` | `wallet_audit_logs.patient_id` changed to `ON DELETE RESTRICT` | Audit history must not vanish with a patient |
| `data_generation/postgres_seeder.py` | Wipes existing data before seeding (temporarily disables the audit protection trigger) | Seeder can now be re-run safely |
| `README.md` | Added final commit hash | Submission traceability |

**Trade-off to be aware of:** storing `ABS(amount)` loses the sign, so any query that sums `amount_changed` (for example a running balance in an API) must sign it by `action_type`.

## Suggestions for the original authors
1. **Be consistent about audit rows.** Make the seeder write the same `action_type` and amount convention as the trigger, and decide once whether `amount_changed` is signed.
2. **Keep credentials out of source.** Read the DSN only from `PG_DSN`, never hardcode a password, and add a `.env.example`.
3. **Provide a migration** (`ALTER TABLE ... DROP/ADD CONSTRAINT`, re-run triggers) because `CREATE TABLE IF NOT EXISTS` will not update an existing database.
4. **Document the TTL** and offer a nurses-only reseed option for demos.
5. **Index for the nearest-nurse query** (`nurse_id, created_at`) and consider `$geoNear` instead of sorting and grouping all pings.
6. **Add `start` and `seed` npm scripts** and a short setup section in the README.
