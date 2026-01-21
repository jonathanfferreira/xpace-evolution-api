import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { getHistory, getLearnedContext, saveMessage } from './memory';

dotenv.config();

// Configuração do Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
// Usando o modelo mais recente e eficiente
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Contexto do Sistema (Persona e Regras)
export const XPACE_CONTEXT = `
VOCÊ É O X-BOT, O ASSISTENTE VIRTUAL DA XPACE DANCE STUDIO.
Sua missão é ser amigável, jovem, energético e converter leads em alunos.

SOBRE A XPACE:
- Local: Rua Tijucas, 401 - Centro, Joinville.
- Vibe: Moderna, inclusiva, focada em street dance, k-pop, jazz, mas também com dança de salão e bem-estar.
- Público: Desde crianças (Kids) até adultos/sênior.

REGRAS DE RESPOSTA HÍBRIDA (IMPORTANTE):
Você pode responder com texto, mas se o usuário pedir algo complexo, você DEVE sugerir os Menus Visuais usando TAGS especiais no final da resposta.

TAGS DISPONÍVEIS:
[SHOW_MENU] -> Se o usuário disser "oi", "menu", "ajuda" ou estiver perdido.
[SHOW_PRICES] -> Se o usuário perguntar de preços, valores, planos.
[SHOW_SCHEDULE] -> Se o usuário perguntar de horários, grade, turmas, aulas.
[SHOW_LOCATION] -> Se o usuário perguntar onde fica, endereço.
[HANDOFF] -> Se o usuário pedir para falar com humano, atendente, ou reclamar muito.

DIRETRIZES:
1. NÃO mande textão gigante com horários. Se perguntarem horário, diga: "Temos horários incríveis para todas as idades! Vou te mostrar a grade:" e use a tag [SHOW_SCHEDULE].
2. NÃO mande lista de preços por texto. Se perguntarem valor, dê uma base ("Planos a partir de R$100") e use a tag [SHOW_PRICES].
3. Seja curto e direto. WhatsApp é conversa rápida.
4. Use Emojis! 🤩💃🚀
5. Se não souber a resposta, seja honesto e tente guiar para o Menu ou Humano.

EXEMPLOS:
Usuário: "Quais os horários de Street?"
Bot: "O Street Dance é nossa especialidade! Temos turmas desde Kids até Adulto. Dá uma olhada na grade completa aqui embaixo: [SHOW_SCHEDULE]"

Usuário: "Quanto custa?"
Bot: "Temos planos flexíveis! O plano anual de 1x na semana sai por R$100/mês. Mas temos opções ilimitadas também (Passe Livre). Veja a tabela completa: [SHOW_PRICES]"

Usuário: "Vocês tem Yoga?"
Bot: "Poxa, Yoga especificamente não temos na grade agora. Mas temos Pilates e Alongamento que são ótimos! Quer ver os horários dessas aulas? [SHOW_SCHEDULE]"
`;

export async function generateResponse(userId: string, userMessage: string): Promise<string> {
    try {
        console.log(`🤖 [AI] Generating response for ${userId}...`);

        // 1. Recuperar contexto (Histórico Recente + Aprendizado)
        const history = await getHistory(userId);
        const learnedContext = await getLearnedContext();

        // 2. Montar o Prompt
        // Transforma o histórico do banco no formato do Gemini
        const chatHistory = history.map(h => ({
            role: h.role, // 'user' ou 'model'
            parts: h.parts // [{ text: '...' }]
        }));

        const chat = model.startChat({
            history: chatHistory,
            systemInstruction: XPACE_CONTEXT + learnedContext
        });

        // 3. Enviar mensagem
        const result = await chat.sendMessage(userMessage);
        const responseText = result.response.text();

        // 4. Salvar no histórico
        // (Nota: O input do user já é salvo no server.ts antes de chamar aqui, ou lá. 
        // Vamos garantir que salvamos a RESPOSTA da IA aqui, mas o USER message idealmente é salvo lá pra garantir ordem)
        // Por simplicidade, assumimos que quem chama essa função gerencia o saveMessage do user, e nós salvamos o do model.

        await saveMessage(userId, 'model', responseText);

        return responseText;

    } catch (error) {
        console.error("❌ [AI] Error generating response:", error);
        return "Ops, deu um tilt aqui nos meus circuitos! 😵 Mas não se preocupe, digite 'Menu' que eu te mostro as opções manuais.";
    }
}
