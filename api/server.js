
const express = require("express");
const cors = require("cors");
const pool = require("./db");
const { connectMongo } = require("./mongo");

const patientsRouter = require("./routes/patients");
const clinicsRouter = require("./routes/clinics");
const appointmentsRouter = require("./routes/appointments");
const bookingsRouter = require("./routes/bookings");
const appointmentStatusRouter = require("./routes/appointmentStatus");
const auditLogsRouter = require("./routes/auditLogs");
const analyticsRouter = require("./routes/analytics");
const reviewsRouter = require("./routes/reviews");
const mapRouter = require("./routes/map");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/patients", patientsRouter);
app.use("/api/clinics", clinicsRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/appointments", appointmentStatusRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/audit-logs", auditLogsRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/map", mapRouter);
app.get("/", (req, res) => {
    res.json({ message: "CareConnect API is running" });
});

app.get("/api/test-db", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT COUNT(*) FROM patients"
        );

        res.json({
            patients: result.rows[0].count
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Database connection failed"
        });
    }
});

app.get("/api/test-mongo", async (req, res) => {
    try {
        const db = await connectMongo();
        const collections = await db.listCollections().toArray();

        res.json({
            connected: true,
            database: "careconnect",
            collections: collections.map(c => c.name)
        });
    } catch (error) {
        console.error("MongoDB connection error:", error);
        res.status(500).json({
            connected: false,
            error: "MongoDB connection failed"
        });
    }
});

const PORT = 5000;

async function startServer() {
    try {
        await connectMongo();

        app.listen(PORT, () => {
            console.log(
                `Server running on http://localhost:${PORT}`
            );
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}

startServer();
