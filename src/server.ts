import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { getHistory, saveMessage, clearHistory, getFlowState, saveFlowState, deleteFlowState } from './services/memory';
import { generateResponse, XPACE_CONTEXT } from './services/ai';
import { sendMessage, sendProfessionalMessage, sendList, sendMedia, sendPresence, sendReaction, sendLocation } from './services/whatsapp';
import { addLabelToConversation } from './services/chatwoot';


dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Configurações de Sócios
const SOCIOS = {
    ALCEU: '554791700812@s.whatsapp.net',
    RUAN: '554799463474@s.whatsapp.net',
    JHONNEY: '554784970324@s.whatsapp.net'
};

app.use(bodyParser.json());

// Helpers
function isGreeting(text: string): boolean {
    const greetings = ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'menu', 'iniciar', 'start', 'começar'];
    return greetings.some(greeting => text.toLowerCase().includes(greeting));
}

function isLocationRequest(text: string): boolean {
    const keywords = ['localização', 'onde fica', 'endereço', 'localizacao', 'como chego', 'rua', 'mapa'];
    return keywords.some(keyword => text.toLowerCase().includes(keyword));
}

// Funções de Notificação para Sócios
async function notifySocios(intent: string, userInfo: any) {
    let text = "";
    if (intent.startsWith("👁️")) {
        text = `🚨 *ALERTA DE LEITURA (XPACE)*\n\n${intent}\nAluno: ${userInfo.name || userInfo.jid}`;
    } else {
        text = `🚨 *ALERTA XPACE-BOT*\n\nUm aluno demonstrou forte interesse em: *${intent}*\nDe: ${userInfo.name || userInfo.jid}\n\nFavor entrar em contato!`;
    }

    // Notifica todos (ou apenas Alceu/Ruan/Jhonney como configurado)
    await sendMessage(SOCIOS.ALCEU, text);
    // await sendMessage(SOCIOS.RUAN, text); 
    // await sendMessage(SOCIOS.JHONNEY, text);
}

// Log every request to console
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Verifica se o servidor está rodando
app.get('/health', (req: Request, res: Response) => {
    res.status(200).send('XPACE WhatsApp Bot is running!');
});

// Enable CORS for Website Integration
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    next();
});

// ----------------------------------------------------
// 🚀 INTEGRAÇÃO COM SITE (Novo Endpoint)
// ----------------------------------------------------
app.post('/api/lead', async (req: Request, res: Response) => {
    try {
        const { name, phone, intent, unit } = req.body;

        console.log(`[SITE LEAD] Novo lead recebido: ${name} (${phone}) - ${intent}`);

        // 1. Formata o telefone para o padrão do WhatsApp (55 + DDD + 9 + Numero)
        // Remove tudo que não for número
        let cleanPhone = phone.toString().replace(/\D/g, '');

        // Se começar com 0, remove
        if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);

        // Adiciona 55 se não tiver
        if (!cleanPhone.startsWith('55')) cleanPhone = '55' + cleanPhone;

        // Adiciona @s.whatsapp.net
        const jid = cleanPhone + '@s.whatsapp.net';

        // 2. Envia mensagem de boas-vindas para o Lead
        const firstName = name.split(' ')[0];

        let welcomeMsg = "";
        if (intent === 'enrollment' || intent === 'matricula') {
            welcomeMsg = `Olá, ${firstName}! 👋\n\nVi que você se interessou pela matrícula na XPACE pelo nosso site. 🤩\n\nEu sou o X-Bot e posso tirar todas as suas dúvidas agora mesmo. Quer ver os planos ou horários?`;
        } else if (intent === 'doubt') {
            welcomeMsg = `Olá, ${firstName}! 👋\n\nRecebemos seu contato pelo site. Como posso ajudar com sua dúvida?`;
        } else {
            welcomeMsg = `Oi, ${firstName}! 👋\n\nObrigado pelo contato no site da XPACE. Logo nossa equipe vai te responder, mas se quiser agilizar, pode falar comigo por aqui!`;
        }

        await sendMessage(jid, welcomeMsg);

        // 3. Notifica os Sócios do Lead Quente
        await notifySocios(`🚀 NOVO LEAD DO SITE: ${intent}\nNome: ${name}\nTel: ${phone}`, { jid, name });

        // 4. Salva estado inicial se necessário (Opcional - já coloca no menu)
        // await saveFlowState(jid, 'MENU_MAIN'); 

        res.status(200).json({ success: true, message: 'Lead processed' });

    } catch (error) {
        console.error('Erro ao processar lead do site:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// Queue para processar mensagens sequencialmente por usuário
const messageQueues = new Map<string, Promise<void>>();

// Webhook Reception (Evolution API)
// Cache simples para evitar processamento duplicado (Message ID -> Timestamp)
const processedMessages = new Map<string, number>();

// Limpeza automática do cache a cada 1 hora
setInterval(() => {
    const now = Date.now();
    for (const [key, time] of processedMessages) {
        if (now - time > 60000) processedMessages.delete(key);
    }
}, 3600000);

// Webhook Reception (Evolution API)
app.post('/webhook', async (req: Request, res: Response) => {
    const body = req.body;
    const event = body.event?.toLowerCase();

    // ----------------------------------------------------
    // 👁️ DETECÇÃO DE LEITURA (messages.update)
    // ----------------------------------------------------
    if (event === 'messages.update' || event === 'messages_update') {
        const data = body.data;
        if (data && data.status === 'READ') {
            const from = data.key.remoteJid;

            // Só nos importamos se não for mensagem de grupo (status broadcast)
            if (from.includes('@g.us')) return;

            // Verifica o estado atual do usuário
            const currentState = await getFlowState(from);

            // Se o usuário estiver nessas etapas CRÍTICAS, notificamos!
            if (currentState) {
                const step = currentState.step;
                const pushName = (body.instanceData?.user || "Aluno").split(' ')[0];

                if (step === 'VIEW_MODALITY_DETAILS' || step === 'SELECT_MODALITY') {
                    console.log(`[READ RECEIPT] ${from} visualizou Detalhes/Agendamento!`);
                    await notifySocios(`👁️ Lead [${pushName}] visualizou o Link de Agendamento/Detalhes!`, { jid: from, name: pushName });
                }

                if (step === 'MENU_MAIN') {
                    // Opcional: Notificar se viu preços? Fica a critério.
                    // Apenas logar por enquanto
                    console.log(`[READ RECEIPT] ${from} visualizou o Menu Principal.`);
                }
            }
        }
        res.sendStatus(200);
        return;
    }


    // ----------------------------------------------------
    // 📞 CHAMADAS (call) - Secretária Eletrônica
    // ----------------------------------------------------
    if (event === 'call') {
        const data = body.data;
        // status pode ser 'offer', 'ringing', etc.
        // Geralmente 'offer' é quando chama.
        console.log(`[CALL] Incoming call from ${data.id}`);

        // Extrair o JID de quem ligou (pode vir como 'from' ou dentro de 'data')
        // Na v2 geralmente é data.id (que é o remoteJid)
        const callerJid = data.id || data.from;

        if (callerJid && !callerJid.includes('@g.us')) {
            await sendProfessionalMessage(callerJid,
                "🤖 *Atendimento Automático*\n\n" +
                "Oi! Eu sou o X-Bot virtual e não consigo atender chamadas de voz/vídeo. 📵\n\n" +
                "Por favor, *envie sua dúvida por texto ou áudio aqui no chat* que eu te respondo na hora! ⚡"
            );
        }
        res.sendStatus(200);
        return;
    }

    // ----------------------------------------------------
    // ⌨️ PRESENÇA (presence.update) - "Digitando..."
    // ----------------------------------------------------
    if (event === 'presence.update' || event === 'presence_update') {
        const data = body.data;
        // data = { id: '...', presences: { '...': { lastKnownPresence: 'composing' } } }
        if (data.presences) {
            const from = Object.keys(data.presences)[0];
            const presence = data.presences[from]?.lastKnownPresence;

            if (presence === 'composing' || presence === 'recording') {
                console.log(`[PRESENCE] ${from} is ${presence}...`);
                // Futuro: Se parar de digitar por X tempo sem enviar msg, disparar recovery.
            }
        }
        res.sendStatus(200);
        return;
    }

    if (event !== 'messages.upsert' && event !== 'messages_upsert') {
        res.sendStatus(200);
        return;
    }

    const data = body.data;
    const messageId = data.key.id;

    // DEDUPLICAÇÃO: Se já processamos essa mensagem nos últimos 10s, ignora
    if (processedMessages.has(messageId)) {
        console.log(`[DEDUPLICATED] Message ID ${messageId} already processed.`);
        res.sendStatus(200);
        return;
    }
    processedMessages.set(messageId, Date.now());

    // LOG COMPLETO PARA DEBUG
    console.log('>>> FULL WEBHOOK PAYLOAD:', JSON.stringify(body, null, 2));

    if (data.key.fromMe) {
        res.sendStatus(200);
        return;
    }

    const from = data.key.remoteJid;

    // Adiciona o processamento à fila do usuário
    const processMessage = async () => {
        try {
            const pushName = (body.instanceData?.user || "Aluno").split(' ')[0];
            const messageKey = data.key;

            // 1. EXTRAÇÃO DA MENSAGEM
            let msgBody = data.message?.conversation ||
                data.message?.extendedTextMessage?.text ||
                data.message?.buttonsResponseMessage?.selectedDisplayText ||
                data.message?.listResponseMessage?.title;

            // Converter para string normal, caso seja "RowId" da lista
            let selectedRowId = data.message?.listResponseMessage?.singleSelectReply?.selectedRowId;

            if (msgBody || selectedRowId) {
                console.log(`[${from}] Msg: "${msgBody}" | RowID: ${selectedRowId}`);

                // ----------------------------------------------------
                // 🛑 COMANDOS DE DEBUG/RESET (Prioridade Total)
                // ----------------------------------------------------
                if (msgBody?.toLowerCase().trim() === '/reset') {
                    await clearHistory(from);
                    await deleteFlowState(from);
                    await sendProfessionalMessage(from, "♻️ Tudo limpo! Memória e Fluxo reiniciados.");
                    return;
                }
                if (msgBody?.toLowerCase().trim() === '/debug') {
                    const state = await getFlowState(from);
                    await sendProfessionalMessage(from, `🐛 *DEBUG* 🐛\nFlow State: ${JSON.stringify(state || 'null')}`);
                    return;
                }

                // ----------------------------------------------------
                // 🌐 INTERCEPTAÇÃO: MENSAGEM DO SITE (Fallback)
                // ----------------------------------------------------
                // Se o usuário clicou no link "Enviar no WhatsApp" do site, o texto vem padronizado.
                // Devemos tratar isso como um Lead do Site, e não deixar cair no "dança" genérico.
                // ----------------------------------------------------
                // 🌐 INTERCEPTAÇÃO: GRADE DE HORÁRIOS (Botão do Card)
                // ----------------------------------------------------
                // Texto: "Olá! Vi a aula de *Street Dance Kids* de *SEGUNDA às 08:00* no site..."
                if (msgBody?.includes('Vi a aula de') || msgBody?.includes('agendar uma experimental')) {
                    console.log(`[SCHEDULE LEAD] Detectado click na Grade de Horários: ${from}`);

                    const firstName = pushName;

                    // Tenta identificar a modalidade no meio do texto
                    const lowerMsg = msgBody.toLowerCase();
                    let targetModality = "";

                    if (lowerMsg.includes('street') || lowerMsg.includes('urbana') || lowerMsg.includes('funk')) targetModality = 'street';
                    else if (lowerMsg.includes('jazz') || lowerMsg.includes('contempor')) targetModality = 'jazz';
                    else if (lowerMsg.includes('k-pop') || lowerMsg.includes('kpop')) targetModality = 'kpop';
                    else if (lowerMsg.includes('ritmos') || lowerMsg.includes('ballet')) targetModality = 'ritmos';
                    else if (lowerMsg.includes('teatro') || lowerMsg.includes('acrobacia')) targetModality = 'teatro';
                    else if (lowerMsg.includes('heels') || lowerMsg.includes('salto')) targetModality = 'heels';
                    else if (lowerMsg.includes('luta') || lowerMsg.includes('muay') || lowerMsg.includes('jiu')) targetModality = 'lutas';
                    else if (lowerMsg.includes('populares') || lowerMsg.includes('culture') || lowerMsg.includes('hall')) targetModality = 'populares';
                    else if (lowerMsg.includes('salao') || lowerMsg.includes('salão') || lowerMsg.includes('gafieira')) targetModality = 'salao';

                    console.log(`[SCHEDULE DEBUG] Msg: "${lowerMsg}" | Target: "${targetModality}"`);

                    if (targetModality) {
                        await sendProfessionalMessage(from, `Olá, ${firstName}! 👋\n\nQue legal que você se interessou pela aula da grade! 🤩`);

                        // Reaproveita a lógica de exibir detalhes
                        // Simula o comportamento do "NOVA MENSAGEM DO SITE" redirecionando internamente
                        // Para evitar duplicar código, poderíamos refatorar, mas vamos manter simples por agora.

                        let details = "";
                        if (targetModality === 'street') details = "👟 *DANÇAS URBANAS (Street & Funk)*\n\nA alma da XPACE! 🧢\n\n*KIDS (6+ anos)*\n▫️ Seg/Qua 08:00 (XPERIENCE)\n▫️ Seg/Qua 14:30 (XLAB)\n▫️ Seg/Qua 19:00 (XCORE)\n\n*TEENS (12+ anos) & INICIANTE*\n▫️ Ter/Qui 09:00 — Teens (XPERIENCE)\n▫️ Ter/Qui 14:30 — Iniciante (XLAB)\n▫️ Seg/Qua 19:00 — Junior (XPERIENCE)\n\n*ADULTO (16/18+)*\n▫️ Seg/Qua 20:00 — Sênior (XPERIENCE)\n▫️ Ter/Qui 21:00 — Iniciante (XLAB)\n▫️ Sex 19:00 — Iniciante (XPERIENCE)\n▫️ Sáb 10:00 — Geral (XPERIENCE)\n\n*STREET FUNK (15+)*\n▫️ Sex 20:00 — Geral (XPERIENCE)";
                        if (targetModality === 'jazz') details = "🦢 *JAZZ & CONTEMPORÂNEO*\n\nTécnica, expressão e movimento. ✨\n\n*JAZZ FUNK (15+)*\n▫️ Ter 19:00 (XLAB)\n▫️ Sáb 09:00 (XPERIENCE)\n\n*JAZZ TÉCNICO*\n▫️ Seg/Qua 20:00 — 12+ (XCORE)\n▫️ Seg/Qua 21:00 — 18+ (XPERIENCE)\n▫️ Sáb 09:00 — 6+ (XLAB)\n\n*CONTEMPORÂNEO (12+)*\n▫️ Seg/Qua 19:00 (XLAB)";
                        if (targetModality === 'kpop') details = "🇰🇷 *K-POP*\n\nCoreografias dos seus idols favoritos!\n\n*TURMAS (12+)*\n▫️ Ter/Qui 20:00 (XTAGE)";
                        if (targetModality === 'heels') details = "👠 *HEELS (DANÇA NO SALTO)*\n\nEmpoderamento e atitude nas alturas!\n\n*TURMAS REGULARES (15+)*\n▫️ Qui 19:00 (XLAB)\n▫️ Sáb 11:00 (XPERIENCE)\n\n*CIA HEELS (Grupo de Estudo)*\n▫️ Sáb 14:00 (XPERIENCE)";
                        if (targetModality === 'ritmos') details = "💃 *RITMOS & BALLET*\n\nMix de danças para suar e se divertir! (15+)\n\n▫️ Seg/Qua 19:00 (XTAGE)\n▫️ Ter/Qui 19:00 (XCORE)\n\n*BALLET (3+ e Adulto)*\n▫️ Consulte grade completa.";
                        if (targetModality === 'teatro') details = "🎭 *TEATRO & ACROBACIA*\n\n*TEATRO*\n▫️ Seg/Qua 09:00 — 12+ (XPERIENCE)\n▫️ Seg/Qua 15:30 — 15+ (XLAB)\n\n*ACROBACIAS (12+)*\n▫️ Seg/Qua 20:00 (XTAGE)";
                        if (targetModality === 'lutas') details = "🥊 *LUTAS*\n\n*MUAY THAI (12+)*\n▫️ Ter/Qui 19:00 (XTAGE)\n\n*JIU JITSU (6+)*\n▫️ Sex 19:00 (XLAB)";
                        if (targetModality === 'populares') details = "🇧🇷 *DANÇAS POPULARES & INTERNACIONAIS*\n\nCultura e movimento!\n\n*DANÇAS POPULARES (12+)*\n▫️ Seg/Qua 14:00 (XPERIENCE)\n▫️ Sáb 14:30 (XTAGE) - Cia\n\n*DANCEHALL / SALÃO (15+)*\n▫️ Sáb 14:30 e 15:30 (XLAB)";
                        if (targetModality === 'salao') details = "💃 *DANÇA DE SALÃO*\n\nPara dançar junto e se conectar!\n\n*TURMA REGULAR (18+)*\n▫️ Ter 20:00 (XLAB)\n\n*SALÃO / DANCEHALL (15+)*\n▫️ Sáb 14:30 e 15:30 (XLAB)";

                        await sendProfessionalMessage(from, details);
                        await saveFlowState(from, 'VIEW_MODALITY_DETAILS', { viewing: targetModality });

                        setTimeout(async () => {
                            await sendList(from, "Próximos Passos", "Gostou dos horários?", "O QUE FAZER?", [
                                { title: "Ações", rows: [{ id: "final_booking", title: "📅 Agendar Aula", description: "Quero experimentar!" }, { id: "menu_menu", title: "🔙 Ver outras opções", description: "Voltar ao menu" }] }
                            ]);
                        }, 2000);

                        await notifySocios(`🚀 NOVO LEAD DA GRADE: ${msgBody}\nDe: ${pushName}`, { jid: from, name: pushName });
                        return;
                    }
                }

                // ----------------------------------------------------
                // 🌐 INTERCEPTAÇÃO: MENSAGEM DO SITE (Fallback)
                // ----------------------------------------------------
                if (msgBody?.includes('NOVA MENSAGEM DO SITE')) {
                    console.log(`[SITE FALLBACK] Detectado texto do site vindo de ${from}`);

                    const firstName = pushName;

                    // Extrair a mensagem real do usuário (pós "Mensagem:")
                    const parts = msgBody.split('*Mensagem:*');
                    const userMessage = parts.length > 1 ? parts[1].trim() : "";

                    // 1. Tenta identificar Modalidade Direta
                    const lowerMsg = userMessage.toLowerCase();
                    let targetModality = "";

                    if (lowerMsg.includes('street') || lowerMsg.includes('urbana') || lowerMsg.includes('funk')) targetModality = 'street';
                    else if (lowerMsg.includes('jazz') || lowerMsg.includes('contempor')) targetModality = 'jazz';
                    else if (lowerMsg.includes('k-pop') || lowerMsg.includes('kpop')) targetModality = 'kpop';
                    else if (lowerMsg.includes('ritmos') || lowerMsg.includes('ballet')) targetModality = 'ritmos';
                    else if (lowerMsg.includes('teatro') || lowerMsg.includes('acrobacia')) targetModality = 'teatro';
                    else if (lowerMsg.includes('heels') || lowerMsg.includes('salto')) targetModality = 'heels';
                    else if (lowerMsg.includes('luta') || lowerMsg.includes('muay') || lowerMsg.includes('jiu')) targetModality = 'lutas';
                    else if (lowerMsg.includes('populares') || lowerMsg.includes('culture') || lowerMsg.includes('hall')) targetModality = 'populares';
                    else if (lowerMsg.includes('salao') || lowerMsg.includes('salão') || lowerMsg.includes('gafieira')) targetModality = 'salao';

                    if (targetModality) {
                        // 🎯 MATCH! Usuário já sabe o que quer.
                        await sendProfessionalMessage(from, `Olá, ${firstName}! 👋\n\nVi que você tem interesse em *${targetModality.toUpperCase()}*! Ótima escolha. 🤩`);

                        // Simula seleção de menu e detalhes
                        let details = "";
                        if (targetModality === 'street') details = "👟 *DANÇAS URBANAS (Street & Funk)*\n\nA alma da XPACE! 🧢\n\n*KIDS (6+ anos)*\n▫️ Seg/Qua 08:00 (XPERIENCE)\n▫️ Seg/Qua 14:30 (XLAB)\n▫️ Seg/Qua 19:00 (XCORE)\n\n*TEENS (12+ anos) & INICIANTE*\n▫️ Ter/Qui 09:00 — Teens (XPERIENCE)\n▫️ Ter/Qui 14:30 — Iniciante (XLAB)\n▫️ Seg/Qua 19:00 — Junior (XPERIENCE)\n\n*ADULTO (16/18+)*\n▫️ Seg/Qua 20:00 — Sênior (XPERIENCE)\n▫️ Ter/Qui 21:00 — Iniciante (XLAB)\n▫️ Sex 19:00 — Iniciante (XPERIENCE)\n▫️ Sáb 10:00 — Geral (XPERIENCE)\n\n*STREET FUNK (15+)*\n▫️ Sex 20:00 — Geral (XPERIENCE)";
                        if (targetModality === 'jazz') details = "🦢 *JAZZ & CONTEMPORÂNEO*\n\nTécnica, expressão e movimento. ✨\n\n*JAZZ FUNK (15+)*\n▫️ Ter 19:00 (XLAB)\n▫️ Sáb 09:00 (XPERIENCE)\n\n*JAZZ TÉCNICO*\n▫️ Seg/Qua 20:00 — 12+ (XCORE)\n▫️ Seg/Qua 21:00 — 18+ (XPERIENCE)\n▫️ Sáb 09:00 — 6+ (XLAB)\n\n*CONTEMPORÂNEO (12+)*\n▫️ Seg/Qua 19:00 (XLAB)";
                        if (targetModality === 'kpop') details = "🇰🇷 *K-POP*\n\nCoreografias dos seus idols favoritos!\n\n*TURMAS (12+)*\n▫️ Ter/Qui 20:00 (XTAGE)";
                        if (targetModality === 'heels') details = "👠 *HEELS (DANÇA NO SALTO)*\n\nEmpoderamento e atitude nas alturas!\n\n*TURMAS REGULARES (15+)*\n▫️ Qui 19:00 (XLAB)\n▫️ Sáb 11:00 (XPERIENCE)\n\n*CIA HEELS (Grupo de Estudo)*\n▫️ Sáb 14:00 (XPERIENCE)";
                        if (targetModality === 'ritmos') details = "💃 *RITMOS & BALLET*\n\nMix de danças para suar e se divertir! (15+)\n\n▫️ Seg/Qua 19:00 (XTAGE)\n▫️ Ter/Qui 19:00 (XCORE)\n\n*BALLET (3+ e Adulto)*\n▫️ Consulte grade completa.";
                        if (targetModality === 'teatro') details = "🎭 *TEATRO & ACROBACIA*\n\n*TEATRO*\n▫️ Seg/Qua 09:00 — 12+ (XPERIENCE)\n▫️ Seg/Qua 15:30 — 15+ (XLAB)\n\n*ACROBACIAS (12+)*\n▫️ Seg/Qua 20:00 (XTAGE)";
                        if (targetModality === 'lutas') details = "🥊 *LUTAS*\n\n*MUAY THAI (12+)*\n▫️ Ter/Qui 19:00 (XTAGE)\n\n*JIU JITSU (6+)*\n▫️ Sex 19:00 (XLAB)";
                        if (targetModality === 'populares') details = "🇧🇷 *DANÇAS POPULARES & INTERNACIONAIS*\n\nCultura e movimento!\n\n*DANÇAS POPULARES (12+)*\n▫️ Seg/Qua 14:00 (XPERIENCE)\n▫️ Sáb 14:30 (XTAGE) - Cia\n\n*DANCEHALL / SALÃO (15+)*\n▫️ Sáb 14:30 e 15:30 (XLAB)";
                        if (targetModality === 'salao') details = "💃 *DANÇA DE SALÃO*\n\nPara dançar junto e se conectar!\n\n*TURMA REGULAR (18+)*\n▫️ Ter 20:00 (XLAB)\n\n*SALÃO / DANCEHALL (15+)*\n▫️ Sáb 14:30 e 15:30 (XLAB)";

                        await sendProfessionalMessage(from, details);
                        await saveFlowState(from, 'VIEW_MODALITY_DETAILS', { viewing: targetModality });

                        setTimeout(async () => {
                            await sendList(from, "Próximos Passos", "Gostou dos horários?", "O QUE FAZER?", [
                                { title: "Ações", rows: [{ id: "final_booking", title: "📅 Agendar Aula", description: "Quero experimentar!" }, { id: "menu_menu", title: "🔙 Ver outras opções", description: "Voltar ao menu" }] }
                            ]);
                        }, 2000);

                        await notifySocios(`🚀 NOVO LEAD VIA LINK (JÁ FILTRADO): ${targetModality.toUpperCase()}\nDe: ${pushName}`, { jid: from, name: pushName });
                        return;

                    } else {
                        // 2. Não achou modalidade? Usa a IA para acolher a dúvida específica
                        console.log(`[SITE AI] Gerando resposta inteligente para: ${userMessage}`);
                        await sendPresence(from, 'composing');

                        const aiResponse = await generateResponse(userMessage, [], XPACE_CONTEXT + "\n\nCONTEXTO ATUAL: O usuário acabou de vir do site. Seja breve. Se ele fez uma pergunta, responda. Se só disse 'oi', convide para o menu.");

                        await sendProfessionalMessage(from, aiResponse);
                        await notifySocios(`🚀 NOVO LEAD VIA LINK (DÚVIDA): ${userMessage}\nDe: ${pushName}`, { jid: from, name: pushName });

                        setTimeout(async () => {
                            await sendList(from, "Menu XPACE", "Se preferir, navegue por aqui:", "ABRIR MENU", [
                                { title: "Navegação", rows: [{ id: "menu_dance", title: "💃 Quero Dançar", description: "Ver turmas" }, { id: "menu_prices", title: "💰 Ver Preços", description: "Valores" }, { id: "menu_human", title: "🙋‍♂️ Falar com Humano", description: "Ajuda" }] }
                            ]);
                            await saveFlowState(from, 'MENU_MAIN');
                        }, 4000);
                        return;
                    }
                }

                // ----------------------------------------------------
                // 🟢 1. MENU PRINCIPAL (Gatilhos: Oi, Menu, 0)
                // ----------------------------------------------------
                if (isGreeting(msgBody) || msgBody?.trim() === '0') {
                    await deleteFlowState(from); // Reinicia fluxo

                    await sendReaction(from, messageKey, '👋');

                    await sendList(
                        from,
                        "Bem-vindo à XPACE! 🚀",
                        `Olá, ${pushName}! Sou o X-Bot.\nEscolha uma opção para começarmos:`,
                        "ABRIR MENU",
                        [
                            {
                                title: "Navegação",
                                rows: [
                                    // REORGANIZADO PARA NUMERAÇÃO BATER!
                                    // 1 -> Dançar
                                    // 2 -> Preços
                                    // 3 -> Localização
                                    // 4 -> Humano
                                    { id: "menu_dance", title: "💃 Quero Dançar", description: "Encontre sua turma" },
                                    { id: "menu_prices", title: "💰 Ver Preços", description: "Planos e valores" },
                                    { id: "menu_location", title: "📍 Localização", description: "Endereço e mapa" },
                                    { id: "menu_human", title: "🙋‍♂️ Falar com Humano", description: "Atendimento equipe" }
                                ]
                            }
                        ]
                    );

                    await saveFlowState(from, 'MENU_MAIN');
                    return;
                }

                // ----------------------------------------------------
                // 🔵 2. TRATAMENTO DE ESTADO E ESCOLHAS
                // ----------------------------------------------------
                const currentState = await getFlowState(from);
                const input = (selectedRowId || msgBody?.trim())?.toLowerCase(); // Normaliza para comparação

                // Menu Principal -> Escolha
                if (currentState?.step === 'MENU_MAIN') {

                    // OPÇÃO 1: QUERO DANÇAR
                    if (input === 'menu_dance' || input === '1' || input.includes('dança')) {
                        await sendProfessionalMessage(from, "Que incrível que você quer dançar com a gente! 🤩\n\nPara eu te indicar a turma perfeita, preciso te conhecer um pouquinho melhor.\n\nPrimeiro, *como você gostaria de ser chamado?*");
                        await saveFlowState(from, 'ASK_NAME');
                        addLabelToConversation(from, 'prospect').catch(err => console.error(err));
                        return;
                    }

                    // OPÇÃO 2: VER PREÇOS
                    if (input === 'menu_prices' || input === '2' || input.includes('preço') || input.includes('valor')) {
                        await sendProfessionalMessage(from,
                            `💰 *Investimento XPACE (2026)* 🚀\n\n` +
                            `Escolha o plano que melhor se adapta à sua rotina:\n\n` +
                            `� *PASSE LIVRE (Acesso Total):* R$ 350/mês\n_Faça quantas aulas quiser de qualquer modalidade!_\n\n` +
                            `*PLANOS REGULARES (2x na semana)*\n` +
                            `💎 *Anual:* R$ 165/mês (Melhor Valor)\n` +
                            `💳 *Semestral:* R$ 195/mês\n` +
                            `🎟️ *Mensal:* R$ 215/mês\n\n` +
                            `*TURMAS 1x NA SEMANA*\n` +
                            `💎 *Anual:* R$ 100/mês\n` +
                            `💳 *Semestral:* R$ 115/mês\n` +
                            `🎟️ *Mensal:* R$ 130/mês\n\n` +
                            `_Quer garantir sua vaga?_\n` +
                            `🔗 https://venda.nextfit.com.br/54a0cf4a-176f-46d3-b552-aad35019a4ff/contratos\n\n` +
                            `_Digite 0 para voltar._`
                        );
                        return;
                    }

                    // OPÇÃO 3: LOCALIZAÇÃO
                    if (input === 'menu_location' || input === '3' || input.includes('endereço') || input.includes('local')) {
                        await sendLocation(from, -26.296210, -48.845500, "XPACE", "Rua Tijucas, 401 - Joinville");
                        await sendProfessionalMessage(from, "Estamos no coração de Joinville! 📍\n\n✅ Estacionamento gratuito para alunos.\n✅ Lanchonete e espaço de convivência.\n\n_Digite 0 para voltar._");
                        return;
                    }

                    // OPÇÃO 4: HUMANO
                    if (input === 'menu_human' || input === '4' || input.includes('humano') || input.includes('atendente')) {
                        await sendProfessionalMessage(from, "Entendi, às vezes é bom falar com gente de verdade! 😄\n\nJá notifiquei a equipe (Alceu/Ruan/Jhonney). Em alguns instantes alguém te chama por aqui. ⏳");
                        await notifySocios(`🚨 Humano Solicitado: ${pushName}`, { jid: from, name: pushName });
                        addLabelToConversation(from, 'human_handoff').catch(console.error);
                        return;
                    }
                }

                // Fluxo Dançar: Nome -> Idade
                if (currentState?.step === 'ASK_NAME') {
                    const name = msgBody;
                    if (name && name.length > 2) {
                        await sendProfessionalMessage(from, `Prazer, ${name}! 👋\n\nE qual a sua *idade*? (Isso ajuda a saber se te indico turmas teens, adulto ou kids)`);
                        await saveFlowState(from, 'ASK_AGE', { name });
                        return;
                    }
                }

                // Fluxo Dançar: Idade -> Experiência
                if (currentState?.step === 'ASK_AGE') {
                    const age = msgBody?.replace(/[^0-9]/g, '');
                    if (age && age.length > 0) {
                        const prevData = currentState.data || {};
                        await sendList(
                            from,
                            "Sua Experiência",
                            `Show! Agora sobre a dança... qual seu nível atual?`,
                            "SELECIONAR NÍVEL",
                            [
                                {
                                    title: "Nível",
                                    rows: [
                                        { id: "exp_iniciante", title: "🐣 Nunca dancei", description: "Quero começar do zero" },
                                        { id: "exp_basico", title: "🦶 Tenho uma noção", description: "Já fiz algumas aulas" },
                                        { id: "exp_avancado", title: "🔥 Já danço bem", description: "Nível interm/avançado" }
                                    ]
                                }
                            ]
                        );
                        await saveFlowState(from, 'ASK_EXPERIENCE', { ...prevData, age });
                        return;
                    }
                }

                // Fluxo Dançar: Experiência -> Objetivo
                if (currentState?.step === 'ASK_EXPERIENCE') {
                    if (input?.startsWith('exp_') || ['1', '2', '3'].includes(input || '')) {
                        const exp = input.replace('exp_', '');
                        const prevData = currentState.data || {};
                        await sendList(
                            from,
                            "Seu Objetivo",
                            "Legal! E o que você busca na XPACE hoje?",
                            "SELECIONAR META",
                            [
                                {
                                    title: "Objetivo",
                                    rows: [
                                        { id: "goal_hobby", title: "🎉 Hobby / Diversão", description: "Relaxar, fazer amigos" },
                                        { id: "goal_fitness", title: "💦 Suar a camisa", description: "Exercício físico intenso" },
                                        { id: "goal_pro", title: "🏆 Profissionalizar", description: "Evoluir técnica/carreira" }
                                    ]
                                }
                            ]
                        );
                        await saveFlowState(from, 'ASK_GOAL', { ...prevData, experience: exp });
                        // Tag experience
                        addLabelToConversation(from, exp).catch(console.error);
                        return;
                    }
                }

                // Fluxo Dançar: Objetivo -> Recomendação + Drill Down
                if (currentState?.step === 'ASK_GOAL') {
                    if (input?.startsWith('goal_') || ['1', '2', '3'].includes(input || '')) {
                        const goal = input.replace('goal_', '');
                        const prevData = currentState.data || {};
                        const { name, age, experience } = prevData;

                        const userProfile = `[Perfil Aluno: Nome=${name}, Idade=${age}, Nível=${experience}, Objetivo=${goal}]`;
                        await saveMessage(from, 'user', userProfile);

                        let recs = [];
                        if (experience === 'iniciante') {
                            recs = ['Start Dance (Iniciante)', 'K-Pop', 'Dança de Salão'];
                        } else {
                            recs = ['Urban Dance', 'Jazz Funk', 'Heels'];
                        }

                        await sendList(
                            from,
                            "Suas Recomendações 📋",
                            `Perfil analisado com sucesso, ${name}! 🕵️‍♂️\n\nCom base no que me contou, estas turmas são perfeitas para você:\n\n` +
                            recs.map(r => `• *${r}*`).join('\n') +
                            `\n\n👇 *Selecione uma modalidade abaixo para ver detalhes (vídeo/horário):*`,
                            "VER DETALHES",
                            [
                                {
                                    title: "Modalidades",
                                    rows: [
                                        { id: "mod_street", title: "👟 Street / Urban", description: "Estilo urbano e intenso" },
                                        { id: "mod_jazz", title: "🦢 Jazz / Contemp.", description: "Técnica e expressão" },
                                        { id: "mod_kpop", title: "🇰🇷 K-Pop", description: "Coreografias dos idols" },
                                        { id: "mod_ritmos", title: "💃 Ritmos & Ballet", description: "Mix, Ballet e mais" },
                                        { id: "mod_teatro", title: "🎭 Teatro", description: "Interpretação e arte" },
                                        { id: "mod_outros", title: "✨ Especiais", description: "Acrobacia e Populares" },
                                        { id: "final_booking", title: "✅ Já quero agendar!", description: "Ir para matrícula" }
                                    ]
                                }
                            ]
                        );
                        await saveFlowState(from, 'SELECT_MODALITY', { ...prevData, goal });
                        // Tag Goal e Lead Quente
                        addLabelToConversation(from, goal).catch(console.error);
                        addLabelToConversation(from, 'hot_lead').catch(console.error);
                        return;
                    }
                }

                // Fluxo Detalhes da Modalidade
                if (currentState?.step === 'SELECT_MODALITY') {
                    // Mapeamento numérico para modalidades
                    const modalityMap: { [key: string]: string } = {
                        '1': 'street',
                        '2': 'jazz',
                        '3': 'kpop',
                        '4': 'ritmos',
                        '5': 'teatro',
                        '6': 'outros',
                        '7': 'final_booking'
                    };

                    let mod = input || '';
                    if (modalityMap[mod]) {
                        mod = modalityMap[mod];
                    } else if (mod.startsWith('mod_')) {
                        mod = mod.replace('mod_', '');
                    }

                    if (mod === 'final_booking') {
                        await sendProfessionalMessage(from,
                            "Ótima escolha! Vamos agendar sua aula experimental. 📅\n\n" +
                            "Acesse nossa agenda oficial aqui:\n" +
                            "👉 https://agendamento.nextfit.com.br/f9b1ea53-0e0e-4f98-9396-3dab7c9fbff4\n\n" +
                            "Te esperamos na XSpace! Qualquer dúvida, é só chamar. 😉"
                        );
                        await deleteFlowState(from);
                        addLabelToConversation(from, 'conversion_booked').catch(console.error);
                        return;
                    }

                    if (['street', 'jazz', 'kpop', 'ritmos', 'teatro', 'outros', 'heels', 'ballet', 'lutas', 'salao'].includes(mod)) {
                        addLabelToConversation(from, mod).catch(console.error);
                        let details = "";

                        switch (mod) {
                            case 'street':
                                details = "👟 *DANÇAS URBANAS (Street & Funk)*\n\nA alma da XPACE! 🧢\n\n*KIDS (6+ anos)*\n▫️ Seg/Qua 08:00 (XPERIENCE)\n▫️ Seg/Qua 14:30 (XLAB)\n▫️ Seg/Qua 19:00 (XCORE)\n\n*TEENS (12+ anos) & INICIANTE*\n▫️ Ter/Qui 09:00 — Teens (XPERIENCE)\n▫️ Ter/Qui 14:30 — Iniciante (XLAB)\n▫️ Seg/Qua 19:00 — Junior (XPERIENCE)\n\n*ADULTO (16/18+)*\n▫️ Seg/Qua 20:00 — Sênior (XPERIENCE)\n▫️ Ter/Qui 21:00 — Iniciante (XLAB)\n▫️ Sex 19:00 — Iniciante (XPERIENCE)\n▫️ Sáb 10:00 — Geral (XPERIENCE)\n\n*STREET FUNK (15+)*\n▫️ Sex 20:00 — Geral (XPERIENCE)";
                                break;
                            case 'jazz':
                                details = "🦢 *JAZZ & CONTEMPORÂNEO*\n\nTécnica, expressão e movimento. ✨\n\n*JAZZ FUNK (15+)*\n▫️ Ter 19:00 (XLAB)\n▫️ Sáb 09:00 (XPERIENCE)\n\n*JAZZ TÉCNICO*\n▫️ Seg/Qua 20:00 — 12+ (XCORE)\n▫️ Seg/Qua 21:00 — 18+ (XPERIENCE)\n▫️ Sáb 09:00 — 6+ (XLAB)\n\n*CONTEMPORÂNEO (12+)*\n▫️ Seg/Qua 19:00 (XLAB)";
                                break;
                            case 'kpop':
                            case 'salao': // Juntando K-Pop em estilos se necessário, ou mantendo separado
                                details = "💃 *DANÇA DE SALÃO & ESTILOS*\n\n*K-POP (12+)*\n▫️ Ter/Qui 20:00 (XTAGE)\n\n*DANÇA DE SALÃO (18+)*\n▫️ Ter/Qui 20:00 (XLAB)\n\n*DANCEHALL (15+)*\n▫️ Sáb 14:30 (XLAB)\n\n*DANÇAS POPULARES (12+)*\n▫️ Seg/Qua 14:00 (XPERIENCE)";
                                break;
                            case 'heels':
                                details = "👠 *HEELS (DANÇA NO SALTO)*\n\nEmpoderamento e atitude nas alturas!\n\n*TURMAS REGULARES (15+)*\n▫️ Qui 19:00 (XLAB)\n▫️ Sáb 11:00 (XPERIENCE)\n\n*CIA HEELS (Grupo de Estudo)*\n▫️ Sáb 14:00 (XPERIENCE)";
                                break;
                            case 'ritmos':
                                details = "💃 *RITMOS*\n\nMix de danças para suar e se divertir! (15+)\n\n▫️ Seg/Qua 19:00 (XTAGE)\n▫️ Ter/Qui 19:00 (XCORE)";
                                break;
                            case 'ballet':
                                details = "🩰 *BALLET CLÁSSICO*\n\n*BABY CLASS (3+)*\n▫️ Ter/Qui 15:30 (XLAB)\n\n*BALLET INICIANTE (12+)*\n▫️ Ter/Qui 20:00 (XCORE)";
                                break;
                            case 'teatro':
                                details = "🎭 *TEATRO & ACROBACIA*\n\n*TEATRO*\n▫️ Seg/Qua 09:00 — 12+ (XPERIENCE)\n▫️ Seg/Qua 15:30 — 15+ (XLAB)\n\n*ACROBACIAS (12+)*\n▫️ Seg/Qua 20:00 (XTAGE)";
                                break;
                            case 'lutas':
                                details = "🥊 *LUTAS*\n\n*MUAY THAI (12+)*\n▫️ Ter/Qui 19:00 (XTAGE)\n\n*JIU JITSU (6+)*\n▫️ Sex 19:00 (XLAB)";
                                break;
                            case 'outros':
                                details = "✨ *AULAS ESPECIAIS*\n\n*HEELS (Salto)*\n▫️ Ver categoria Heels\n\n*LUTAS*\n▫️ Muay Thai e Jiu Jitsu\n\n*BALLET*\n▫️ Infantil e Adulto\n\n_Escolha voltar ao menu para ver mais opções!_";
                                break;
                        }

                        await sendProfessionalMessage(from, details);

                        // Atualiza estado para evitar colisão de inputs (1=Street vs 1=Agendar)
                        await saveFlowState(from, 'VIEW_MODALITY_DETAILS', { ...currentState.data, viewing: mod });

                        setTimeout(async () => {
                            await sendList(
                                from,
                                "Mais Opções",
                                "O que mais gostaria de ver?",
                                "ESCOLHER",
                                [
                                    {
                                        title: "Ações",
                                        rows: [
                                            { id: "final_booking", title: "📅 Agendar Aula", description: "Gostei, quero ir!" },
                                            { id: "menu_menu", title: "🔙 Voltar ao Menu", description: "Ver outras opções" }
                                        ]
                                    }
                                ]
                            );
                        }, 2000);
                        return;
                    }
                }

                // Fluxo: Vendo Detalhes -> Ação (Agendar ou Voltar)
                if (currentState?.step === 'VIEW_MODALITY_DETAILS') {
                    if (input === '1' || input === 'final_booking' || input.includes('agendar')) {
                        await sendProfessionalMessage(from,
                            "Ótima escolha! Vamos agendar sua aula experimental. 📅\n\n" +
                            "Acesse nossa agenda oficial aqui:\n" +
                            "👉 https://agendamento.nextfit.com.br/f9b1ea53-0e0e-4f98-9396-3dab7c9fbff4\n\n" +
                            "Te esperamos na XSpace! Qualquer dúvida, é só chamar. 😉"
                        );
                        await deleteFlowState(from);
                        addLabelToConversation(from, 'conversion_booked').catch(console.error);
                        return;
                    }

                    if (input === '2' || input === 'menu_menu' || input.includes('voltar')) {
                        // Deixa cair no bloco abaixo que já trata 'menu_menu' ou chama explicitamente
                        await deleteFlowState(from);
                        await sendList(
                            from,
                            "Menu Principal",
                            "De volta ao início! Como posso ajudar?",
                            "ABRIR MENU",
                            [
                                {
                                    title: "Navegação",
                                    rows: [
                                        { id: "menu_1", title: "💃 Quero Dançar", description: "Encontre sua turma" },
                                        { id: "menu_2", title: "💰 Ver Preços", description: "Planos e valores" },
                                        { id: "menu_3", title: "📍 Localização", description: "Endereço e mapa" },
                                        { id: "menu_4", title: "🙋‍♂️ Falar com Humano", description: "Atendimento equipe" }
                                    ]
                                }
                            ]
                        );
                        await saveFlowState(from, 'MENU_MAIN');
                        return;
                    }
                }

                // Voltar ao Menu
                if (input === 'menu_menu') {
                    await deleteFlowState(from);
                    await sendList(
                        from,
                        "Menu Principal",
                        "De volta ao início! Como posso ajudar?",
                        "ABRIR MENU",
                        [
                            {
                                title: "Navegação",
                                rows: [
                                    { id: "menu_1", title: "💃 Quero Dançar", description: "Encontre sua turma" },
                                    { id: "menu_2", title: "💰 Ver Preços", description: "Planos e valores 2026" },
                                    { id: "menu_3", title: "📍 Localização", description: "Endereço e mapa" },
                                    { id: "menu_4", title: "🙋‍♂️ Falar com Humano", description: "Atendimento equipe" }
                                ]
                            }
                        ]
                    );
                    await saveFlowState(from, 'MENU_MAIN');
                    return;
                }

                // ----------------------------------------------------
                // 🟣 IA HÍBRIDA (Fallback para dúvidas complexas)
                // ----------------------------------------------------
                if (msgBody && msgBody.length > 2 && !input?.startsWith('menu_') && !input?.startsWith('exp_') && !input?.startsWith('goal_') && !input?.startsWith('mod_')) {
                    console.log(`🤖 IA Fallback para: ${msgBody}`);

                    await sendPresence(from, 'composing');

                    // --- AUTOMAÇÃO CHATWOOT INTELIGENTE ---
                    const lowerMsg = msgBody.toLowerCase();

                    // 1. Financeiro (Pix, Boleto, Valor, Pagamento)
                    if (lowerMsg.includes('pix') || lowerMsg.includes('boleto') || lowerMsg.includes('transfer') || lowerMsg.includes('pagamento')) {
                        addLabelToConversation(from, 'financeiro').catch(console.error);
                    }

                    // 2. Urgente (Reclamação, Problema, Erro)
                    if (lowerMsg.includes('reclam') || lowerMsg.includes('problema') || lowerMsg.includes('erro') || lowerMsg.includes('odiei')) {
                        addLabelToConversation(from, 'urgente').catch(console.error);
                        await notifySocios(`🚨 RECLAMAÇÃO/URGENTE`, { jid: from, name: pushName });
                    }

                    // 3. Churn / Cancelamento (Risco de Perda)
                    if (lowerMsg.includes('cancelar') || lowerMsg.includes('sair') || lowerMsg.includes('parar') || lowerMsg.includes('reembolso')) {
                        addLabelToConversation(from, 'churn_risk').catch(console.error);
                        // Opcional: Notificar sócios também?
                        await notifySocios(`⚠️ RISCO DE CHURN/CANCELAMENTO`, { jid: from, name: pushName });
                    }

                    // 4. Elogios (Love)
                    if (lowerMsg.includes('amei') || lowerMsg.includes('adoro') || lowerMsg.includes('incrivel') || lowerMsg.includes('maravilh')) {
                        addLabelToConversation(from, 'love').catch(console.error);
                    }

                    // 5. Dúvidas de Localização
                    if (isLocationRequest(lowerMsg)) {
                        addLabelToConversation(from, 'duvida_local').catch(console.error);
                    }
                    // --------------------------------------

                    const history = await getHistory(from);
                    const aiResponse = await generateResponse(msgBody, history);

                    if (!aiResponse.startsWith("Erro:")) {
                        await saveMessage(from, 'user', msgBody);
                        await saveMessage(from, 'model', aiResponse);
                    }

                    await sendProfessionalMessage(from, aiResponse);
                }
            }

            // Tratamento de Áudio
            if (data.message?.audioMessage) {
                await sendReaction(from, messageKey, '🎧');
                await sendPresence(from, 'recording');
                setTimeout(async () => {
                    await sendProfessionalMessage(from, `Opa, já estou ouvindo seu áudio, ${pushName}! 🏃‍♂️\n(Em breve vou conseguir transcrever o que você disse!)`);
                }, 2000);
            }
        } catch (error) {
            console.error('Erro no webhook:', error);
        }
    };

    // Gerenciamento de Concorrência
    const previousPromise = messageQueues.get(from) || Promise.resolve();
    const currentPromise = previousPromise.then(processMessage);
    messageQueues.set(from, currentPromise);

    currentPromise.catch(() => { }).finally(() => {
        if (messageQueues.get(from) === currentPromise) {
            messageQueues.delete(from);
        }
    });

    res.sendStatus(200);
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
