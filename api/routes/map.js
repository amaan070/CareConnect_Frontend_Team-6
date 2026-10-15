const express = require("express");
const { getMongoDb } = require("../mongo");

const router = express.Router();

const RADIUS_METERS = 5000;

// GET /api/map/nearest-nurses?latitude=..&longitude=..&limit=..
//
// Uses a MongoDB $geoNear stage (backed by the 2dsphere index on
// NursePings.location) so the database does the radius filtering and distance
// calculation. Only active pings inside the 5 km radius are read, instead of
// scanning and sorting every ping in the collection.
//
// Each nurse is returned once, using their most recent active ping inside the
// radius. Results are sorted nearest-first.
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

        const nurses = await collection.aggregate([
            {
                // Must be the first stage of the pipeline.
                // GeoJSON order is [longitude, latitude].
                $geoNear: {
                    near: {
                        type: "Point",
                        coordinates: [longitude, latitude]
                    },
                    distanceField: "distance_meters",
                    maxDistance: RADIUS_METERS,
                    spherical: true,
                    query: { is_active: true },
                    key: "location"
                }
            },
            // Keep only the newest ping per nurse within the radius.
            { $sort: { created_at: -1 } },
            {
                $group: {
                    _id: "$nurse_id",
                    nurse_id: { $first: "$nurse_id" },
                    location: { $first: "$location" },
                    created_at: { $first: "$created_at" },
                    distance_meters: { $first: "$distance_meters" }
                }
            },
            { $sort: { distance_meters: 1 } },
            { $limit: limit },
            {
                $project: {
                    _id: 0,
                    nurse_id: 1,
                    location: 1,
                    created_at: 1,
                    distance_meters: { $round: ["$distance_meters", 1] }
                }
            }
        ]).toArray();

        res.json({
            origin: { latitude, longitude },
            radius_meters: RADIUS_METERS,
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
