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

        // The CORRECT instance ID that the API is using
        const correctInstanceId = '10f5719f-c91a-4079-81e8-d526c5994493';
        const webhookUrl = 'http://localhost:3001/webhook';

        // Check if webhook exists for this instance
        const whRes = await client.query(`SELECT id FROM "Webhook" WHERE "instanceId" = $1`, [correctInstanceId]);

        if (whRes.rows.length > 0) {
            // Update existing
            await client.query(`
                UPDATE "Webhook" 
                SET url = $1, enabled = true, "webhookByEvents" = false, "updatedAt" = NOW()
                WHERE "instanceId" = $2
            `, [webhookUrl, correctInstanceId]);
            console.log(`✅ Updated existing Webhook for instance ${correctInstanceId}`);
        } else {
            // Insert new
            const newId = 'wh_' + Math.random().toString(36).substr(2, 9);
            await client.query(`
                INSERT INTO "Webhook" (id, url, enabled, "webhookByEvents", "webhookBase64", "instanceId", "createdAt", "updatedAt")
                VALUES ($1, $2, true, false, false, $3, NOW(), NOW())
            `, [newId, webhookUrl, correctInstanceId]);
            console.log(`✅ Created new Webhook for instance ${correctInstanceId}`);
        }

        // Verify
        const verify = await client.query(`SELECT * FROM "Webhook" WHERE "instanceId" = $1`, [correctInstanceId]);
        console.log("Webhook now:", JSON.stringify(verify.rows[0], null, 2));

        // Also disable any bots on this instance
        await client.query(`UPDATE "Typebot" SET enabled = false WHERE "instanceId" = $1`, [correctInstanceId]);
        await client.query(`UPDATE "EvolutionBot" SET enabled = false WHERE "instanceId" = $1`, [correctInstanceId]);
        await client.query(`UPDATE "Dify" SET enabled = false WHERE "instanceId" = $1`, [correctInstanceId]);
        await client.query(`UPDATE "OpenaiBot" SET enabled = false WHERE "instanceId" = $1`, [correctInstanceId]);
        console.log("✅ Disabled all competing bots");

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.end();
    }
}

run();
