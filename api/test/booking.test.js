// Tests for POST /api/bookings (the transaction form).
//
// The database is faked, so these tests check what the API does with each
// outcome of the stored procedure: the response the user sees, and that the
// transaction is committed or rolled back correctly. The rules that live inside
// Postgres itself (balance check, one active appointment) are part of the
// inherited database layer and are not tested here.
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { installFakePool, startApp, pgError } = require("./helpers");

const fake = installFakePool();
const bookingsRouter = require("../routes/bookings");

const PATIENT = "11111111-1111-1111-1111-111111111111";
const CLINIC = "22222222-2222-2222-2222-222222222222";

let app;
before(async () => {
    app = await startApp("/api/bookings", bookingsRouter);
});
after(async () => {
    await app.close();
});
beforeEach(() => fake.reset());

// Fake database for a booking that works. `callBehaviour` lets a test make the
// stored procedure fail instead.
function bookingHandler({ before = "100.00", after = "60.00", callBehaviour } = {}) {
    let balanceReads = 0;

    return (sql) => {
        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
            return { rows: [] };
        }
        if (sql.startsWith("CALL book_appointment")) {
            if (callBehaviour) return callBehaviour();
            return { rows: [] };
        }
        if (sql.includes("FROM appointments a")) {
            return {
                rows: [{
                    id: "appt-1",
                    patient_id: PATIENT,
                    clinic_id: CLINIC,
                    copay_amount: "40.00",
                    status: "WAITING"
                }]
            };
        }
        if (sql.includes("FROM wallet_audit_logs")) {
            return {
                rows: [{
                    action_type: "DEDUCTION",
                    amount_changed: "-40.00",
                    balance_after: after
                }]
            };
        }
        if (sql.includes("FROM patients")) {
            balanceReads += 1;
            // 1st read = before the booking, 2nd read = after it.
            return { rows: [{ hsa_balance: balanceReads === 1 ? before : after }] };
        }
        throw new Error(`unexpected query: ${sql}`);
    };
}

const validBody = { patient_id: PATIENT, clinic_id: CLINIC, copay_amount: 40 };

test("successful booking returns before/after balance and the new audit row", async () => {
    fake.state.handler = bookingHandler();

    const res = await app.request("POST", "/api/bookings", validBody);

    assert.equal(res.status, 201);
    assert.equal(res.body.hsa.before, "100.00");
    assert.equal(res.body.hsa.after, "60.00");
    assert.equal(res.body.appointment.status, "WAITING");
    assert.equal(res.body.audit_log.action_type, "DEDUCTION");
    assert.equal(res.body.audit_log.balance_after, "60.00");

    // The balance row is locked before it is read, and the work is committed.
    assert.ok(fake.calls.some((c) => c.includes("FOR UPDATE")));
    assert.ok(fake.calls.includes("COMMIT"));
    assert.ok(!fake.calls.includes("ROLLBACK"));
});

test("insufficient balance gives a readable 400 and rolls the transaction back", async () => {
    const message = "Insufficient HSA balance: has 10.00, needs 40.00";
    fake.state.handler = bookingHandler({
        callBehaviour: () => {
            throw pgError("P0001", message);
        }
    });

    const res = await app.request("POST", "/api/bookings", validBody);

    assert.equal(res.status, 400);
    assert.equal(res.body.error, message); // the user sees the real reason
    assert.ok(fake.calls.includes("ROLLBACK"));
    assert.ok(!fake.calls.includes("COMMIT"));
});

test("patient who already has an active appointment gets a 409", async () => {
    // 23505 = unique violation from the partial unique index idx_active_consult
    fake.state.handler = bookingHandler({
        callBehaviour: () => {
            throw pgError("23505", "duplicate key value violates unique constraint");
        }
    });

    const res = await app.request("POST", "/api/bookings", validBody);

    assert.equal(res.status, 409);
    assert.match(res.body.error, /already has an active appointment/i);
    assert.ok(fake.calls.includes("ROLLBACK"));
    assert.ok(!fake.calls.includes("COMMIT"));
});

test("an unexpected database error returns a generic 500 and leaks no details", async () => {
    fake.state.handler = bookingHandler({
        callBehaviour: () => {
            throw pgError("XX000", "relation secret_table does not exist");
        }
    });

    const res = await app.request("POST", "/api/bookings", validBody);

    assert.equal(res.status, 500);
    assert.equal(res.body.error, "Failed to book appointment");
    assert.ok(!JSON.stringify(res.body).includes("secret_table"));
    assert.ok(fake.calls.includes("ROLLBACK"));
});

test("unknown patient returns 404 and never calls the procedure", async () => {
    fake.state.handler = (sql) => {
        if (sql.includes("FROM patients")) return { rows: [] };
        return { rows: [] };
    };

    const res = await app.request("POST", "/api/bookings", validBody);

    assert.equal(res.status, 404);
    assert.ok(!fake.calls.some((c) => c.startsWith("CALL book_appointment")));
});

test("bad input is rejected with 400 before any transaction starts", async () => {
    const missing = await app.request("POST", "/api/bookings", { patient_id: PATIENT });
    assert.equal(missing.status, 400);

    const negative = await app.request("POST", "/api/bookings", {
        ...validBody,
        copay_amount: -5
    });
    assert.equal(negative.status, 400);
    assert.match(negative.body.error, /negative/i);

    assert.ok(!fake.calls.includes("BEGIN"));
});

test("the database connection is always released, on success and on failure", async () => {
    fake.state.handler = bookingHandler();
    await app.request("POST", "/api/bookings", validBody);
    assert.equal(fake.state.released, 1);

    fake.reset();
    fake.state.handler = bookingHandler({
        callBehaviour: () => {
            throw pgError("P0001", "Insufficient HSA balance");
        }
    });
    await app.request("POST", "/api/bookings", validBody);
    assert.equal(fake.state.released, 1); // a leak here would exhaust the pool over time
});
