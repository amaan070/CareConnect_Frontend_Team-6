const express = require("express");
const pool = require("../db");

const router = express.Router();

router.get("/:patientId", async (req, res) => {
    try {
        const { patientId } = req.params;

        const { from, to } = req.query;

        let query = `
            SELECT
                id,
                patient_id,
                amount_changed,
                action_type,
                balance_after,
                timestamp,
                SUM(amount_changed) OVER (
                    ORDER BY timestamp, id
                ) AS running_change
            FROM wallet_audit_logs
            WHERE patient_id = $1
        `;

        const params = [patientId];

        if (from) {
            params.push(from);
            query += ` AND timestamp >= $${params.length}`;
        }

        if (to) {
            params.push(to);
            query += ` AND timestamp <= $${params.length}`;
        }

        query += `
            ORDER BY timestamp ASC, id ASC
        `;

        const result = await pool.query(query, params);

        res.json({
            patient_id: patientId,
            logs: result.rows
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Failed to fetch wallet audit logs"
        });
    }
});

module.exports = router;