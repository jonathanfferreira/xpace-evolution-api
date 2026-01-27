import { Pool } from 'pg';
import { config } from '../config';

const pool = new Pool({
    connectionString: config.database.uri,
    ssl: {
        rejectUnauthorized: false
    },
    max: 10, // Limita o número máximo de conexões no pool
    idleTimeoutMillis: 30000, // Fecha conexões inativas após 30 segundos
    connectionTimeoutMillis: 2000, // Timeout para tentar conectar
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

            -- Tabela de Aprendizado da IA
            CREATE TABLE IF NOT EXISTS ai_learning (
                id SERIAL PRIMARY KEY,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            -- Tabela de Perfil do Aluno (Memória de Longo Prazo)
            CREATE TABLE IF NOT EXISTS student_profiles (
                user_id TEXT PRIMARY KEY,
                name TEXT,
                age INTEGER,
                goal TEXT,
                experience TEXT,
                last_recommendation TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        console.log('✅ Database initialized (Memory + Flow State)');
    } catch (error) {
        console.error('⚠️ Warning: Database initialization failed. Features dependent on persistence will be disabled.', error);
    }
}

// Initial connection check
pool.connect().catch(err => console.error("⚠️ Warning: Initial DB connection failed. Bot works in stateless mode.", err.message));

export async function getHistory(userId: string): Promise<Message[]> {
    try {
        const res = await pool.query(`
            SELECT role, content 
            FROM ai_memory 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT 30
        `, [userId]);

        // Invertemos a ordem no código para manter a cronologia correta para a IA
        return res.rows.reverse().map(row => ({
            role: row.role as 'user' | 'model',
            parts: [{ text: row.content }]
        }));
    } catch (error) {
        console.error('Error getting history (Stateless fallback active):', error);
        return [];
    }
}

export async function saveMessage(userId: string, role: 'user' | 'model', text: string) {
    try {
        await pool.query(
            'INSERT INTO ai_memory (user_id, role, content) VALUES ($1, $2, $3)',
            [userId, role, text]
        );

        // Limpeza estocástica: executa a limpeza apenas em ~10% das vezes para economizar recursos
        if (Math.random() < 0.1) {
            await pool.query(`
                DELETE FROM ai_memory 
                WHERE id IN (
                    SELECT id FROM ai_memory 
                    WHERE user_id = $1 
                    ORDER BY created_at DESC 
                    OFFSET 100
                )
            `, [userId]);
        }

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

// --- AI Learning ---

export async function saveLearnedResponse(question: string, answer: string) {
    try {
        // Evita duplicatas exatas recentes? Por enquanto salva tudo.
        await pool.query(
            'INSERT INTO ai_learning (question, answer) VALUES ($1, $2)',
            [question, answer]
        );
        console.log('🧠 [LEARNING] New QA pair saved.');
    } catch (error) {
        console.error('Error saving learned response:', error);
    }
}

export async function getLearnedContext(): Promise<string> {
    try {
        // Pega os últimos 20 aprendizados
        const res = await pool.query(`
            SELECT question, answer 
            FROM ai_learning 
            ORDER BY created_at DESC 
            LIMIT 20
        `);

        if (res.rows.length === 0) return "";

        const context = res.rows.map(row => `P: ${row.question}\nR: ${row.answer}`).join('\n---\n');
        return `\n\n📚 **HISTÓRICO DE RESPOSTAS (APRENDIZADO):**\nUse essas respostas anteriores do dono como base:\n${context}\n`;
    } catch (error) {
        console.error('Error getting learned context:', error);
        return "";
    }
}

// --- Student Profile (Long-term Memory) ---

export async function saveStudentProfile(userId: string, profile: any) {
    try {
        await pool.query(`
            INSERT INTO student_profiles (user_id, name, age, goal, experience, last_recommendation, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                name = COALESCE($2, student_profiles.name),
                age = COALESCE($3, student_profiles.age),
                goal = COALESCE($4, student_profiles.goal),
                experience = COALESCE($5, student_profiles.experience),
                last_recommendation = COALESCE($6, student_profiles.last_recommendation),
                updated_at = NOW()
        `, [userId, profile.name, profile.age, profile.goal, profile.experience, profile.last_recommendation]);
    } catch (error) {
        console.error('Error saving student profile:', error);
    }
}

export async function getStudentProfile(userId: string): Promise<any | null> {
    try {
        const res = await pool.query(
            'SELECT * FROM student_profiles WHERE user_id = $1',
            [userId]
        );
        return res.rows.length > 0 ? res.rows[0] : null;
    } catch (error) {
        console.error('Error getting student profile:', error);
        return null;
    }
}
