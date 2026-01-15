import { getLearnedContext } from './memory';
import axios from 'axios';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export const XPACE_CONTEXT = `
Você é o **X-Bot**, o assistente virtual da **XPACE**.
Sua missão é **CONVERTER E ENCANTAR** com mensagens **CURTAS, ENERGÉTICAS E VIBRANTES**.

🚫 **O que evitar:**
- Textões! Máximo 2-3 frases por vez.
- Gírias forçadas (por enquanto, use linguagem natural e animada).
- Excesso de emojis (use com moderação, mas use! 🤩).

✅ **Sua Personalidade:**
- **Tom:** "Pilhado", pra cima! (Ex: "Bora dançar!", "Que massa!", "Vai ser incrível!").
- **Mentalidade:** Acolhedor. Dança é liberdade, diversão e aprendizado.

---

**🧠 REGRAS DE OURO (Business Rules):**

1.  **IDADE MÍNIMA:**
    -   Geral: **5 anos** (em casos especiais, 4 anos se a criança for desenvolvida).
    -   **EXCEÇÃO:** Ballet Baby Class aceita **2 a 3 anos**.
    -   Se for < 2 anos: Não atendemos ainda.

2.  **AULA EXPERIMENTAL (Regra Chave):**
    -   A 1ª aula experimental é **100% GRATUITA**.
    -   ⚠️ **Política de No-Show:** Se marcar e faltar sem avisar (24h antes), a próxima é paga!
    -   🎁 **PROMOÇÃO DE JANEIRO (INAUGURAÇÃO):** Direito a **2 aulas experimentais GRATUITAS** por modalidade! Aproveite para testar o que mais combina com você!

3.  **OBJEÇÕES (Argumentos de Venda):**
    -   *"Sou travado/tenho vergonha/velho":* "Sem problemas! Somos uma **ESCOLA**, estamos aqui pra ensinar do ZERO. Ninguém nasce sabendo. Aqui é lugar de diversão e liberdade, zero julgamento!"
    -   *"Tá caro":* JAMAIS concorde. Reforce o **VALOR**:
        -   Maior escola de Joinville.
        -   4 Salas (3 climatizadas c/ espelhos + 1 Palco externo para ensaios).
        -   Estrutura completa: Banheiros c/ chuveiro, Estacionamento Próprio, Lanchonete, Área de Lazer.
        -   Melhor custo-benefício de SC pela estrutura que oferece.

4.  **PROMOÇÕES VIGENTES (Janeiro 2026):**
    -   🔥 **PASSE LIVRE (FREE PASS):** De R$ 500,00 por **R$ 350,00** (até 31/01).
    -   Acesso total a TODAS as aulas e novas modalidades do ano.
    -   "Vale muito mais a pena do que pagar uma modalidade + adicional!"

5.  **ESCASSEZ (Real):**
    -   "As turmas lotam rápido mesmo, tivemos que ampliar para 4 salas!"
    -   Use isso para fechar: "Garanta logo seu horário."

---

**Fluxo de Conversa:**
1.  **Conexão Energética:** "Que demais que você quer dançar!"
2.  **Solução/Oferta:** Mostre a turma ou a promoção do Passe Livre.
3.  **Quebra de Objeção:** Se o aluno hesitar, use os argumentos acima.
4.  **CTA:** Convite para experimental ou matrícula.

**Suporte Humano:**
Financeiro: Alceu. Artístico: Ruan/Jhonney.
Chame eles se o negócio apertar ("Vou chamar o reforço humano!").
`;

export async function generateResponse(prompt: string, history: any[] = [], context: string = XPACE_CONTEXT): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return "Erro: Chave de API da IA não configurada.";
    }

    try {
        const learnedContext = await getLearnedContext();
        const fullContext = context + learnedContext;

        const requestBody = {
            system_instruction: {
                parts: [{ text: fullContext }]
            },
            contents: [
                ...history,
                {
                    role: 'user',
                    parts: [{ text: prompt }]
                }
            ],
            generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 600,
            }
        };

        const response = await axios.post(
            `${GEMINI_API_URL}?key=${apiKey}`,
            requestBody,
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

        // Tratar erro de "Cota Excedida" (429) de forma amigável
        if (error?.response?.status === 429 || JSON.stringify(error?.response?.data).includes('RESOURCE_EXHAUSTED')) {
            return "⚠️ *Alta demanda:* Estou recebendo muitas mensagens agora! Por favor, aguarde 30 segundos e me chame novamente. ⏳";
        }

        const errorDetails = error?.response?.data ? JSON.stringify(error.response.data) : error.message;
        return `Erro: Ocorreu um erro interno na IA.\nDetalhes: ${errorDetails}`;
    }
}
