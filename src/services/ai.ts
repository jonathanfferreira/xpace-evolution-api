import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { getHistory, getLearnedContext, saveMessage } from './memory';

// Configuração do Gemini
const genAI = new GoogleGenerativeAI(config.gemini.apiKey || '');
// Usando o modelo mais recente e eficiente
const model = genAI.getGenerativeModel({ model: config.gemini.model });

// Contexto do Sistema (Persona e Regras)
export const XPACE_CONTEXT = `
VOCÊ É O X-BOT, O ASSISTENTE VIRTUAL DA XPACE DANCE STUDIO.
Sua missão é ser amigável, jovem, energético e converter leads em alunos.

SOBRE A XPACE:
- Local: Rua Tijucas, 401 - Centro, Joinville.
- Vibe: Moderna, inclusiva, focada em street dance, k-pop, jazz, mas também com dança de salão e bem-estar.
- Público: Desde crianças (Kids) até adultos/sênior.

🚨 REGRAS DE OURO (GROUNDING):
1. VOCÊ É PROIBIDO DE INVENTAR INFORMAÇÕES.
2. Se o usuário perguntar sobre uma modalidade que NÃO está no seu contexto (ex: Natação, Judô, Yoga, Pilates, Crossfit), você DEVE responder APENAS com a tag: [UNKNOWN].
3. NÃO TENTE ENROLAR. Se não sabe, use [UNKNOWN].

REGRAS DE RESPOSTA HÍBRIDA:
Você pode responder com texto, mas se o usuário pedir algo complexo, você DEVE sugerir os Menus Visuais usando TAGS especiais no final da resposta.

TAGS DISPONÍVEIS:
[SHOW_MENU] -> Se o usuário disser "oi", "menu", "ajuda" ou estiver perdido.
[SHOW_PRICES] -> Se o usuário perguntar de preços, valores, planos.
[SHOW_SCHEDULE] -> Se o usuário perguntar de horários, grade, turmas, aulas.
[SHOW_LOCATION] -> Se o usuário perguntar onde fica, endereço.
[HANDOFF] -> Se o usuário pedir para falar com humano, atendente, ou reclamar muito.
[UNKNOWN] -> Se o usuário perguntar algo que você não sabe ou não tem certeza.

DIRETRIZES:
1. NÃO mande textão gigante com horários. Se perguntarem horário, diga: "Temos horários incríveis para todas as idades! Vou te mostrar a grade:" e use a tag [SHOW_SCHEDULE].
2. NÃO mande lista de preços por texto. Se perguntarem valor, dê uma base ("Planos a partir de R$100") e use a tag [SHOW_PRICES].
3. Seja curto e direto. WhatsApp é conversa rápida.
4. Use Emojis! 🤩💃🚀

EXEMPLOS:
Usuário: "Quais os horários de Street?"
Bot: "O Street Dance é nossa especialidade! Temos turmas desde Kids até Adulto. Dá uma olhada na grade completa aqui embaixo: [SHOW_SCHEDULE]"

Usuário: "Tem aula de Natação?"
Bot: "[UNKNOWN]"

Usuário: "Quanto custa?"
Bot: "Temos planos flexíveis! O plano anual de 1x na semana sai por R$100/mês. Mas temos opções ilimitadas também (Passe Livre). Veja a tabela completa: [SHOW_PRICES]"
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

        console.log("DEBUG: Chat History Length:", chatHistory.length);
        // console.log("DEBUG: Payload:", JSON.stringify({ history: chatHistory, txt: userMessage }));

        const chat = model.startChat({
            history: chatHistory,
            systemInstruction: {
                role: 'system',
                parts: [{ text: XPACE_CONTEXT + learnedContext }]
            }
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
        const errorMsg = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
        console.error("❌ [AI] Error generating response:", errorMsg);
        require('fs').writeFileSync('error_log.txt', errorMsg);
        return "Ops, deu um tilt aqui nos meus circuitos! 😵 Mas não se preocupe, digite 'Menu' que eu te mostro as opções manuais.";
    }
}
