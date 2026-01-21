import { generateResponse, XPACE_CONTEXT } from './ai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as memory from './memory';

// Mock do SDK do Google
jest.mock('@google/generative-ai');
// Mock do módulo de memória
jest.mock('./memory');

describe('AI Service (X-Bot Hybrid)', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.GEMINI_API_KEY = 'test_key';
    });

    it('Deve conter as tags e regras híbridas no contexto (Prompt)', () => {
        expect(XPACE_CONTEXT).toContain('[SHOW_MENU]');
        expect(XPACE_CONTEXT).toContain('[SHOW_PRICES]');
        expect(XPACE_CONTEXT).toContain('[SHOW_SCHEDULE]');
        expect(XPACE_CONTEXT).toContain('REGRAS DE RESPOSTA HÍBRIDA');
    });

    it('Deve chamar o Gemini e retornar o texto gerado', async () => {
        // Setup Mocks
        (memory.getHistory as jest.Mock).mockResolvedValue([]);
        (memory.getLearnedContext as jest.Mock).mockResolvedValue("");

        const mockResponse = {
            response: {
                text: () => "Olá! Sou o X-Bot. [SHOW_MENU]"
            }
        };

        const mockChat = {
            sendMessage: jest.fn().mockResolvedValue(mockResponse)
        };

        const mockModel = {
            startChat: jest.fn().mockReturnValue(mockChat)
        };

        (GoogleGenerativeAI as jest.Mock).mockImplementation(() => ({
            getGenerativeModel: jest.fn().mockReturnValue(mockModel)
        }));

        // Execução
        const response = await generateResponse('user_123', 'Oi');

        // Verificações
        expect(response).toBe("Olá! Sou o X-Bot. [SHOW_MENU]");
        expect(memory.getHistory).toHaveBeenCalledWith('user_123');
        expect(mockModel.startChat).toHaveBeenCalled();
        expect(mockChat.sendMessage).toHaveBeenCalledWith('Oi');
        expect(memory.saveMessage).toHaveBeenCalledWith('user_123', 'model', "Olá! Sou o X-Bot. [SHOW_MENU]");
    });

    it('Deve lidar com erros graciosamente', async () => {
        (memory.getHistory as jest.Mock).mockRejectedValue(new Error("DB Error"));

        const response = await generateResponse('user_error', 'Teste');

        expect(response).toContain("Ops, deu um tilt");
    });
});