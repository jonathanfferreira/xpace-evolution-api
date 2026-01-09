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

        // List ALL instances in DB
        const allInstances = await client.query(`SELECT id, name, "connectionStatus" FROM "Instance"`);
        console.log("=== ALL INSTANCES IN DATABASE ===");
        console.log(JSON.stringify(allInstances.rows, null, 2));

        // Check for instance with id starting with 10f5719f
        const apiInstance = await client.query(`SELECT id, name FROM "Instance" WHERE id LIKE '10f5719f%'`);
        console.log("\n=== Instance from API ID (10f5719f...) ===");
        console.log(JSON.stringify(apiInstance.rows, null, 2));

        // Check webhooks for all instances
        const allWebhooks = await client.query(`
            SELECT w.id, w.url, w.enabled, i.name as instance_name, w."instanceId"
            FROM "Webhook" w
            JOIN "Instance" i ON w."instanceId" = i.id
        `);
        console.log("\n=== ALL WEBHOOKS WITH INSTANCE NAMES ===");
        console.log(JSON.stringify(allWebhooks.rows, null, 2));

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.end();
    }
}

run();
