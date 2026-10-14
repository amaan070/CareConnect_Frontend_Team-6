const express = require("express");
const pool = require("../db");

const router = express.Router();


// Update appointment status
router.patch("/:id/status", async (req, res) => {
    const client = await pool.connect();

    try {
        const { id } = req.params;
        const { status } = req.body;

        // Only these transitions are allowed
        const allowedTransitions = {
            WAITING: "IN_CONSULTATION",
            IN_CONSULTATION: "DISCHARGED"
        };

        if (!status) {
            return res.status(400).json({
                error: "Status is required"
            });
        }

        // Get current appointment
        const result = await client.query(
            `SELECT id, status
             FROM appointments
             WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Appointment not found"
            });
        }

        const currentStatus = result.rows[0].status;

        // Check transition
        if (allowedTransitions[currentStatus] !== status) {
            return res.status(400).json({
                error:
                    `Invalid status transition: ${currentStatus} → ${status}`
            });
        }

        await client.query("BEGIN");

        const updateResult = await client.query(
            `UPDATE appointments
             SET status = $1
             WHERE id = $2
             RETURNING id, patient_id, clinic_id, copay_amount, status, created_at`,
            [status, id]
        );

        await client.query("COMMIT");

        res.json({
            message: "Appointment status updated successfully",
            appointment: updateResult.rows[0]
        });

    } catch (error) {

        await client.query("ROLLBACK");

        console.error(error);

        res.status(500).json({
            error: "Failed to update appointment status"
        });

    } finally {
        client.release();
    }
});


module.exports = router;