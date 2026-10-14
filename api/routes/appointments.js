const express = require("express");
const pool = require("../db");

const router = express.Router();

// Get appointments with pagination
router.get("/", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const status = req.query.status || "";
        const search = req.query.search || "";

        const offset = (page - 1) * limit;

        const result = await pool.query(
            `SELECT
                a.id,
                a.patient_id,
                p.name AS patient_name,
                a.clinic_id,
                c.name AS clinic_name,
                a.copay_amount,
                a.status,
                a.created_at
             FROM appointments a
             JOIN patients p
                ON a.patient_id = p.id
             JOIN clinics c
                ON a.clinic_id = c.id
             WHERE
                ($1 = '' OR a.status::text = $1)
                AND
                (
                    p.name ILIKE $2
                    OR c.name ILIKE $2
                )
             ORDER BY a.created_at DESC
             LIMIT $3 OFFSET $4`,
            [
                status,
                `%${search}%`,
                limit,
                offset
            ]
        );

        const countResult = await pool.query(
            `SELECT COUNT(*)
             FROM appointments a
             JOIN patients p
                ON a.patient_id = p.id
             JOIN clinics c
                ON a.clinic_id = c.id
             WHERE
                ($1 = '' OR a.status::text = $1)
                AND
                (
                    p.name ILIKE $2
                    OR c.name ILIKE $2
                )`,
            [
                status,
                `%${search}%`
            ]
        );

        const total = parseInt(countResult.rows[0].count);

        res.json({
            appointments: result.rows,
            page: page,
            limit: limit,
            total: total,
            totalPages: Math.ceil(total / limit)
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Failed to fetch appointments"
        });
    }
});


// Get one appointment
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `SELECT
                a.id,
                a.patient_id,
                p.name AS patient_name,
                a.clinic_id,
                c.name AS clinic_name,
                a.copay_amount,
                a.status,
                a.created_at
             FROM appointments a
             JOIN patients p
                ON a.patient_id = p.id
             JOIN clinics c
                ON a.clinic_id = c.id
             WHERE a.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Appointment not found"
            });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Failed to fetch appointment"
        });
    }
});


module.exports = router;