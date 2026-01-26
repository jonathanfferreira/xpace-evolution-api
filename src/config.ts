import dotenv from 'dotenv';

dotenv.config();

export const config = {
    port: process.env.PORT || 3000,
    gemini: {
        apiKey: process.env.GEMINI_API_KEY,
        model: "gemini-2.0-flash"
    },
    database: {
        uri: process.env.DATABASE_CONNECTION_URI
    },
    evolutionApi: {
        apiKey: process.env.AUTHENTICATION_API_KEY || 'xpace_secure_key_2025',
        serverUrl: process.env.SERVER_URL || 'http://localhost:8080',
        instance: 'XPACE'
    }
};

// Fail fast validation
if (!config.gemini.apiKey) {
    console.error("❌ CRITICAL: GEMINI_API_KEY is missing in .env!");
}
if (!config.database.uri) {
    console.error("❌ CRITICAL: DATABASE_CONNECTION_URI is missing in .env!");
}
