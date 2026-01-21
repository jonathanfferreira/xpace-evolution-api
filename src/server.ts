import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { getHistory, saveMessage, clearHistory, getFlowState, saveFlowState, deleteFlowState, saveLearnedResponse } from './services/memory';
import { generateResponse } from './services/ai'; // AI Agent Enabled
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
    try {
        const body = req.body;
        const event = body.event?.toLowerCase();

        // ----------------------------------------------------
        // 👁️ DETECÇÃO DE LEITURA (messages.update)
        // ----------------------------------------------------
        if (event === 'messages.update' || event === 'messages_update') {
            const data = body.data;
            if (data && data.status === 'READ') {
                const from = data?.key?.remoteJid;

                if (!from) return; // Proteção contra dados incompletos

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
        const messageId = data?.key?.id;

        if (!messageId) {
            res.sendStatus(200);
            return;
        }

        // DEDUPLICAÇÃO: Se já processamos essa mensagem nos últimos 10s, ignora
        if (processedMessages.has(messageId)) {
            console.log(`[DEDUPLICATED] Message ID ${messageId} already processed.`);
            res.sendStatus(200);
            return;
        }
        processedMessages.set(messageId, Date.now());

        // LOG COMPLETO PARA DEBUG
        console.log('>>> FULL WEBHOOK PAYLOAD:', JSON.stringify(body, null, 2));

        const from = data?.key?.remoteJid;
        if (!from) {
            console.log('[WEBHOOK] Mensagem sem remetente (ignorado).');
            res.sendStatus(200);
            return;
        }

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

                let selectedRowId = data.message?.listResponseMessage?.singleSelectReply?.selectedRowId;

                const input = (selectedRowId || msgBody?.trim())?.toLowerCase();

                // ----------------------------------------------------
                // 🚨 INTERCEPTAÇÃO: MENSAGEM DO DONO (Handoff) - DENTRO DA PROMISE
                // ----------------------------------------------------
                // Agora verificamos isso AQUI, para garantir ordem sequencial com as mensagens do usuário
                if (data.key.fromMe) {
                    const from = data.key.remoteJid;
                    if (!from) return;

                    const text = data.message?.conversation || data.message?.extendedTextMessage?.text;

                    if (text) {
                        // COMANDO: /bot (Retomar controle)
                        if (text.toLowerCase().trim() === '/bot') {
                            console.log(`[HANDOFF] Dono retomou o bot para ${from}`);
                            await deleteFlowState(from);
                            await sendProfessionalMessage(from, "🤖 Bot retomado! Voltei a comandar.");
                            return;
                        }

                        // COMANDO: /stop (Pausar forçadamente)
                        if (text.toLowerCase().trim() === '/stop') {
                            console.log(`[HANDOFF] Dono pausou o bot para ${from}`);
                            await saveFlowState(from, 'HUMAN_INTERVENTION', { timestamp: Date.now() });
                            await sendProfessionalMessage(from, "🛑 Bot pausado por 30min.");
                            return;
                        }

                        // QUALQUER OUTRA MENSAGEM DO DONO -> PAUSA O BOT
                        // Se eu (humano) respondi, o bot tem que calar a boca.
                        console.log(`[HANDOFF] Intervenção humana detectada para ${from}. Pausando bot.`);
                        // Salva estado de intervenção
                        await saveFlowState(from, 'HUMAN_INTERVENTION', { timestamp: Date.now() });

                        // 🧠 APRENDIZADO AUTOMÁTICO
                        // Pega a última pergunta do usuário para salvar o par (Pergunta -> Resposta do Humano)
                        const history = await getHistory(from);
                        const lastUserMsg = history.reverse().find(m => m.role === 'user');

                        if (lastUserMsg && lastUserMsg.parts[0].text) {
                            // Salva o aprendizado
                            await saveLearnedResponse(lastUserMsg.parts[0].text, text);
                        }
                    }
                    return; // Sai, pois mensagem minha não gera resposta do bot
                }


                // 🛡️ VERIFICAÇÃO DE HANDOFF (O BOT ESTÁ PAUSADO?) - CHECK DUPLO
                // Verifica novamente AGORA que estamos processando a mensagem (evita race condition)
                const currentState = await getFlowState(from);

                if (currentState?.step === 'HUMAN_INTERVENTION' || currentState?.step === 'WAITING_FOR_HUMAN') {
                    const lastIntervention = currentState.data?.timestamp || 0;
                    const timeDiff = Date.now() - lastIntervention;
                    const MINUTES_30 = 30 * 60 * 1000;

                    if (timeDiff < MINUTES_30) {
                        console.log(`[HANDOFF] Bot silenciado para ${from} (Intervenção/Espera).`);
                        return; // 🔇 SILÊNCIO TOTAL
                    } else {
                        console.log(`[HANDOFF] Tempo de silêncio acabou para ${from}. Bot voltando...`);
                        await deleteFlowState(from);
                    }
                }

                // (Extração movida para o topo)

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
                            if (targetModality === 'street') details = "👟 *STREET & FUNK*\n\n*KIDS (5+):* Seg/Qua 08h, 14h30, 19h\n*TEENS/JUNIOR (12+):* Seg/Qua 19h | Ter/Qui 09h, 14h30\n*INICIANTE (12+):* Ter/Qui 20h\n*SENIOR/ADULTO (16+):* Seg/Qua 20h, Sex 19h, Sáb 10h\n*STREET FUNK (15+):* Sex 20h";
                            if (targetModality === 'jazz') details = "🦢 *JAZZ & CONTEMP.*\n\n*JAZZ FUNK (15+):* Ter 19h, Sáb 09h\n*JAZZ (18+):* Seg/Qua 20h (Inic) | Seg/Qua 21h\n*CONTEMP (12+):* Seg/Qua 19h";
                            if (targetModality === 'kpop') details = "🇰🇷 *K-POP (12+)*\n\nTer/Qui 20h (XTAGE)";
                            if (targetModality === 'heels') details = "👠 *HEELS (15+)*\n\nQui 17h, 18h, 19h | Sáb 11h, 12h\n*CIA:* Sáb 14h";
                            if (targetModality === 'ritmos') details = "💃 *RITMOS & BALLET*\n\n*RITMOS/FIT (15+):* Seg/Qua 08h, 19h | Ter/Qui 19h\n*BALLET (12+):* Ter/Qui 21h";
                            if (targetModality === 'teatro') details = "🎭 *TEATRO & ACRO*\n\n*TEATRO (12+):* Seg 09h | Qua 09h30\n*TEATRO (15+):* Seg/Qua 15h30\n*ACRO (12+):* Seg/Qua 20h";
                            if (targetModality === 'lutas') details = "🥊 *LUTAS*\n\n*MUAY THAI (12+):* Seg/Qua 20h | Ter/Qui 19h, 20h\n*JIU JITSU:* Seg/Qua/Sex 19h, 20h";
                            if (targetModality === 'populares') details = "🇧🇷 *POPULARES*\n\nSeg/Qua 14h\n*CIA (15+):* Sáb 14h30";
                            if (targetModality === 'salao') details = "💃 *SALÃO & SAMBA (18+)*\n\n*SALÃO:* Ter 20h\n*SAMBA DE GAFIEIRA:* Qui 20h\n*DANCEHALL/SALÃO (15+):* Sáb 14h30";

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

                            if (targetModality === 'street') details = "👟 *STREET & FUNK*\n\n*KIDS (5+):* Seg/Qua 08h, 14h30, 19h\n*TEENS/JUNIOR (12+):* Seg/Qua 19h | Ter/Qui 09h, 14h30\n*INICIANTE (12+):* Ter/Qui 20h\n*SENIOR/ADULTO (16+):* Seg/Qua 20h, Sex 19h, Sáb 10h\n*STREET FUNK (15+):* Sex 20h";
                            if (targetModality === 'jazz') details = "🦢 *JAZZ & CONTEMP.*\n\n*JAZZ FUNK (15+):* Ter 19h, Sáb 09h\n*JAZZ (18+):* Seg/Qua 20h (Inic) | Seg/Qua 21h\n*CONTEMP (12+):* Seg/Qua 19h";
                            if (targetModality === 'kpop') details = "🇰🇷 *K-POP (12+)*\n\nTer/Qui 20h (XTAGE)";
                            if (targetModality === 'heels') details = "👠 *HEELS (15+)*\n\nQui 17h, 18h, 19h | Sáb 11h, 12h\n*CIA:* Sáb 14h";
                            if (targetModality === 'ritmos') details = "💃 *RITMOS & BALLET*\n\n*RITMOS/FIT (15+):* Seg/Qua 08h, 19h | Ter/Qui 19h\n*BALLET (12+):* Ter/Qui 21h";
                            if (targetModality === 'teatro') details = "🎭 *TEATRO & ACRO*\n\n*TEATRO (12+):* Seg 09h | Qua 09h30\n*TEATRO (15+):* Seg/Qua 15h30\n*ACRO (12+):* Seg/Qua 20h";
                            if (targetModality === 'lutas') details = "🥊 *LUTAS*\n\n*MUAY THAI (12+):* Seg/Qua 20h | Ter/Qui 19h, 20h\n*JIU JITSU:* Seg/Qua/Sex 19h, 20h";
                            if (targetModality === 'populares') details = "🇧🇷 *POPULARES*\n\nSeg/Qua 14h\n*CIA (15+):* Sáb 14h30";
                            if (targetModality === 'salao') details = "💃 *SALÃO & SAMBA (18+)*\n\n*SALÃO:* Ter 20h\n*SAMBA DE GAFIEIRA:* Qui 20h\n*DANCEHALL/SALÃO (15+):* Sáb 14h30";

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
                            // 2. Não achou modalidade? Fallback para Menu
                            console.log(`[SITE FALLBACK] Mensagem não identificada, enviando menu: ${userMessage}`);

                            await sendProfessionalMessage(from, "Olá! Recebi sua mensagem. Como sou um robô, não entendi exatamente o que você disse, mas escolha uma opção abaixo que eu te ajudo! 👇");

                            setTimeout(async () => {
                                await sendList(from, "Menu XPACE", "Selecione uma opção:", "ABRIR MENU", [
                                    {
                                        title: "Navegação", rows: [
                                            { id: "menu_dance", title: "💃 Quero Dançar", description: "Ver turmas" },
                                            { id: "menu_schedule", title: "📅 Grade de Horários", description: "Ver dias e horas" },
                                            { id: "menu_prices", title: "💰 Ver Preços", description: "Valores" },
                                            { id: "menu_human", title: "🙋‍♂️ Falar com Humano", description: "Ajuda" }
                                        ]
                                    }
                                ]);
                                await saveFlowState(from, 'MENU_MAIN');
                            }, 2000);
                            return;
                        }
                    }

                    // ----------------------------------------------------
                    // 🧠 INTELIGÊNCIA RÁPIDA (Palavras-Chave Diretas)
                    // ----------------------------------------------------
                    // Se o usuário mandar algo específico, respondemos direto, sem Menu.
                    if (msgBody && !input?.startsWith('menu_') && !input?.startsWith('exp_') && !input?.startsWith('goal_') && !input?.startsWith('mod_')) {
                        const lowerMsg = msgBody.toLowerCase();

                        // 1. Grade / Horários / Aulas
                        if (lowerMsg.includes('grade') || lowerMsg.includes('horario') || lowerMsg.includes('aulas') || lowerMsg.includes('turmas')) {
                            await sendList(
                                from,
                                "Grade de Horários 📅",
                                "Aqui estão nossos horários! Toque em uma modalidade:",
                                "VER GRADE",
                                [
                                    {
                                        title: "Modalidades",
                                        rows: [
                                            { id: "mod_street", title: "👟 Street / Urban", description: "Kids, Teens, Adulto" },
                                            { id: "mod_jazz", title: "🦢 Jazz / Contemp.", description: "Técnico, Funk, Lyrical" },
                                            { id: "mod_kpop", title: "🇰🇷 K-Pop", description: "Coreografias" },
                                            { id: "mod_ritmos", title: "💃 Ritmos", description: "Dança de Salão, Fit" },
                                            { id: "mod_teatro", title: "🎭 Teatro & Acro", description: "Interpretação, Acrobacia" },
                                            { id: "mod_outros", title: "✨ Ver Todas", description: "Heels, Lutas, Ballet" },
                                        ]
                                    }
                                ]
                            );
                            await saveFlowState(from, 'SELECT_MODALITY');
                            return;
                        }

                        // 2. Preços / Valores
                        if (lowerMsg.includes('preco') || lowerMsg.includes('preço') || lowerMsg.includes('valor') || lowerMsg.includes('custo') || lowerMsg.includes('mensalidade')) {
                            await sendProfessionalMessage(from,
                                `💰 *INVESTIMENTO XPACE (2026)* 🚀\n\n` +
                                `Confira nossos planos e vantagens:\n\n` +
                                `💎 *PASSE LIVRE (Acesso Total):* R$ 350/mês\n` +
                                `_Faça quantas aulas quiser de qualquer modalidade!_\n\n` +
                                `*PLANOS REGULARES (2x na semana)*\n` +
                                `💎 Anual: R$ 165/mês (Melhor Valor)\n` +
                                `💳 Semestral: R$ 195/mês\n` +
                                `🎟️ Mensal: R$ 215/mês\n\n` +
                                `*TURMAS 1x NA SEMANA*\n` +
                                `💎 Anual: R$ 100/mês\n` +
                                `💳 Semestral: R$ 115/mês\n` +
                                `🎟️ Mensal: R$ 130/mês\n\n` +
                                `🔗 *GARANTIR VAGA:* https://venda.nextfit.com.br/54a0cf4a-176f-46d3-b552-aad35019a4ff/contratos\n\n` +
                                `_Para voltar ao menu, digite ‘Menu’._`
                            );
                            // Opcional: manter estado ou resetar. Resetar é mais seguro.
                            await deleteFlowState(from);
                            return;
                        }

                        // 3. Localização
                        if (lowerMsg.includes('endereco') || lowerMsg.includes('endereço') || lowerMsg.includes('onde fica') || lowerMsg.includes('local') || lowerMsg.includes('mapa') || lowerMsg.includes('chegar')) {
                            await sendLocation(from, -26.296210, -48.845500, "XPACE", "Rua Tijucas, 401 - Joinville");
                            await sendProfessionalMessage(from, "📍 *Estamos na Rua Tijucas, 401 - Centro/Joinville*\n\n🚙 Estacionamento próprio gratuito.\n☕ Lanchonete no local.\n\n_Para voltar ao menu, digite ‘Menu’._");
                            await deleteFlowState(from);
                            return;
                        }

                        // 4. Humano / Atendente
                        if (lowerMsg.includes('humano') || lowerMsg.includes('atendente') || lowerMsg.includes('falar com gente') || lowerMsg.includes('suporte')) {
                            await sendProfessionalMessage(from, "Entendi! Vou transferir para nossa equipe humana. 🙋‍♂️\n\nAguarde um instante que já te respondemos!");
                            await saveFlowState(from, 'WAITING_FOR_HUMAN', { timestamp: Date.now() });
                            await notifySocios(`🚨 SOLICITAÇÃO DIRETA DE HUMANO: ${pushName}`, { jid: from, name: pushName });
                            addLabelToConversation(from, 'human_handoff').catch(console.error);
                            return;
                        }
                    }

                    // ----------------------------------------------------
                    // 🟢 1. MENU PRINCIPAL (Gatilhos: Oi, Menu, 0)

                    // ----------------------------------------------------
                    if (isGreeting(msgBody) || msgBody?.trim() === '0') {
                        await deleteFlowState(from); // Reinicia fluxo

                        await sendReaction(from, messageKey, '👋');
                        const pushName = (body.instanceData?.user || "Aluno").split(' ')[0]; // Ensure pushName is defined here if not globally available

                        await sendList(
                            from,
                            "Bem-vindo à XPACE! 🚀",
                            `Olá, ${pushName}! Sou o X-Bot.\nEscolha uma opção para começarmos:`,
                            "ABRIR MENU",
                            [
                                {
                                    title: "Navegação",
                                    rows: [
                                        { id: "menu_dance", title: "💃 Quero Dançar", description: "Encontre sua turma" },
                                        { id: "menu_schedule", title: "📅 Grade de Horários", description: "Ver dias e horas" },
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
                    // Input já definido no topo

                    // Menu Principal -> Escolha
                    if (currentState?.step === 'MENU_MAIN') {

                        // OPÇÃO 1: QUERO DANÇAR
                        if (input === 'menu_dance' || input === '1' || input.includes('dança')) {
                            await sendProfessionalMessage(from, "Que incrível que você quer dançar com a gente! 🤩\n\nPara eu te indicar a turma perfeita, preciso te conhecer um pouquinho melhor.\n\nPrimeiro, *como você gostaria de ser chamado?*");
                            await saveFlowState(from, 'ASK_NAME');
                            addLabelToConversation(from, 'prospect').catch(err => console.error(err));
                            return;
                        }

                        // OPÇÃO 2: GRADE DE HORÁRIOS (Nova Opção)
                        if (input === 'menu_schedule' || input === '2' || input.includes('grade') || input.includes('horario')) {
                            await sendList(
                                from,
                                "Grade de Horários 📅",
                                "Toque em uma modalidade para ver os horários:",
                                "VER GRADE",
                                [
                                    {
                                        title: "Modalidades",
                                        rows: [
                                            { id: "mod_street", title: "👟 Street / Urban", description: "Kids, Teens, Adulto" },
                                            { id: "mod_jazz", title: "🦢 Jazz / Contemp.", description: "Técnico, Funk, Lyrical" },
                                            { id: "mod_kpop", title: "🇰🇷 K-Pop", description: "Coreografias" },
                                            { id: "mod_ritmos", title: "💃 Ritmos", description: "Dança de Salão, Fit" },
                                            { id: "mod_teatro", title: "🎭 Teatro & Acro", description: "Interpretação, Acrobacia" },
                                            { id: "mod_outros", title: "✨ Ver Todas", description: "Heels, Lutas, Ballet" },
                                        ]
                                    }
                                ]
                            );
                            await saveFlowState(from, 'SELECT_MODALITY'); // Jump directly to modality selection
                            return;
                        }

                        // OPÇÃO 3: VER PREÇOS
                        if (input === 'menu_prices' || input === '3' || input.includes('preço') || input.includes('valor')) {
                            await sendProfessionalMessage(from,
                                `💰 *INVESTIMENTO XPACE (2026)* 🚀\n\n` +
                                `Escolha o plano que melhor se adapta à sua rotina:\n\n` +
                                `💎 *PASSE LIVRE (Acesso Total):* R$ 350/mês\n` +
                                `_Faça quantas aulas quiser de qualquer modalidade!_\n\n` +
                                `*PLANOS REGULARES (2x na semana)*\n` +
                                `💎 Anual: R$ 165/mês (Melhor Valor)\n` +
                                `💳 Semestral: R$ 195/mês\n` +
                                `🎟️ Mensal: R$ 215/mês\n\n` +
                                `*TURMAS 1x NA SEMANA*\n` +
                                `💎 Anual: R$ 100/mês\n` +
                                `💳 Semestral: R$ 115/mês\n` +
                                `🎟️ Mensal: R$ 130/mês\n\n` +
                                `🔗 *GARANTIR VAGA:* https://venda.nextfit.com.br/54a0cf4a-176f-46d3-b552-aad35019a4ff/contratos\n\n` +
                                `_Digite 0 para voltar._`
                            );
                            return;
                        }

                        // OPÇÃO 4: LOCALIZAÇÃO
                        if (input === 'menu_location' || input === '4' || input.includes('endereço') || input.includes('local')) {
                            await sendLocation(from, -26.296210, -48.845500, "XPACE", "Rua Tijucas, 401 - Joinville");
                            await sendProfessionalMessage(from, "Estamos no coração de Joinville! 📍\n\n✅ Estacionamento gratuito para alunos.\n✅ Lanchonete e espaço de convivência.\n\n_Digite 0 para voltar._");
                            return;
                        }

                        // OPÇÃO 5: HUMANO
                        if (input === 'menu_human' || input === '5' || input.includes('humano') || input.includes('atendente')) {
                            await sendProfessionalMessage(from, "Sem problemas! Já chamei alguém da equipe pra te ajudar. Aguarde um pouquinho que já te respondemos! ⏳");
                            // 🛑 PARAR BOT AQUI
                            await saveFlowState(from, 'WAITING_FOR_HUMAN', { timestamp: Date.now() });
                            await notifySocios(`🚨 SOLICITAÇÃO DE HUMANO: ${pushName}`, { jid: from, name: pushName });
                            addLabelToConversation(from, 'human_handoff').catch(console.error);
                            return;
                        }
                    }

                    // ... (Ask Name, Age, Experience Logic remains same) ...

                    // ----------------------------------------------------
                    // 🟣 FALLBACK (Sem IA Generativa)
                    // ----------------------------------------------------
                    // ----------------------------------------------------
                    // 🟣 FALLBACK (IA GENERATIVA HÍBRIDA)
                    // ----------------------------------------------------
                    if (msgBody && msgBody.length > 1 && !input?.startsWith('menu_') && !input?.startsWith('exp_') && !input?.startsWith('goal_') && !input?.startsWith('mod_')) {
                        console.log(`🤖 [AI] Processing message: "${msgBody}"`);

                        // Se não estiver em um fluxo específico (ex: esperando nome/idade), manda pra IA
                        if (!currentState || currentState.step === 'MENU_MAIN') {

                            // Chama o Gemini
                            const aiResponse = await generateResponse(from, msgBody);
                            console.log(`🤖 [AI] Response: "${aiResponse}"`);

                            // 1. Verifica TAGS ESPECIAIS na resposta
                            let finalMessage = aiResponse; // Mensagem limpa para enviar
                            let triggers: string[] = [];

                            if (aiResponse.includes('[SHOW_MENU]')) {
                                triggers.push('MENU');
                                finalMessage = finalMessage.replace('[SHOW_MENU]', '');
                            }
                            if (aiResponse.includes('[SHOW_PRICES]')) {
                                triggers.push('PRICES');
                                finalMessage = finalMessage.replace('[SHOW_PRICES]', '');
                            }
                            if (aiResponse.includes('[SHOW_SCHEDULE]')) {
                                triggers.push('SCHEDULE');
                                finalMessage = finalMessage.replace('[SHOW_SCHEDULE]', '');
                            }
                            if (aiResponse.includes('[SHOW_LOCATION]')) {
                                triggers.push('LOCATION');
                                finalMessage = finalMessage.replace('[SHOW_LOCATION]', '');
                            }
                            if (aiResponse.includes('[HANDOFF]')) {
                                triggers.push('HANDOFF');
                                finalMessage = finalMessage.replace('[HANDOFF]', '');
                            }

                            // Envia a resposta de texto da IA (limpa)
                            if (finalMessage.trim().length > 0) {
                                await sendProfessionalMessage(from, finalMessage.trim());
                            }

                            // Executa os Gatilhos Visuais
                            for (const trigger of triggers) {
                                await new Promise(r => setTimeout(r, 1000)); // Delay para não atropelar

                                if (trigger === 'MENU') {
                                    await sendList(from, "Menu XPACE", "Aqui estão as opções que você pode precisar:", "ABRIR MENU", [
                                        { title: "Navegação", rows: [{ id: "menu_dance", title: "💃 Quero Dançar", description: "Ver turmas" }, { id: "menu_schedule", title: "📅 Grade de Horários", description: "Ver dias e horas" }, { id: "menu_prices", title: "💰 Ver Preços", description: "Valores" }, { id: "menu_human", title: "🙋‍♂️ Falar com Humano", description: "Ajuda" }] }
                                    ]);
                                    await saveFlowState(from, 'MENU_MAIN');
                                }

                                if (trigger === 'PRICES') {
                                    await sendProfessionalMessage(from,
                                        `💰 *INVESTIMENTO XPACE (2026)* 🚀\n\n` +
                                        `💎 *PASSE LIVRE:* R$ 350/mês (Acesso Total)\n` +
                                        `*2x NA SEMANA:*\n` +
                                        `💎 Anual: R$ 165/mês\n` +
                                        `💳 Semestral: R$ 195/mês\n` +
                                        `🎟️ Mensal: R$ 215/mês\n\n` +
                                        `*1x NA SEMANA:*\n` +
                                        `💎 Anual: R$ 100/mês\n` +
                                        `🔗 *GARANTIR VAGA:* https://venda.nextfit.com.br/54a0cf4a-176f-46d3-b552-aad35019a4ff/contratos`
                                    );
                                }

                                if (trigger === 'SCHEDULE') {
                                    await sendList(from, "Grade de Horários 📅", "Toque em uma modalidade:", "VER GRADE", [
                                        { title: "Modalidades", rows: [{ id: "mod_street", title: "👟 Street / Urban", description: "Kids, Teens, Adulto" }, { id: "mod_jazz", title: "🦢 Jazz / Contemp.", description: "Técnico, Funk" }, { id: "mod_kpop", title: "🇰🇷 K-Pop", description: "Coreografias" }, { id: "mod_ritmos", title: "💃 Ritmos", description: "Dança de Salão, Fit" }, { id: "mod_outros", title: "✨ Ver Todas", description: "Heels, Lutas, Ballet" }] }
                                    ]);
                                    await saveFlowState(from, 'SELECT_MODALITY');
                                }

                                if (trigger === 'LOCATION') {
                                    await sendLocation(from, -26.296210, -48.845500, "XPACE", "Rua Tijucas, 401 - Joinville");
                                }

                                if (trigger === 'HANDOFF') {
                                    await notifySocios(`🚨 IA SOLICITOU AJUDA HUMANA: ${pushName}`, { jid: from, name: pushName });
                                    addLabelToConversation(from, 'human_handoff').catch(console.error);
                                    // Salva estado para não ficar em loop
                                    await saveFlowState(from, 'WAITING_FOR_HUMAN', { timestamp: Date.now() });
                                }
                            }
                        }
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
        // Adiciona à fila
        messageQueues.set(from, (messageQueues.get(from) || Promise.resolve()).then(processMessage).catch(err => console.error(`Erro na fila do usuário ${from}:`, err)));

        res.sendStatus(200);

    } catch (error) {
        console.error('CRITICAL ERROR IN WEBHOOK:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
