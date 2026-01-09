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

        // 1. Find Instance ID
        const res = await client.query(`SELECT id FROM "Instance" WHERE name = 'XPACE'`);
        if (res.rows.length === 0) {
            console.error("❌ Instance 'XPACE' not found in database!");
            return;
        }
        const instanceId = res.rows[0].id;
        console.log(`✅ Found XPACE Instance ID: ${instanceId}`);

        // 2. Fix Webhook
        // Use host.docker.internal to allow Evolution API (in Docker) to reach the host (Windows)
        const webhookUrl = 'http://host.docker.internal:3001/webhook';

        // Check if webhook exists
        const whRes = await client.query(`SELECT id FROM "Webhook" WHERE "instanceId" = $1`, [instanceId]);

        if (whRes.rows.length > 0) {
            // Update
            await client.query(`
                UPDATE "Webhook" 
                SET url = $1, enabled = true, "webhookByEvents" = false 
                WHERE "instanceId" = $2
            `, [webhookUrl, instanceId]);
            console.log(`✅ Updated existing Webhook to ${webhookUrl}`);
        } else {
            // Insert
            // Need a CUID or UUID for id. Postgres usually generates uuid if default? 
            // Prisma uses CUID. We can just generate a random string or let it fail if we need a strict ID.
            // Let's try to simple insert only necessary fields or use a simple random ID if string.
            // The schema says id is String @id @default(cuid()). We can generate a simple one.
            const newId = 'wh_' + Math.random().toString(36).substr(2, 9);
            await client.query(`
                INSERT INTO "Webhook" (id, url, enabled, "webhookByEvents", "instanceId", "updatedAt")
                VALUES ($1, $2, true, false, $3, NOW())
            `, [newId, webhookUrl, instanceId]);
            console.log(`✅ Created new Webhook pointing to ${webhookUrl}`);
        }

        // 3. Disable competing Bots (Typebot, EvolutionBot, Dify, OpenAI)
        await client.query(`UPDATE "Typebot" SET enabled = false WHERE "instanceId" = $1`, [instanceId]);
        console.log("✅ Disabled Typebot");

        await client.query(`UPDATE "EvolutionBot" SET enabled = false WHERE "instanceId" = $1`, [instanceId]);
        console.log("✅ Disabled EvolutionBot");

        await client.query(`UPDATE "Dify" SET enabled = false WHERE "instanceId" = $1`, [instanceId]);
        console.log("✅ Disabled Dify");

        await client.query(`UPDATE "OpenaiBot" SET enabled = false WHERE "instanceId" = $1`, [instanceId]);
        console.log("✅ Disabled OpenaiBot");

    } catch (err) {
        console.error("❌ Error executing database fix:", err);
    } finally {
        await client.end();
    }
}

run();
