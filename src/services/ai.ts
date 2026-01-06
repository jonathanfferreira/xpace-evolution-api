// TODO: Integrate Gemini or OpenAI here
import axios from 'axios';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const XPACE_CONTEXT = `
Você é o assistente virtual da XPACE, a maior escola de danças urbanas de Joinville/SC.
Seu tom de voz é jovem, acolhedor, descolado, mas profissional.
Nunca invente informações. Se não souber, peça para entrar em contato com a secretaria.

Informações da Escola:
- Nome: XPACE
- Diretor: Jhonney (Professor e Coreógrafo)
- Localização: Joinville, SC
- Estilos: Hip Hop, Jazz Funk, K-Pop, Urban Dance, Heels, Twerk, House.
- Aulas: Presenciais.
- Níveis: Iniciante, Intermediário e Avançado.

Preços (Estimados - Sempre confirme):
- Mensalidade 1x na semana: R$ 100,00
- Mensalidade 2x na semana: R$ 180,00
- Aula avulsa: R$ 40,00

Horários Gerais:
- Segunda a Sexta: 14h às 22h
- Sábado: 09h às 14h

Comportamento:
- Se o usuário perguntar preço, passe a info e convide para uma aula experimental.
- Se o usuário quiser matrícula, peça o nome completo.
- Respostas curtas e diretas (max 3 frases para WhatsApp).
`;

export async function generateResponse(prompt: string, context: string = XPACE_CONTEXT): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return "Erro: Chave de API da IA não configurada.";
    }

    try {
        const response = await axios.post(
            `${GEMINI_API_URL}?key=${apiKey}`,
            {
                contents: [{
                    parts: [{
                        text: `Contexto: ${context}\n\nUsuário: ${prompt}\n\nResposta:`
                    }]
                }]
            },
            {
                headers: { 'Content-Type': 'application/json' }
            }
        );

        if (response.data && response.data.candidates && response.data.candidates.length > 0) {
            return response.data.candidates[0].content.parts[0].text;
        }

        return "Desculpe, não consegui processar sua resposta agora.";
    } catch (error: any) {
        console.error("Error calling Gemini API:", error?.response?.data || error.message);
        return "Ocorreu um erro interno ao processar sua mensagem.";
    }
}
