const express = require("express");
const pool = require("../db");

const router = express.Router();

router.get("/clinic-revenue", async (req, res) => {
    try {
        const result = await pool.query(`
            WITH daily_revenue AS (
                SELECT
                    a.clinic_id,
                    c.name AS clinic_name,
                    DATE(a.created_at) AS revenue_date,
                    SUM(a.copay_amount) AS daily_revenue
                FROM appointments a
                JOIN clinics c
                    ON a.clinic_id = c.id
                WHERE a.status = 'DISCHARGED'
                GROUP BY
                    a.clinic_id,
                    c.name,
                    DATE(a.created_at)
            ),

            moving_average AS (
                SELECT
                    clinic_id,
                    clinic_name,
                    revenue_date,
                    daily_revenue,

                    AVG(daily_revenue) OVER (
                        PARTITION BY clinic_id
                        ORDER BY revenue_date
                        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
                    ) AS moving_7_day_average

                FROM daily_revenue
            ),

            ranked AS (
                SELECT
                    *,
                    DENSE_RANK() OVER (
                        PARTITION BY revenue_date
                        ORDER BY moving_7_day_average DESC
                    ) AS clinic_rank

                FROM moving_average
            )

            SELECT
                clinic_id,
                clinic_name,
                revenue_date,
                daily_revenue,
                moving_7_day_average,
                clinic_rank
            FROM ranked
            ORDER BY revenue_date DESC, clinic_rank;
        `);

        res.json({
            analytics: result.rows
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Failed to fetch clinic revenue analytics"
        });
    }
});

router.get("/discharges", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                clinic_id,
                clinic_name,
                discharge_month,
                total_discharges
            FROM mv_clinic_monthly_discharges
            ORDER BY discharge_month DESC, clinic_name
        `);

        res.json({
            summary: result.rows
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Failed to fetch discharge analytics"
        });
    }
});

router.post("/discharges/refresh", async (req, res) => {
    try {
        await pool.query(
            "REFRESH MATERIALIZED VIEW public.mv_clinic_monthly_discharges"
        );

        res.json({
            message: "Monthly discharge summary refreshed successfully"
        });
    } catch (error) {
        console.error("Discharge refresh error:", error);

        res.status(500).json({
            error: "Failed to refresh materialized view",
            details: error.message
        });
    }
});

module.exports = router;