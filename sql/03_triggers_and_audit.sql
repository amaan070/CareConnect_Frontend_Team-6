-- ---------------------------------------------------------------
-- 1. Record every HSA balance change in wallet_audit_logs
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_hsa_balance_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.hsa_balance IS DISTINCT FROM OLD.hsa_balance THEN
        INSERT INTO wallet_audit_logs (patient_id, amount_changed, action_type, balance_after, "timestamp")
        VALUES (
            NEW.id,
            NEW.hsa_balance - OLD.hsa_balance,      -- signed amount
            CASE
                WHEN NEW.hsa_balance < OLD.hsa_balance THEN 'DEDUCTION'
                ELSE 'CREDIT'
            END,
            NEW.hsa_balance,
            now()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_hsa_balance_change ON patients;

-- Only fires when the balance column is part of the UPDATE.
CREATE TRIGGER trg_log_hsa_balance_change
    AFTER UPDATE OF hsa_balance ON patients
    FOR EACH ROW
    EXECUTE FUNCTION log_hsa_balance_change();


-- ---------------------------------------------------------------
-- 2. Make wallet_audit_logs append-only
--    INSERT is still allowed (the trigger above needs it).
--    UPDATE, DELETE and TRUNCATE are rejected.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_protect_wallet_audit()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'wallet_audit_logs is append-only: % is not allowed', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wallet_audit_no_update_delete ON wallet_audit_logs;
CREATE TRIGGER trg_wallet_audit_no_update_delete
    BEFORE UPDATE OR DELETE ON wallet_audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION fn_protect_wallet_audit();

DROP TRIGGER IF EXISTS trg_wallet_audit_no_truncate ON wallet_audit_logs;
CREATE TRIGGER trg_wallet_audit_no_truncate
    BEFORE TRUNCATE ON wallet_audit_logs
    FOR EACH STATEMENT
    EXECUTE FUNCTION fn_protect_wallet_audit();
