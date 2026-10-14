
const express = require("express");
const { getMongoDb } = require("../mongo");

const router = express.Router();

router.get("/nearest-nurses", async (req, res) => {
    try {
        const latitude = Number(req.query.latitude);
        const longitude = Number(req.query.longitude);

        if (
            req.query.latitude === undefined ||
            req.query.longitude === undefined ||
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
        ) {
            return res.status(400).json({
                error: "Provide valid latitude and longitude"
            });
        }

        const parsedLimit = Number.parseInt(req.query.limit, 10);
        const limit = Number.isFinite(parsedLimit)
            ? Math.min(100, Math.max(1, parsedLimit))
            : 20;

        const db = getMongoDb();
        const collection = db.collection("NursePings");

        // Select the globally latest ping for each nurse.
        const latestPings = await collection.aggregate([
            {
                $sort: {
                    nurse_id: 1,
                    created_at: -1
                }
            },
            {
                $group: {
                    _id: "$nurse_id",
                    nurse_id: { $first: "$nurse_id" },
                    location: { $first: "$location" },
                    is_active: { $first: "$is_active" },
                    created_at: { $first: "$created_at" }
                }
            },
            {
                $match: {
                    is_active: true
                }
            }
        ]).toArray();

        // Calculate distance from each latest location.
        // Coordinates are GeoJSON [longitude, latitude].
        const toRadians = (degrees) => degrees * Math.PI / 180;
        const earthRadiusMeters = 6371008.8;

        const distanceMeters = (coordinates) => {
            const [nurseLongitude, nurseLatitude] = coordinates;

            const dLat = toRadians(nurseLatitude - latitude);
            const dLng = toRadians(nurseLongitude - longitude);
            const lat1 = toRadians(latitude);
            const lat2 = toRadians(nurseLatitude);

            const a =
                Math.sin(dLat / 2) ** 2 +
                Math.cos(lat1) *
                Math.cos(lat2) *
                Math.sin(dLng / 2) ** 2;

            return 2 * earthRadiusMeters *
                Math.asin(Math.sqrt(Math.min(1, a)));
        };

        const nurses = latestPings
            .map((nurse) => ({
                nurse_id: nurse.nurse_id,
                location: nurse.location,
                created_at: nurse.created_at,
                distance_meters: distanceMeters(
                    nurse.location.coordinates
                )
            }))
            .filter((nurse) => nurse.distance_meters <= 5000)
            .sort((a, b) => a.distance_meters - b.distance_meters)
            .slice(0, limit)
            .map((nurse) => ({
                ...nurse,
                distance_meters: Math.round(
                    nurse.distance_meters * 10
                ) / 10
            }));

        res.json({
            origin: { latitude, longitude },
            radius_meters: 5000,
            count: nurses.length,
            nurses
        });
    } catch (error) {
        console.error("Nearest nurses error:", error);

        res.status(500).json({
            error: "Failed to find nearby nurses"
        });
    }
});

module.exports = router;
