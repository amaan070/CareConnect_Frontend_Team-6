
const express = require("express");
const { getMongoDb } = require("../mongo");

const router = express.Router();

// Get review analytics using MongoDB $facet
router.get("/analytics", async (req, res) => {
    try {
        const db = getMongoDb();

        const result = await db.collection("PatientReviews")
            .aggregate([
                {
                    $facet: {
                        rating_buckets: [
                            {
                                $group: {
                                    _id: "$rating",
                                    count: { $sum: 1 }
                                }
                            },
                            { $sort: { _id: 1 } }
                        ],
                        top_sentiment_tags: [
                            { $unwind: "$tags" },
                            {
                                $group: {
                                    _id: "$tags",
                                    count: { $sum: 1 }
                                }
                            },
                            { $sort: { count: -1 } },
                            { $limit: 10 }
                        ],
                        global_average: [
                            {
                                $group: {
                                    _id: null,
                                    avg_rating: { $avg: "$rating" },
                                    total_reviews: { $sum: 1 }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    avg_rating: {
                                        $round: ["$avg_rating", 2]
                                    },
                                    total_reviews: 1
                                }
                            }
                        ]
                    }
                }
            ])
            .toArray();

        res.json(result[0] || {
            rating_buckets: [],
            top_sentiment_tags: [],
            global_average: []
        });
    } catch (error) {
        console.error("Review analytics error:", error);
        res.status(500).json({
            error: "Failed to fetch review analytics"
        });
    }
});

// Get MedicalCatalogs documents, optionally filtered by clinic and type
router.get("/catalogs", async (req, res) => {
    try {
        const db = getMongoDb();
        const filter = {};

        if (req.query.clinic_id) {
            filter.clinic_id = req.query.clinic_id;
        }

        if (req.query.type) {
            const allowedTypes = [
                "specialist_availability",
                "medication"
            ];

            if (!allowedTypes.includes(req.query.type)) {
                return res.status(400).json({
                    error: "Invalid catalog type"
                });
            }

            filter.type = req.query.type;
        }

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(
            100,
            Math.max(1, parseInt(req.query.limit, 10) || 20)
        );

        const [catalogs, total] = await Promise.all([
            db.collection("MedicalCatalogs")
                .find(filter)
                .skip((page - 1) * limit)
                .limit(limit)
                .toArray(),
            db.collection("MedicalCatalogs").countDocuments(filter)
        ]);

        res.json({
            catalogs,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error("Medical catalogs error:", error);
        res.status(500).json({
            error: "Failed to fetch medical catalogs"
        });
    }
});

module.exports = router;
