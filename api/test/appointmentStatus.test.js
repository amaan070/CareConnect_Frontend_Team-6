// Tests for PATCH /api/appointments/:id/status.
// Only WAITING -> IN_CONSULTATION -> DISCHARGED is allowed. Everything else
// must be refused and must not touch the data.
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { installFakePool, startApp } = require("./helpers");

const fake = installFakePool();
const statusRouter = require("../routes/appointmentStatus");

let app;
before(async () => {
    app = await startApp("/api/appointments", statusRouter);
});
after(async () => {
    await app.close();
});
beforeEach(() => fake.reset());

// Fake database: the appointment currently has status `current`
// (or does not exist when `current` is null).
function appointmentIs(current) {
    return (sql, params) => {
        if (sql.startsWith("SELECT id, status")) {
            return { rows: current ? [{ id: "a1", status: current }] : [] };
        }
        if (sql.startsWith("UPDATE appointments")) {
            return { rows: [{ id: "a1", status: params[0] }] };
        }
        return { rows: [] }; // BEGIN / COMMIT / ROLLBACK
    };
}

const patch = (status) =>
    app.request("PATCH", "/api/appointments/a1/status", status === undefined ? {} : { status });

test("allowed transitions update the status", async () => {
    const allowed = [
        ["WAITING", "IN_CONSULTATION"],
        ["IN_CONSULTATION", "DISCHARGED"]
    ];

    for (const [from, to] of allowed) {
        fake.reset();
        fake.state.handler = appointmentIs(from);

        const res = await patch(to);

        assert.equal(res.status, 200, `${from} -> ${to}`);
        assert.equal(res.body.appointment.status, to);
        assert.ok(fake.calls.some((c) => c.startsWith("UPDATE appointments")));
    }
});

test("skipping, going backwards or repeating a status is refused and nothing is updated", async () => {
    const refused = [
        ["WAITING", "DISCHARGED"],          // skips a step
        ["IN_CONSULTATION", "WAITING"],     // backwards
        ["DISCHARGED", "WAITING"],          // finished appointments are final
        ["DISCHARGED", "IN_CONSULTATION"],
        ["WAITING", "WAITING"]              // no-op
    ];

    for (const [from, to] of refused) {
        fake.reset();
        fake.state.handler = appointmentIs(from);

        const res = await patch(to);

        assert.equal(res.status, 400, `${from} -> ${to}`);
        assert.match(res.body.error, /Invalid status transition/);
        assert.ok(
            !fake.calls.some((c) => c.startsWith("UPDATE appointments")),
            `${from} -> ${to} must not write`
        );
    }
});

test("unknown appointment returns 404", async () => {
    fake.state.handler = appointmentIs(null);
    const res = await patch("IN_CONSULTATION");
    assert.equal(res.status, 404);
});

test("missing status returns 400", async () => {
    fake.state.handler = appointmentIs("WAITING");
    const res = await patch(undefined);
    assert.equal(res.status, 400);
});
