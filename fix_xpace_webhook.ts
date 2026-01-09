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

        // Get XPACE instance explicitly
        const xpaceRes = await client.query(`SELECT id, name, "connectionStatus" FROM "Instance" WHERE name = 'XPACE'`);

        if (xpaceRes.rows.length === 0) {
            console.log("❌ No instance named 'XPACE' found!");
            return;
        }

        const xpaceId = xpaceRes.rows[0].id;
        console.log(`XPACE Instance ID: ${xpaceId}`);
        console.log(`XPACE Status: ${xpaceRes.rows[0].connectionStatus}`);

        // Check webhook for this ID
        const whRes = await client.query(`SELECT id, url, enabled FROM "Webhook" WHERE "instanceId" = $1`, [xpaceId]);

        if (whRes.rows.length === 0) {
            console.log("❌ No webhook found for XPACE. Creating one...");

            const newId = 'wh_' + Math.random().toString(36).substr(2, 9);
            const webhookUrl = 'http://localhost:3001/webhook';

            await client.query(`
                INSERT INTO "Webhook" (id, url, enabled, "webhookByEvents", "webhookBase64", "instanceId", "createdAt", "updatedAt")
                VALUES ($1, $2, true, false, false, $3, NOW(), NOW())
            `, [newId, webhookUrl, xpaceId]);

            console.log(`✅ Created webhook: ${webhookUrl}`);
        } else {
            console.log(`Webhook exists: ${JSON.stringify(whRes.rows[0])}`);

            // Update it to be sure
            await client.query(`
                UPDATE "Webhook" SET url = 'http://localhost:3001/webhook', enabled = true, "updatedAt" = NOW()
                WHERE "instanceId" = $1
            `, [xpaceId]);
            console.log("✅ Updated webhook URL to http://localhost:3001/webhook");
        }

        // Verify final state
        const finalWh = await client.query(`SELECT * FROM "Webhook" WHERE "instanceId" = $1`, [xpaceId]);
        console.log("\nFinal Webhook State:");
        console.log(JSON.stringify(finalWh.rows[0], null, 2));

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.end();
    }
}

run();
