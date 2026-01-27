import { pool } from './memory';

// Eventos do funil de conversão
export type FunnelEvent =
    | 'first_contact'    // Primeira interação
    | 'menu_view'        // Viu menu principal
    | 'quiz_start'       // Iniciou quiz (perguntou nome)
    | 'quiz_complete'    // Completou quiz
    | 'schedule_view'    // Viu grade de horários
    | 'modality_view'    // Viu detalhes de modalidade
    | 'price_view'       // Viu preços
    | 'booking_click'    // Clicou em agendar
    | 'human_handoff';   // Pediu humano

interface EventMetadata {
    modality?: string;
    source?: string;
    [key: string]: any;
}

/**
 * Registra um evento de funil
 */
export async function trackEvent(
    userId: string,
    event: FunnelEvent,
    metadata?: EventMetadata
): Promise<void> {
    try {
        await pool.query(
            `INSERT INTO funnel_events (user_id, event, metadata) VALUES ($1, $2, $3)`,
            [userId, event, metadata ? JSON.stringify(metadata) : null]
        );
        console.log(`[ANALYTICS] ${event} <- ${userId.slice(-8)}`);
    } catch (error) {
        console.error('[ANALYTICS ERROR]', error);
        // Não bloquear fluxo por erro de analytics
    }
}

/**
 * Verifica se usuário já teve primeiro contato (evita duplicar)
 */
export async function hasFirstContact(userId: string): Promise<boolean> {
    try {
        const result = await pool.query(
            `SELECT 1 FROM funnel_events WHERE user_id = $1 AND event = 'first_contact' LIMIT 1`,
            [userId]
        );
        return result.rows.length > 0;
    } catch {
        return false;
    }
}

/**
 * Estatísticas do funil por período
 */
export async function getFunnelStats(
    startDate?: Date,
    endDate?: Date
): Promise<{
    totalLeads: number;
    byEvent: Record<string, number>;
    conversionRates: Record<string, number>;
}> {
    try {
        const dateFilter = startDate && endDate
            ? `WHERE created_at BETWEEN $1 AND $2`
            : '';
        const params = startDate && endDate ? [startDate, endDate] : [];

        // Total de leads únicos
        const leadsResult = await pool.query(
            `SELECT COUNT(DISTINCT user_id) as total FROM funnel_events ${dateFilter}`,
            params
        );
        const totalLeads = parseInt(leadsResult.rows[0]?.total || '0');

        // Contagem por evento
        const eventsResult = await pool.query(
            `SELECT event, COUNT(DISTINCT user_id) as count 
             FROM funnel_events ${dateFilter} 
             GROUP BY event 
             ORDER BY count DESC`,
            params
        );

        const byEvent: Record<string, number> = {};
        eventsResult.rows.forEach((row: any) => {
            byEvent[row.event] = parseInt(row.count);
        });

        // Taxas de conversão (baseadas no primeiro contato)
        const conversionRates: Record<string, number> = {};
        if (totalLeads > 0) {
            Object.entries(byEvent).forEach(([event, count]) => {
                conversionRates[event] = Math.round((count / totalLeads) * 100);
            });
        }

        return { totalLeads, byEvent, conversionRates };
    } catch (error) {
        console.error('[ANALYTICS ERROR] getFunnelStats:', error);
        return { totalLeads: 0, byEvent: {}, conversionRates: {} };
    }
}

/**
 * Estatísticas diárias (para gráfico)
 */
export async function getDailyStats(days: number = 7): Promise<Array<{
    date: string;
    leads: number;
    priceViews: number;
    bookings: number;
}>> {
    try {
        const result = await pool.query(`
            SELECT 
                DATE(created_at) as date,
                COUNT(DISTINCT CASE WHEN event = 'first_contact' THEN user_id END) as leads,
                COUNT(DISTINCT CASE WHEN event = 'price_view' THEN user_id END) as price_views,
                COUNT(DISTINCT CASE WHEN event = 'booking_click' THEN user_id END) as bookings
            FROM funnel_events 
            WHERE created_at >= NOW() - INTERVAL '${days} days'
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `);

        return result.rows.map((row: any) => ({
            date: row.date.toISOString().split('T')[0],
            leads: parseInt(row.leads),
            priceViews: parseInt(row.price_views),
            bookings: parseInt(row.bookings)
        }));
    } catch (error) {
        console.error('[ANALYTICS ERROR] getDailyStats:', error);
        return [];
    }
}

/**
 * Inicializa tabela de analytics
 */
export async function initAnalytics(): Promise<void> {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS funnel_events (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                event TEXT NOT NULL,
                metadata JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_funnel_user ON funnel_events(user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_funnel_event ON funnel_events(event)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_funnel_date ON funnel_events(created_at)`);
        console.log('[ANALYTICS] Tabela funnel_events pronta');
    } catch (error) {
        console.error('[ANALYTICS] Erro ao criar tabela:', error);
    }
}
