import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_CONNECTION_URI,
    ssl: {
        rejectUnauthorized: false
    }
});

interface Message {
    role: 'user' | 'model';
    parts: { text: string }[];
}

// Inicia a tabela se não existir
async function initDb() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ai_memory (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_ai_memory_user_id ON ai_memory(user_id);
        `);
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

initDb();

export async function getHistory(userId: string): Promise<Message[]> {
    try {
        // CORREÇÃO CRÍTICA: Pegar as 10 MAIS RECENTES (DESC) e depois reordenar (ASC)
        // Antes estava pegando as 10 PRIMEIRAS mensagens da história (sempre as antigas).
        const res = await pool.query(`
            SELECT role, content 
            FROM (
                SELECT role, content, created_at 
                FROM ai_memory 
                WHERE user_id = $1 
                ORDER BY created_at DESC 
                LIMIT 30
            ) sub 
            ORDER BY created_at ASC
        `, [userId]);

        return res.rows.map(row => ({
            role: row.role as 'user' | 'model',
            parts: [{ text: row.content }]
        }));
    } catch (error) {
        console.error('Error getting history:', error);
        return [];
    }
}

export async function saveMessage(userId: string, role: 'user' | 'model', text: string) {
    try {
        await pool.query(
            'INSERT INTO ai_memory (user_id, role, content) VALUES ($1, $2, $3)',
            [userId, role, text]
        );

        // Limpeza opcional: manter apenas as últimas 20 mensagens no banco para esse usuário
        // (Isso evita que o banco cresça infinitamente sem necessidade)
        await pool.query(`
            DELETE FROM ai_memory 
            WHERE id IN (
                SELECT id FROM ai_memory 
                WHERE user_id = $1 
                ORDER BY created_at DESC 
                OFFSET 50
            )
        `, [userId]);

    } catch (error) {
        console.error('Error saving message:', error);
    }
}

export async function clearHistory(userId: string) {
    try {
        await pool.query('DELETE FROM ai_memory WHERE user_id = $1', [userId]);
    } catch (error) {
        console.error('Error clearing history:', error);
    }
}
