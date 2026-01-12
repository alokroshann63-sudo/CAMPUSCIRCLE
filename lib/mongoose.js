const mongoose = require('mongoose');

// Global cached connection for serverless
let cached = global.mongoose;

if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

/**
 * Connect to MongoDB with serverless-optimized settings
 * Reuses existing connection across serverless invocations
 */
async function dbConnect() {
    // If connection already exists, return it
    if (cached.conn) {
        return cached.conn;
    }

    // If connection promise doesn't exist, create new connection
    if (!cached.promise) {
        const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI;
        
        if (!mongoURI) {
            throw new Error('MONGO_URI or MONGODB_URI environment variable is not defined');
        }

        const opts = {
            bufferCommands: false, // Disable buffering to fail fast
            serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
            socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
            maxPoolSize: 10, // Maintain up to 10 socket connections
        };

        cached.promise = mongoose.connect(mongoURI, opts).then((mongoose) => {
            console.log('✅ MongoDB Connected (cached)');
            return mongoose;
        });
    }

    try {
        cached.conn = await cached.promise;
    } catch (e) {
        cached.promise = null;
        console.error('❌ MongoDB Connection Error:', e);
        throw e;
    }

    return cached.conn;
}

module.exports = { dbConnect };
