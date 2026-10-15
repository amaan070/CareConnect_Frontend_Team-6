-- Database-level tests. Run against a seeded database:
--
--   psql -h localhost -U admin -d CareConnect -v ON_ERROR_STOP=1 -f sql/tests/audit_and_booking_db_test.sql
--
-- Everything runs inside one transaction that is rolled back at the end, so no
-- test data is left behind. Each check prints "PASS: ..." (via NOTICE) or stops
-- the script with "FAIL: ...".

BEGIN;

DO $$
DECLARE
    pid        UUID;
    clinic     UUID;
    bal        NUMERIC;
    audit_rows INT;
BEGIN
    SELECT id INTO clinic FROM clinics WHERE is_accepting_patients LIMIT 1;
    IF clinic IS NULL THEN
        RAISE EXCEPTION 'FAIL: no accepting clinic found - seed the database first';
    END IF;

    INSERT INTO patients (name, hsa_balance) VALUES ('__db_test_patient__', 100.00)
    RETURNING id INTO pid;

    ----------------------------------------------------------------
    -- 1. Balance trigger writes one signed audit row
    ----------------------------------------------------------------
    UPDATE patients SET hsa_balance = 60.00 WHERE id = pid;

    SELECT count(*) INTO audit_rows
    FROM wallet_audit_logs
    WHERE patient_id = pid
      AND action_type = 'DEDUCTION'
      AND amount_changed = -40.00
      AND balance_after = 60.00;

    IF audit_rows <> 1 THEN
        RAISE EXCEPTION 'FAIL: balance change did not create exactly one signed DEDUCTION audit row';
    END IF;
    RAISE NOTICE 'PASS: balance change is logged as a signed DEDUCTION';

    ----------------------------------------------------------------
    -- 2. Audit table is append-only
    ----------------------------------------------------------------
    BEGIN
        UPDATE wallet_audit_logs SET amount_changed = 0 WHERE patient_id = pid;
        RAISE EXCEPTION 'FAIL: UPDATE on wallet_audit_logs was allowed';
    EXCEPTION WHEN restrict_violation THEN
        RAISE NOTICE 'PASS: UPDATE on wallet_audit_logs is blocked';
    END;

    BEGIN
        DELETE FROM wallet_audit_logs WHERE patient_id = pid;
        RAISE EXCEPTION 'FAIL: DELETE on wallet_audit_logs was allowed';
    EXCEPTION WHEN restrict_violation THEN
        RAISE NOTICE 'PASS: DELETE on wallet_audit_logs is blocked';
    END;

    BEGIN
        TRUNCATE wallet_audit_logs;
        RAISE EXCEPTION 'FAIL: TRUNCATE on wallet_audit_logs was allowed';
    EXCEPTION WHEN restrict_violation THEN
        RAISE NOTICE 'PASS: TRUNCATE on wallet_audit_logs is blocked';
    END;

    ----------------------------------------------------------------
    -- 3. Deleting a patient must not erase their audit history
    ----------------------------------------------------------------
    BEGIN
        DELETE FROM patients WHERE id = pid;
        RAISE EXCEPTION 'FAIL: patient with audit history was deleted';
    EXCEPTION WHEN restrict_violation OR foreign_key_violation THEN
        RAISE NOTICE 'PASS: patient with audit history cannot be deleted';
    END;

    ----------------------------------------------------------------
    -- 4. book_appointment: insufficient balance changes nothing
    ----------------------------------------------------------------
    BEGIN
        CALL book_appointment(pid, clinic, 500.00);   -- balance is only 60
        RAISE EXCEPTION 'FAIL: booking with insufficient balance succeeded';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM NOT LIKE 'Insufficient HSA balance%' THEN
            RAISE EXCEPTION 'FAIL: unexpected error for insufficient balance: %', SQLERRM;
        END IF;
        RAISE NOTICE 'PASS: insufficient balance is rejected with a readable message';
    END;

    SELECT hsa_balance INTO bal FROM patients WHERE id = pid;
    IF bal <> 60.00 THEN
        RAISE EXCEPTION 'FAIL: balance changed to % after a rejected booking', bal;
    END IF;
    IF EXISTS (SELECT 1 FROM appointments WHERE patient_id = pid) THEN
        RAISE EXCEPTION 'FAIL: an appointment was created by a rejected booking';
    END IF;
    RAISE NOTICE 'PASS: rejected booking left balance and appointments untouched';

    ----------------------------------------------------------------
    -- 5. book_appointment: success deducts once and creates a WAITING row
    ----------------------------------------------------------------
    CALL book_appointment(pid, clinic, 25.00);

    SELECT hsa_balance INTO bal FROM patients WHERE id = pid;
    IF bal <> 35.00 THEN
        RAISE EXCEPTION 'FAIL: expected balance 35.00 after booking, got %', bal;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM appointments WHERE patient_id = pid AND status = 'WAITING'
    ) THEN
        RAISE EXCEPTION 'FAIL: booking did not create a WAITING appointment';
    END IF;
    RAISE NOTICE 'PASS: successful booking deducts the copay and creates a WAITING appointment';

    ----------------------------------------------------------------
    -- 6. One active appointment per patient (partial unique index)
    ----------------------------------------------------------------
    BEGIN
        CALL book_appointment(pid, clinic, 5.00);
        RAISE EXCEPTION 'FAIL: second active appointment was allowed';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'PASS: second active appointment is blocked by idx_active_consult';
    END;

    -- ... and a new booking is allowed again once the first one is discharged
    UPDATE appointments SET status = 'DISCHARGED' WHERE patient_id = pid;
    CALL book_appointment(pid, clinic, 5.00);
    RAISE NOTICE 'PASS: patient can book again after being discharged';
END
$$;

ROLLBACK;
