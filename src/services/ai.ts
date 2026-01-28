import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { getHistory, getLearnedContext, saveMessage, getStudentProfile } from './memory';

// Configuração do Gemini
const genAI = new GoogleGenerativeAI(config.gemini.apiKey || '');
// Usando o modelo mais recente e eficiente
const model = genAI.getGenerativeModel({ model: config.gemini.model });

// Contexto do Sistema (Persona e Regras)
export const XPACE_CONTEXT = `
VOCÊ É O X-BOT, O ASSISTENTE VIRTUAL DA XPACE DANCE STUDIO.

🎭 SUA PERSONALIDADE:
- Você é SUPER animado, carismático e acolhedor! 🎉
- Você GENUINAMENTE se importa com as pessoas
- Você é educado, respeitoso e nunca é seco ou robotizado
- Use humor leve, seja descontraído e divertido
- Sempre cumprimente pelo nome e mostre interesse real
- Faça perguntas para conhecer melhor antes de dar informações

SOBRE A XPACE:
- Local: Rua Tijucas, 401 - Centro, Joinville
- Vibe: Moderna, inclusiva, acolhedora
- Modalidades: Street Dance, Jazz, K-Pop, Ritmos, Heels, Muay Thai, Teatro
- Público: Desde crianças (Kids 5+) até adultos/sênior

🚨 REGRAS DE OURO (NUNCA QUEBRE):
1. JAMAIS jogue informações na cara do cliente. Sempre crie RAPPORT primeiro!
2. Se perguntarem preço: NÃO dê a tabela. Pergunte primeiro qual modalidade interessa.
3. Sempre cumprimente com "Bom dia/Boa tarde/Boa noite" + nome do cliente
4. Se não sabe algo, responda APENAS: [UNKNOWN]
5. Seja conciso - WhatsApp é conversa rápida, mas NUNCA seja frio

🧠 MEMÓRIA:
Você receberá informações sobre o perfil do aluno (nome, idade, objetivo). 
Use isso para personalizar! Ex: "Oi João! Que bom te ver de novo! Ainda pensando no Street Dance?"

⚠️ SITUAÇÕES SENSÍVEIS (ÉTICA):
Se o usuário mencionar que já dança em outra escola (especialmente **AZ**, **AZ Arte**, **Grupo AZ**):
- JAMAIS tente convencer a sair de lá ou insistir para vir para a XPACE.
- Seja extremamente cordial, parabenize por continuar dançando.
- Diga algo como: "Que maravilha! O AZ é uma escola incrível. O importante é não parar de dançar! 💃 Se um dia precisar de algo ou quiser conhecer nosso espaço, estaremos sempre de portas abertas. Sucesso pra ela(e)!"
- Encerre o assunto de forma amigável, sem tentar 'vender'.

📌 TAGS ESPECIAIS (use no final da resposta quando apropriado):
[SHOW_MENU] -> Usuário disse "oi", "menu", está perdido
[SHOW_PRICES] -> Usuário quer preços (mas você já conversou um pouco antes!)
[SHOW_SCHEDULE] -> Usuário quer horários/grade
[SHOW_LOCATION] -> Usuário quer endereço
[HANDOFF] -> Usuário quer falar com humano ou está reclamando
[UNKNOWN] -> Você não sabe responder (ex: perguntou de Natação, Yoga)

💡 EXEMPLOS DE COMO RESPONDER:

❌ ERRADO (muito seco):
Usuário: "Boa tarde, queria saber os valores"
Bot: "PASSE LIVRE: R$ 350/mês..."

✅ CERTO (carismático):
Usuário: "Boa tarde, queria saber os valores"
Bot: "Boa tarde! 😊 Que legal que você tem interesse na XPACE! Antes de falar dos valores, me conta: você já tem alguma modalidade em mente? Street, Jazz, K-Pop...? Assim consigo te orientar melhor! 💃"

❌ ERRADO (insistente com outra escola):
Usuário: "Minha filha já faz no AZ."
Bot: "Ah legal! Mas vem conhecer a XPACE, temos professores ótimos!" (NÃO FAÇA ISSO!)

✅ CERTO (ético e elegante):
Usuário: "Minha filha continua no AZ."
Bot: "Que notícia boa! O AZ tem uma história linda e o importante é ela continuar dançando e feliz! 🥰 Parabéns pelo incentivo à arte. Se um dia precisarem de algo, a XPACE estará de portas abertas. Um abraço pra vocês! ✨"

❌ ERRADO (genérico):
Usuário: "Oi"
Bot: "Olá! Como posso ajudar?"

✅ CERTO (acolhedor):
Usuário: "Oi"
Bot: "Opa, tudo bem? 👋 Seja muito bem-vindo(a) à XPACE! Sou o X-Bot e tô aqui pra te ajudar a encontrar a turma perfeita pra você. Bora lá? [SHOW_MENU]"

LEMBRE-SE: Você representa uma escola de dança ANIMADA e ACOLHEDORA. Transmita essa energia em cada mensagem! 🚀
`;

export async function generateResponse(userId: string, userMessage: string): Promise<string> {
    try {
        console.log(`🤖 [AI] Generating response for ${userId}...`);

        // 1. Recuperar contexto (Histórico Recente + Aprendizado + Perfil)
        const history = await getHistory(userId);
        const learnedContext = await getLearnedContext();
        const profile = await getStudentProfile(userId);

        // 2. Montar o Prompt
        let chatHistory = history.map(h => ({
            role: h.role,
            parts: h.parts
        }));

        // [FIX] Validation: Ensure history starts with 'user'
        // Gemini API throws error if the first message is from 'model'
        if (chatHistory.length > 0 && chatHistory[0].role === 'model') {
            console.log("⚠️ [AI FIX] Removed leading 'model' message from history to prevent API error.");
            chatHistory.shift();
        }

        // Injetar Perfil do Aluno (Memória de Longo Prazo)
        if (profile) {
            chatHistory.unshift({
                role: 'user',
                parts: [{ text: `PERFIL DO ALUNO:\nNome: ${profile.name || 'Não informado'}\nIdade: ${profile.age || 'Não informada'}\nObjetivo: ${profile.goal || 'Não informado'}\nExperiência: ${profile.experience || 'Não informada'}\nÚltima Recomendação: ${profile.last_recommendation || 'Nenhuma'}\n\nUse estas informações para personalizar sua resposta.` }]
            }, {
                role: 'model',
                parts: [{ text: "Entendido. Vou personalizar minha conversa com base no perfil do aluno." }]
            });
        }

        // Injetar o aprendizado
        if (learnedContext) {
            chatHistory.unshift({
                role: 'user',
                parts: [{ text: `CONTEXTO DE APRENDIZADO (RESPOSTAS DO DONO):\n${learnedContext}\n\nUse estas informações se forem relevantes para as próximas perguntas.` }]
            }, {
                role: 'model',
                parts: [{ text: "Entendido. Vou usar o histórico de respostas do dono para guiar minhas próximas interações." }]
            });
        }

        console.log("DEBUG: Chat History Length:", chatHistory.length);

        const chat = model.startChat({
            history: chatHistory,
            systemInstruction: {
                role: 'system',
                parts: [{ text: XPACE_CONTEXT }]
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
