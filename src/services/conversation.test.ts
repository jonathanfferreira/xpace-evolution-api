import { generateResponse } from './ai';
import { getHistory, saveMessage, clearHistory } from './memory';
import axios from 'axios';
import { Pool } from 'pg';

// 1. Mock do Axios (Para simular respostas da IA)
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// 2. Mock do Postgres (Para simular Banco de Dados em Memória)
// É crucial mockar isso antes dos imports, pois memory.ts executa initDb() ao carregar.
jest.mock('pg', () => {
    const mPool = {
        query: jest.fn(),
    };
    return { Pool: jest.fn(() => mPool) };
});

// Acesso à instância mockada do Pool
const pool = new (require('pg').Pool)();

describe('Teste de Integração: Conversa Completa (User -> Bot -> User)', () => {
    let memoryStore: any[] = [];
    const userId = '554799999999';

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.GEMINI_API_KEY = 'test_integration_key';
        memoryStore = []; // Limpa o "banco" antes de cada teste

        // Implementação Fake do Banco de Dados (In-Memory)
        (pool.query as jest.Mock).mockImplementation(async (text: string, params: any[]) => {
            const sql = text.trim().toUpperCase();

            // Simula INSERT (saveMessage)
            if (sql.startsWith('INSERT')) {
                memoryStore.push({
                    user_id: params[0],
                    role: params[1],
                    content: params[2],
                    created_at: new Date()
                });
                return { rowCount: 1 };
            }

            // Simula SELECT (getHistory)
            if (sql.startsWith('SELECT')) {
                // Retorna mensagens do usuário específico
                // A query real ordena, mas aqui assumimos a ordem de inserção do array
                const rows = memoryStore.filter(m => m.user_id === params[0]);
                return { rows };
            }

            // Simula DELETE/CREATE (initDb ou limpeza)
            return { rowCount: 1, rows: [] };
        });
    });

    it('Deve acumular histórico e enviá-lo para a IA no segundo turno da conversa', async () => {
        // --- TURNO 1: Usuário inicia a conversa ---
        const msg1 = "Olá, gostaria de saber sobre as aulas.";

        // 1. Verifica que histórico começa vazio
        const history1 = await getHistory(userId);
        expect(history1).toHaveLength(0);

        // 2. Mock da resposta da IA (Diagnóstico)
        mockedAxios.post.mockResolvedValueOnce({
            data: { candidates: [{ content: { parts: [{ text: "Você já dança ou é iniciante?" }] } }] }
        });

        // 3. Gera resposta e salva interação no "banco"
        const response1 = await generateResponse(msg1, history1);
        await saveMessage(userId, 'user', msg1);
        await saveMessage(userId, 'model', response1);

        expect(response1).toBe("Você já dança ou é iniciante?");

        // --- TURNO 2: Usuário responde ---
        const msg2 = "Sou iniciante.";

        // 4. Recupera histórico (Deve conter o Turno 1)
        const history2 = await getHistory(userId);
        expect(history2).toHaveLength(2); // Msg1 + Response1
        expect(history2[0].parts[0].text).toBe(msg1);
        expect(history2[1].parts[0].text).toBe(response1);

        // 5. Mock da resposta da IA (Recomendação baseada no contexto)
        mockedAxios.post.mockResolvedValueOnce({
            data: { candidates: [{ content: { parts: [{ text: "Recomendo a turma de Street Funk." }] } }] }
        });

        // 6. Gera resposta enviando o histórico acumulado
        await generateResponse(msg2, history2);

        // 7. VALIDAÇÃO CRÍTICA: O que foi enviado para a API do Gemini?
        const callArgs = mockedAxios.post.mock.calls[1]; // Segunda chamada (Turno 2)
        const requestBody = callArgs[1];

        // O payload deve conter 3 mensagens: [Histórico User, Histórico Bot, Prompt Atual]
        expect(requestBody.contents).toHaveLength(3);
        expect(requestBody.contents[0].parts[0].text).toBe(msg1); // Contexto: Pergunta inicial
        expect(requestBody.contents[1].parts[0].text).toBe(response1); // Contexto: Pergunta do Bot
        expect(requestBody.contents[2].parts[0].text).toBe(msg2); // Input atual: Resposta do User
    });
});