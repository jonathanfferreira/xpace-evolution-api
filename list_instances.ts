import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
    connectionString: process.env.DATABASE_CONNECTION_URI,
});

async function run() {
    try {
        await client.connect();
        console.log("Connected to Database.");

        // Get ALL instances - show FULL IDs
        const allInstances = await client.query(`SELECT id, name, "connectionStatus" FROM "Instance" ORDER BY "createdAt" DESC`);
        console.log("=== ALL INSTANCES (Full IDs) ===");
        allInstances.rows.forEach(row => {
            console.log(`Name: ${row.name} | ID: ${row.id} | Status: ${row.connectionStatus}`);
        });

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.end();
    }
}

run();
