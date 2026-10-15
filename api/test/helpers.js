// Shared test helpers. No extra dependencies: Node's built-in test runner,
// the built-in fetch (Node 18+) and a fake Postgres pool.
const express = require("express");

// Replace ../db (the real pg Pool) with a fake BEFORE the routers are required,
// so no real database is needed. Each test sets `state.handler` to decide what
// every SQL statement returns (or throws), and `calls` records the SQL that ran.
function installFakePool() {
    const calls = [];
    const state = { handler: () => ({ rows: [] }), released: 0 };

    const client = {
        async query(sql, params) {
            const text = String(sql).replace(/\s+/g, " ").trim();
            calls.push(text);
            return state.handler(text, params);
        },
        release() {
            state.released += 1;
        }
    };

    const pool = {
        connect: async () => client,
        query: (sql, params) => client.query(sql, params)
    };

    const dbPath = require.resolve("../db");
    require.cache[dbPath] = {
        id: dbPath,
        filename: dbPath,
        loaded: true,
        exports: pool
    };

    return {
        calls,
        state,
        reset() {
            calls.length = 0;
            state.released = 0;
            state.handler = () => ({ rows: [] });
        }
    };
}

// Start the router on a random free port and return a small client.
async function startApp(mountPath, router) {
    const app = express();
    app.use(express.json());
    app.use(mountPath, router);

    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });

    const base = `http://127.0.0.1:${server.address().port}`;

    async function request(method, path, body) {
        const response = await fetch(base + path, {
            method,
            headers: { "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        return { status: response.status, body: await response.json() };
    }

    return {
        request,
        close: () => new Promise((resolve) => server.close(resolve))
    };
}

// A Postgres-style error, like the ones the pg driver throws.
function pgError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

module.exports = { installFakePool, startApp, pgError };
