import { generateResponse, XPACE_CONTEXT } from './ai';
import axios from 'axios';

// Mock do Axios para interceptar chamadas HTTP e não gastar cota da API real
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Validação do Fluxo de Vendas (X-Bot)', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.GEMINI_API_KEY = 'test_api_key';
    });

    /**
     * Teste 1: Validação Estática do Prompt (Regras de Negócio)
     * Garante que as instruções cruciais não foram removidas ou alteradas acidentalmente no código.
     */
    it('Deve conter a instrução obrigatória de perguntar a experiência antes da grade', () => {
        // Verifica se a "Regra de Ouro" está presente no texto do prompt
        expect(XPACE_CONTEXT).toContain('pergunte a experiência dele antes de mandar a grade');

        // Verifica se as etapas do fluxo (State Machine) estão definidas
        expect(XPACE_CONTEXT).toContain('Diagnóstico');
        expect(XPACE_CONTEXT).toContain('Recomendação');
    });

    /**
     * Teste 2: Validação do Envio de Contexto (System Instruction)
     * Garante que o "cérebro" (prompt com as regras) está sendo enviado corretamente para a API.
     */
    it('Deve enviar o XPACE_CONTEXT como system_instruction para a API', async () => {
        // Configura resposta simulada
        mockedAxios.post.mockResolvedValue({
            data: {
                candidates: [{ content: { parts: [{ text: 'Resposta da IA' }] } }]
            }
        });

        await generateResponse('Olá');

        // Verifica os argumentos da chamada POST
        const callArgs = mockedAxios.post.mock.calls[0];
        const requestBody = callArgs[1];

        expect(requestBody.system_instruction).toBeDefined();
        expect(requestBody.system_instruction.parts[0].text).toBe(XPACE_CONTEXT);
    });

    /**
     * Teste 3: Validação de Memória (Histórico)
     * O fluxo depende de saber o que foi dito antes. Este teste garante que o histórico é enviado.
     */
    it('Deve incluir o histórico da conversa para manter o contexto do fluxo', async () => {
        const history = [
            { role: 'user', parts: [{ text: 'Quais as aulas?' }] },
            { role: 'model', parts: [{ text: 'Você já dança ou é iniciante?' }] } // Bot seguindo o fluxo
        ];
        const userPrompt = 'Sou iniciante';

        mockedAxios.post.mockResolvedValue({
            data: {
                candidates: [{ content: { parts: [{ text: 'Recomendo a turma de iniciantes.' }] } }]
            }
        });

        await generateResponse(userPrompt, history);

        const requestBody = mockedAxios.post.mock.calls[0][1];
        const sentContents = requestBody.contents;

        // Deve ter 3 mensagens: 2 do histórico + 1 atual
        expect(sentContents).toHaveLength(3);
        expect(sentContents[0].parts[0].text).toBe('Quais as aulas?');
        expect(sentContents[1].parts[0].text).toBe('Você já dança ou é iniciante?');
        expect(sentContents[2].parts[0].text).toBe('Sou iniciante');
    });

    /**
     * Teste 4: Validação de Parâmetros de Geração
     * Uma temperatura baixa (0.4) é crucial para que o bot siga regras rígidas (State Machine)
     * em vez de ser "criativo" e pular etapas.
     */
    it('Deve usar temperatura baixa (0.4) para garantir aderência ao script de vendas', async () => {
        mockedAxios.post.mockResolvedValue({
            data: { candidates: [{ content: { parts: [{ text: 'Ok' }] } }] }
        });

        await generateResponse('Teste');

        const requestBody = mockedAxios.post.mock.calls[0][1];
        expect(requestBody.generationConfig.temperature).toBe(0.4);
    });
});