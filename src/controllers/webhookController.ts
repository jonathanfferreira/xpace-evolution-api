import { Request, Response } from 'express';
import { getHistory, clearHistory, getFlowState, saveFlowState, deleteFlowState, saveLearnedResponse } from '../services/memory';
import { generateResponse } from '../services/ai';
import { sendMessage, sendProfessionalMessage, sendList, sendReaction, sendPresence } from '../services/whatsapp';
import { notifySocios } from '../services/notificationService';
import { getSmartName } from '../utils/textUtils';
import { handleScheduleLead, handleSiteLeadFallback, handleDirectKeywords, handleMenuSelection, sendMainMenu, handleQuizResponse, sendPrices, sendScheduleList, sendLocationInfo, sendHumanHandoff } from '../services/flowService';

// Queue & Caches
const messageQueues = new Map<string, Promise<void>>();
const processedMessages = new Map<string, number>();

// Cache cleaner
setInterval(() => {
    const now = Date.now();
    for (const [key, time] of processedMessages) {
        if (now - time > 60000) processedMessages.delete(key);
    }
}, 3600000); // 1 hour

// ----------------------------------------------------------------------
// SUB-HANDLERS
// ----------------------------------------------------------------------

async function handleReadReceipt(req: Request, res: Response) {
    const body = req.body;
    const data = body.data;
    if (data && data.status === 'READ') {
        const from = data?.key?.remoteJid;
        if (!from || from.includes('@g.us')) {
            res.sendStatus(200);
            return;
        }

        const currentState = await getFlowState(from);
        if (currentState) {
            const step = currentState.step;
            const pushName = getSmartName(body.instanceData?.user) || "Aluno";

            if (step === 'VIEW_MODALITY_DETAILS' || step === 'SELECT_MODALITY') {
                console.log(`[READ RECEIPT] ${from} visualizou Detalhes/Agendamento!`);
                await notifySocios(`👁️ Lead [${pushName}] visualizou o Link de Agendamento/Detalhes!`, { jid: from, name: pushName });
            }
        }
    }
    res.sendStatus(200);
}

async function handleCall(req: Request, res: Response) {
    const data = req.body.data;
    console.log(`[CALL] Incoming call from ${data.id}`);
    const callerJid = data.id || data.from;

    if (callerJid && !callerJid.includes('@g.us')) {
        await sendProfessionalMessage(callerJid,
            "🤖 *Atendimento Automático*\n\n" +
            "Oi! Eu sou o X-Bot virtual e não consigo atender chamadas de voz/vídeo. 📵\n\n" +
            "Por favor, *envie sua dúvida por texto ou áudio aqui no chat* que eu te respondo na hora! ⚡"
        );
    }
    res.sendStatus(200);
}

async function handlePresence(req: Request, res: Response) {
    const data = req.body.data;
    if (data.presences) {
        const from = Object.keys(data.presences)[0];
        const presence = data.presences[from]?.lastKnownPresence;
        if (presence === 'composing' || presence === 'recording') {
            console.log(`[PRESENCE] ${from} is ${presence}...`);
        }
    }
    res.sendStatus(200);
}

async function handleMessageUpsert(req: Request, res: Response) {
    const body = req.body;
    const data = body.data;
    const messageId = data?.key?.id;

    if (!messageId) {
        res.sendStatus(200);
        return;
    }

    if (processedMessages.has(messageId)) {
        res.sendStatus(200);
        return;
    }
    processedMessages.set(messageId, Date.now());

    const from = data?.key?.remoteJid;
    if (!from) {
        res.sendStatus(200);
        return;
    }

    const processMessage = async () => {
        try {
            const rawPushName = body.instanceData?.user || data.pushName;
            const smartName = getSmartName(rawPushName);
            const pushName = smartName || "Aluno";
            const messageKey = data.key;

            let msgBody = data.message?.conversation ||
                data.message?.extendedTextMessage?.text ||
                data.message?.buttonsResponseMessage?.selectedDisplayText ||
                data.message?.listResponseMessage?.title;

            let selectedRowId = data.message?.listResponseMessage?.singleSelectReply?.selectedRowId;
            const input = (selectedRowId || msgBody?.trim())?.toLowerCase();

            // 1. HANDOFF DO DONO
            if (data.key.fromMe) {
                const text = data.message?.conversation || data.message?.extendedTextMessage?.text;
                if (text) {
                    if (text.toLowerCase().trim() === '/bot') {
                        await deleteFlowState(from);
                        await sendProfessionalMessage(from, "🤖 Bot retomado! Voltei a comandar.");
                        return;
                    }
                    if (text.toLowerCase().trim() === '/stop') {
                        await saveFlowState(from, 'HUMAN_INTERVENTION', { timestamp: Date.now() });
                        await sendProfessionalMessage(from, "🛑 Bot pausado por 30min.");
                        return;
                    }
                    // Auto-learning
                    console.log(`[HANDOFF] Intervenção humana detectada para ${from}.`);
                    await saveFlowState(from, 'HUMAN_INTERVENTION', { timestamp: Date.now() });

                    const history = await getHistory(from);
                    const lastUserMsg = history.reverse().find(m => m.role === 'user');
                    if (lastUserMsg && lastUserMsg.parts[0].text) {
                        await saveLearnedResponse(lastUserMsg.parts[0].text, text);
                    }
                }
                return;
            }

            // 2. CHECAR SE ESTÁ EM HANDOFF
            let currentState = await getFlowState(from);
            if (currentState?.step === 'HUMAN_INTERVENTION' || currentState?.step === 'WAITING_FOR_HUMAN') {
                const lastIntervention = currentState.data?.timestamp || 0;
                if (Date.now() - lastIntervention < 30 * 60 * 1000) {
                    console.log(`[HANDOFF] Bot silenciado para ${from}`);
                    return;
                } else {
                    await deleteFlowState(from);
                }
            }

            if (msgBody || selectedRowId) {
                console.log(`[${from}] Msg: "${msgBody}" | RowID: ${selectedRowId}`);
                require('fs').appendFileSync('conversations.log', `[${new Date().toISOString()}] ${from} (${pushName}): ${msgBody}\n`);

                // COMMANDS
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

                // --- FLOW SERVICE DELEGATION ---

                // 3. GRADE DE HORÁRIOS (Botão do Card)
                const handledSchedule = await handleScheduleLead(msgBody, from, pushName);
                if (handledSchedule) return;

                // 4. SITE LEAD FALLBACK
                const handledSite = await handleSiteLeadFallback(msgBody, from, pushName);
                if (handledSite) return;

                // **PRIORITY 1: CHECK ACTIVE FLOW STATE**
                // Se o usuário já está em um fluxo (ex: respondendo nome), isso processa primeiro.
                if (currentState) {
                    const handledQuiz = await handleQuizResponse(msgBody, from, currentState);
                    if (handledQuiz) return;

                    const handledMenu = await handleMenuSelection(input, from, pushName, currentState);
                    if (handledMenu) return;
                }

                // 5. SAFETY CHECK (Input numérico sem estado)
                if (['1', '2', '3', '4', '5', '6'].includes(input)) {
                    if (!currentState) {
                        await saveFlowState(from, 'MENU_MAIN');
                        currentState = { step: 'MENU_MAIN', data: {} }; // Force local update

                        // Retry menu selection with new state
                        const handledMenuRetry = await handleMenuSelection(input, from, pushName, currentState);
                        if (handledMenuRetry) return;
                    }
                }

                // 6. PALAVRAS-CHAVE DIRETAS
                const handledKeywords = await handleDirectKeywords(msgBody, from, pushName, input);
                if (handledKeywords) return;

                // 7. MENU PRINCIPAL (Gatilhos)
                if (isGreeting(msgBody, pushName) || msgBody?.trim() === '0') {
                    await deleteFlowState(from);
                    await sendReaction(from, messageKey, '👋');
                    await sendMainMenu(from, pushName);
                    return;
                }

                // Helper internal fix
                function isGreeting(text: string, _?: string): boolean {
                    const greetings = ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'menu', 'iniciar', 'start', 'começar'];
                    return greetings.some(greeting => text.toLowerCase().includes(greeting));
                }


                // 9. AI FALLBACK
                if (msgBody && msgBody.length > 1 && !Object.keys(currentState || {}).length || currentState?.step === 'MENU_MAIN') {
                    // Only use AI if NOT in a strict flow (like asking name)
                    if (!input?.startsWith('menu_') && !input?.startsWith('mod_')) {
                        const aiResponse = await generateResponse(from, msgBody);

                        // Tratamento simples da resposta da IA
                        if (aiResponse) {
                            // Parse TAGS
                            let cleanResponse = aiResponse;
                            const tagActionMap: { [key: string]: Function } = {
                                '[SHOW_MENU]': () => sendMainMenu(from, pushName),
                                '[SHOW_PRICES]': () => sendPrices(from, pushName),
                                '[SHOW_SCHEDULE]': () => sendScheduleList(from),
                                '[SHOW_LOCATION]': () => sendLocationInfo(from),
                                '[HANDOFF]': () => sendHumanHandoff(from, pushName),
                                '[UNKNOWN]': async () => {
                                    // Fallback for unknown
                                    await sendProfessionalMessage(from, "Ainda estou aprendendo sobre isso! 😅 Mas veja o que eu sei fazer:");
                                    await sendMainMenu(from, pushName);
                                }
                            };

                            let detectedAction: Function | null = null;

                            // Find and extract tag
                            for (const tag in tagActionMap) {
                                if (cleanResponse.includes(tag)) {
                                    cleanResponse = cleanResponse.replace(tag, '').trim();
                                    detectedAction = tagActionMap[tag];
                                    break; // Assume one major action per response
                                }
                            }

                            // Send clean text first (if any remains)
                            if (cleanResponse && cleanResponse !== '[UNKNOWN]') {
                                await sendProfessionalMessage(from, cleanResponse);
                            }

                            // Execute action
                            if (detectedAction) {
                                await new Promise(r => setTimeout(r, 1000)); // Natural delay
                                await detectedAction();
                            } else if (!cleanResponse && aiResponse.includes('[UNKNOWN]')) {
                                // Double safety for UNKNOWN if pure tag
                                await tagActionMap['[UNKNOWN]']();
                            }
                        }
                    }
                }

                // Audio
                if (data.message?.audioMessage) {
                    await sendReaction(from, messageKey, '🎧');
                    await sendPresence(from, 'recording');
                    setTimeout(async () => {
                        await sendProfessionalMessage(from, `Opa, já estou ouvindo seu áudio, ${pushName}! 🏃‍♂️`);
                    }, 2000);
                }
            }
        } catch (error) {
            console.error(`Error processing message for ${from}:`, error);
        }
    };

    const previousTask = messageQueues.get(from) || Promise.resolve();
    const task = previousTask.then(processMessage);
    messageQueues.set(from, task);

    task.finally(() => {
        if (messageQueues.get(from) === task) {
            messageQueues.delete(from);
        }
    });

    res.sendStatus(200);
}

// ----------------------------------------------------------------------
// CONTROLLER ENTRY POINT
// ----------------------------------------------------------------------

export const handleWebhook = async (req: Request, res: Response) => {
    try {
        const body = req.body;
        const event = body.event?.toLowerCase();

        if (event === 'messages.update' || event === 'messages_update') return handleReadReceipt(req, res);
        if (event === 'call') return handleCall(req, res);
        if (event === 'presence.update' || event === 'presence_update') return handlePresence(req, res);
        if (event === 'messages.upsert' || event === 'messages_upsert') return handleMessageUpsert(req, res);

        res.sendStatus(200);
    } catch (error) {
        console.error('Webhook Error:', error);
        res.sendStatus(500);
    }
};
