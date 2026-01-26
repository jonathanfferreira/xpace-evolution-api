
import { Pool } from 'pg';
import { config } from './src/config';

async function testDB() {
    console.log("🔌 Testing Database Connection...");
    console.log("URI:", config.database.uri?.replace(/:([^:@]+)@/, ':****@')); // Hide password

    const pool = new Pool({
        connectionString: config.database.uri,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const client = await pool.connect();
        console.log("✅ API Connection Successful!");
        const res = await client.query('SELECT NOW()');
        console.log("✅ Query Result:", res.rows[0]);
        client.release();
    } catch (err) {
        console.error("❌ Connection Failed:", err);
    } finally {
        await pool.end();
    }
}

testDB();
