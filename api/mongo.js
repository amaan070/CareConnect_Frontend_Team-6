
const { MongoClient } = require("mongodb");

const uri =
    process.env.MONGODB_URI ||
    "mongodb://127.0.0.1:27017";

const client = new MongoClient(uri);

let db;

async function connectMongo() {
    if (db) {
        return db;
    }

    await client.connect();
    db = client.db("careconnect");

    console.log("MongoDB connected successfully");

    return db;
}

function getMongoDb() {
    if (!db) {
        throw new Error(
            "MongoDB is not connected. Call connectMongo() first."
        );
    }

    return db;
}

module.exports = {
    connectMongo,
    getMongoDb
};
