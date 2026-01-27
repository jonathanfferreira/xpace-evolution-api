import { pool } from './memory';
import { sendProfessionalMessage } from './whatsapp';
import { getStudentProfile } from './memory';
import { trackEvent } from './analytics';

// Estágios de follow-up
export type FollowUpStage = 'reminder_15m' | 'reminder_2h' | 'reminder_24h';

// Mensagens personalizadas por estágio
const FOLLOWUP_MESSAGES: Record<FollowUpStage, (name: string) => string> = {
    'reminder_15m': (name) =>
        `Ei${name ? `, ${name}` : ''}! 😊\n\n` +
        `Ficou alguma dúvida sobre os valores ou horários? Tô aqui pra ajudar! 💬`,

    'reminder_2h': (name) =>
        `Opa${name ? `, ${name}` : ''}! 🎉\n\n` +
        `Lembrete rápido: sua *primeira aula é por nossa conta*! Que tal agendar pra essa semana?\n\n` +
        `📅 Responde "quero agendar" que eu te ajudo!`,

    'reminder_24h': (name) =>
        `${name ? `${name}, ` : ''}última chance! 🔥\n\n` +
        `As turmas de Janeiro estão quase cheias! Se quiser garantir sua vaga, é só responder essa mensagem.\n\n` +
        `Posso te ajudar com algo? 😊`
};

// Delays em ms
const FOLLOWUP_DELAYS: Record<FollowUpStage, number> = {
    'reminder_15m': 15 * 60 * 1000,      // 15 minutos
    'reminder_2h': 2 * 60 * 60 * 1000,   // 2 horas
    'reminder_24h': 24 * 60 * 60 * 1000  // 24 horas
};

/**
 * Agenda todos os follow-ups para um lead que viu preços
 */
export async function scheduleFollowUps(userId: string, instance?: string): Promise<void> {
    try {
        // Primeiro, cancela follow-ups anteriores (se houver)
        await cancelFollowUps(userId);

        const stages: FollowUpStage[] = ['reminder_15m', 'reminder_2h', 'reminder_24h'];

        for (const stage of stages) {
            const scheduledAt = new Date(Date.now() + FOLLOWUP_DELAYS[stage]);

            await pool.query(
                `INSERT INTO follow_ups (user_id, stage, scheduled_at, instance) 
                 VALUES ($1, $2, $3, $4)`,
                [userId, stage, scheduledAt, instance || 'xpace']
            );
        }

        console.log(`[FOLLOWUP] Agendado 3 lembretes para ${userId.slice(-8)}`);
    } catch (error) {
        console.error('[FOLLOWUP ERROR] scheduleFollowUps:', error);
    }
}

/**
 * Cancela todos os follow-ups pendentes (quando lead converte)
 */
export async function cancelFollowUps(userId: string): Promise<void> {
    try {
        const result = await pool.query(
            `UPDATE follow_ups SET cancelled = TRUE 
             WHERE user_id = $1 AND sent_at IS NULL AND cancelled = FALSE`,
            [userId]
        );

        if (result.rowCount && result.rowCount > 0) {
            console.log(`[FOLLOWUP] Cancelados ${result.rowCount} lembretes para ${userId.slice(-8)}`);
        }
    } catch (error) {
        console.error('[FOLLOWUP ERROR] cancelFollowUps:', error);
    }
}

/**
 * Processa e envia follow-ups pendentes
 * Deve ser chamado periodicamente (a cada minuto)
 */
export async function processPendingFollowUps(): Promise<void> {
    try {
        // Busca follow-ups que devem ser enviados agora
        const result = await pool.query(`
            SELECT id, user_id, stage, instance 
            FROM follow_ups 
            WHERE scheduled_at <= NOW() 
              AND sent_at IS NULL 
              AND cancelled = FALSE
            ORDER BY scheduled_at ASC
            LIMIT 10
        `);

        for (const row of result.rows) {
            try {
                // Busca nome do perfil
                const profile = await getStudentProfile(row.user_id);
                const name = profile?.name || '';

                // Gera mensagem
                const getMessage = FOLLOWUP_MESSAGES[row.stage as FollowUpStage];
                if (!getMessage) continue;

                const message = getMessage(name);

                // Envia mensagem
                await sendProfessionalMessage(row.user_id, message, row.instance);

                // Marca como enviado
                await pool.query(
                    `UPDATE follow_ups SET sent_at = NOW() WHERE id = $1`,
                    [row.id]
                );

                // Trackea evento
                await trackEvent(row.user_id, 'first_contact', {
                    source: 'followup',
                    stage: row.stage
                });

                console.log(`[FOLLOWUP] Enviado ${row.stage} para ${row.user_id.slice(-8)}`);

                // Pequeno delay entre envios
                await new Promise(r => setTimeout(r, 2000));

            } catch (sendError) {
                console.error(`[FOLLOWUP ERROR] Erro ao enviar para ${row.user_id}:`, sendError);
                // Marca como cancelado para não tentar novamente
                await pool.query(
                    `UPDATE follow_ups SET cancelled = TRUE WHERE id = $1`,
                    [row.id]
                );
            }
        }
    } catch (error) {
        console.error('[FOLLOWUP ERROR] processPendingFollowUps:', error);
    }
}

/**
 * Inicia o job de follow-ups (roda a cada minuto)
 */
export function startFollowUpJob(): void {
    console.log('[FOLLOWUP] Job de follow-ups iniciado');

    // Processa imediatamente
    processPendingFollowUps();

    // Depois a cada 1 minuto
    setInterval(processPendingFollowUps, 60 * 1000);
}

/**
 * Inicializa tabela de follow-ups
 */
export async function initFollowUps(): Promise<void> {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS follow_ups (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                stage TEXT NOT NULL,
                instance TEXT DEFAULT 'xpace',
                scheduled_at TIMESTAMP NOT NULL,
                sent_at TIMESTAMP,
                cancelled BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_followup_pending 
            ON follow_ups(scheduled_at) 
            WHERE sent_at IS NULL AND cancelled = FALSE
        `);
        console.log('[FOLLOWUP] Tabela follow_ups pronta');
    } catch (error) {
        console.error('[FOLLOWUP] Erro ao criar tabela:', error);
    }
}
