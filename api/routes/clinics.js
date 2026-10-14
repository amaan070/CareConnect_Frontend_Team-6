const express = require("express");
const pool = require("../db");

const router = express.Router();

// Get clinics with pagination and search
router.get("/", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || "";

        const offset = (page - 1) * limit;

        const result = await pool.query(
            `SELECT
                id,
                name,
                latitude,
                longitude,
                is_accepting_patients
             FROM clinics
             WHERE name ILIKE $1
             ORDER BY name
             LIMIT $2 OFFSET $3`,
            [`%${search}%`, limit, offset]
        );

        const countResult = await pool.query(
            `SELECT COUNT(*)
             FROM clinics
             WHERE name ILIKE $1`,
            [`%${search}%`]
        );

        const total = parseInt(countResult.rows[0].count);

        res.json({
            clinics: result.rows,
            page: page,
            limit: limit,
            total: total,
            totalPages: Math.ceil(total / limit)
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Failed to fetch clinics"
        });
    }
});


// Get one clinic
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `SELECT
                id,
                name,
                latitude,
                longitude,
                is_accepting_patients
             FROM clinics
             WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Clinic not found"
            });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Failed to fetch clinic"
        });
    }
});

module.exports = router;