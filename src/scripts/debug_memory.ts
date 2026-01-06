import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_CONNECTION_URI,
    ssl: {
        rejectUnauthorized: false
    }
});

async function checkMemory() {
    try {
        console.log('--- CHECKING AI MEMORY ---');
        // Get the last 20 messages from ALL users to see what's happening
        const res = await pool.query(
            'SELECT user_id, role, content, created_at FROM ai_memory ORDER BY created_at DESC LIMIT 20'
        );

        if (res.rows.length === 0) {
            console.log('MEMORY IS EMPTY! The bot is not saving conversations.');
        } else {
            console.log(`Found ${res.rows.length} messages.`);
            res.rows.reverse().forEach(row => {
                console.log(`[${row.created_at.toISOString()}] ${row.user_id} (${row.role}): ${row.content.substring(0, 100)}...`);
            });
        }

    } catch (error) {
        console.error('Error querying database:', error);
    } finally {
        await pool.end();
    }
}

checkMemory();
