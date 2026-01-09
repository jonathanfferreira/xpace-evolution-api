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

// Inicia as tabelas se não existirem
export async function ensureDbInitialized() {
    try {
        // Tabela de Memória da IA
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

        // Tabela de Estado do Fluxo (Substituindo Redis)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS flow_states (
                user_id TEXT PRIMARY KEY,
                step TEXT NOT NULL,
                data JSONB DEFAULT '{}',
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        console.log('✅ Database initialized (Memory + Flow State)');
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

// Auto-run for server context (optional, but keep it if server relies on side-effect)
// Better to call it explicitly in server.ts, but for backward compat:
ensureDbInitialized();

export async function getHistory(userId: string): Promise<Message[]> {
    try {
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

        // Limpeza: manter apenas as últimas 50 mensagens
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
        await deleteFlowState(userId);
    } catch (error) {
        console.error('Error clearing history:', error);
    }
}

// --- Flow State Persistence (PostgreSQL) ---

export async function saveFlowState(userId: string, step: string, data: any = {}) {
    try {
        await pool.query(`
            INSERT INTO flow_states (user_id, step, data, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (user_id) 
            DO UPDATE SET step = $2, data = $3, updated_at = NOW()
        `, [userId, step, data]);
    } catch (error) {
        console.error('Error saving flow state to DB:', error);
    }
}

export async function getFlowState(userId: string): Promise<{ step: string, data: any } | null> {
    try {
        const res = await pool.query(
            'SELECT step, data FROM flow_states WHERE user_id = $1',
            [userId]
        );

        if (res.rows.length > 0) {
            return {
                step: res.rows[0].step,
                data: res.rows[0].data
            };
        }
        return null;
    } catch (error) {
        console.error('Error getting flow state from DB:', error);
        return null;
    }
}

export async function deleteFlowState(userId: string) {
    try {
        await pool.query('DELETE FROM flow_states WHERE user_id = $1', [userId]);
    } catch (error) {
        console.error('Error deleting flow state from DB:', error);
    }
}
