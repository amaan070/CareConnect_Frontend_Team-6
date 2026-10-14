
db = db.getSiblingDB("careconnect");

const collectionConfigs = [
    {
        name: "MedicalCatalogs",
        validator: {
            $jsonSchema: {
                bsonType: "object",
                required: ["clinic_id", "type"],
                properties: {
                    clinic_id: {
                        bsonType: "string",
                        description: "references Postgres clinics.id"
                    },
                    type: {
                        enum: ["specialist_availability", "medication"],
                        description: "discriminator field"
                    }
                }
            }
        }
    },
    {
        name: "PatientReviews",
        validator: {
            $jsonSchema: {
                bsonType: "object",
                required: [
                    "patient_id", "clinic_id", "rating", "tags", "created_at"
                ],
                properties: {
                    patient_id: { bsonType: "string" },
                    clinic_id: { bsonType: "string" },
                    rating: {
                        bsonType: "int",
                        minimum: 1,
                        maximum: 5
                    },
                    tags: {
                        bsonType: "array",
                        items: { bsonType: "string" }
                    },
                    comment: { bsonType: "string" },
                    created_at: { bsonType: "date" }
                }
            }
        }
    },
    {
        name: "NursePings",
        validator: {
            $jsonSchema: {
                bsonType: "object",
                required: ["nurse_id", "location", "is_active", "created_at"],
                properties: {
                    nurse_id: { bsonType: "string" },
                    is_active: { bsonType: "bool" },
                    location: {
                        bsonType: "object",
                        required: ["type", "coordinates"],
                        properties: {
                            type: { enum: ["Point"] },
                            coordinates: {
                                bsonType: "array",
                                minItems: 2,
                                maxItems: 2,
                                items: { bsonType: "double" }
                            }
                        }
                    },
                    created_at: { bsonType: "date" }
                }
            }
        }
    }
];

// Create missing collections or update validators on existing ones.
for (const config of collectionConfigs) {
    const exists = db.getCollectionNames().includes(config.name);

    if (!exists) {
        db.createCollection(config.name, {
            validator: config.validator,
            validationLevel: "moderate"
        });
        print(`Created collection: ${config.name}`);
    } else {
        db.runCommand({
            collMod: config.name,
            validator: config.validator,
            validationLevel: "moderate"
        });
        print(`Updated validator: ${config.name}`);
    }
}

// Geospatial index for Workflow 3.
db.NursePings.createIndex({ location: "2dsphere" });

// Expire nurse pings after two hours.
db.NursePings.createIndex(
    { created_at: 1 },
    { expireAfterSeconds: 7200 }
);

// Secondary indexes.
db.NursePings.createIndex({ nurse_id: 1, is_active: 1 });
db.NursePings.createIndex({ nurse_id: 1, created_at: -1 });
db.PatientReviews.createIndex({ clinic_id: 1 });
db.PatientReviews.createIndex({ rating: 1 });
db.MedicalCatalogs.createIndex({ clinic_id: 1, type: 1 });

print("Collections, validators, and indexes configured.");
