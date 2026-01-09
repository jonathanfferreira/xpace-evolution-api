import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { getHistory, saveMessage, clearHistory, getFlowState, saveFlowState, deleteFlowState } from './services/memory';
import { generateResponse } from './services/ai';
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
    const text = `🚨 *ALERTA XPACE-BOT*\n\nUm aluno demonstrou forte interesse em: *${intent}*\nDe: ${userInfo.name || userInfo.jid}\n\nFavor entrar em contato!`;
    await sendMessage(SOCIOS.ALCEU, text);
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
                            `💰 *Investimento XPACE (2026)*\n\n` +
                            `Aqui você tem flexibilidade total:\n\n` +
                            `💎 *Plano Anual:* R$ 165/mês (O favorito!)\n` +
                            `💳 *Plano Semestral:* R$ 195/mês\n` +
                            `🎟️ *Plano Mensal:* R$ 215/mês\n\n` +
                            `_Quer garantir sua vaga agora?_\n` +
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
                    if (input === 'final_booking') {
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

                    if (input?.startsWith('mod_')) {
                        const mod = input.replace('mod_', '');
                        addLabelToConversation(from, mod).catch(console.error);
                        let details = "";

                        switch (mod) {
                            case 'street':
                                details = "👟 *DANÇAS URBANAS (Street)*\n\n*MANHÃ*\n▫️ Seg/Qua 08:00 — Kids\n▫️ Seg/Qua 08:30 — Kids\n▫️ Ter/Qui 09:00 — Teens\n▫️ Sáb 10:00 — Geral\n\n*TARDE*\n▫️ Seg/Qua 14:30 — Kids\n▫️ Ter/Qui 14:30 — Iniciante\n\n*NOITE*\n▫️ Seg/Qua 19:00 — Junior / Kids\n▫️ Seg/Qua 20:00 — Senior\n▫️ Ter/Qui 21:00 — Iniciante\n▫️ Sex 19:00 — Iniciante\n▫️ Sex 20:00 — Street Funk";
                                break;
                            case 'jazz':
                                details = "🦢 *JAZZ & CONTEMPORÂNEO*\n\n*SEGUNDA & QUARTA*\n▫️ 19:00 — Contemporâneo (XLAB)\n▫️ 20:00 — Jazz Iniciante (XCORE)\n▫️ 21:00 — Jazz (XPERIENCE)\n\n*TERÇA*\n▫️ 19:00 — Jazz Funk (XLAB)\n\n*SÁBADO*\n▫️ 09:00 — Jazz Funk (XPERIENCE)";
                                break;
                            case 'kpop':
                                details = "🇰🇷 *K-POP*\n\nAprenda as coreografias oficiais dos seus grupos favoritos!\n\n🕒 *Horários:* Sábados às 14h.\n🎥 *Vibe:* Divertido e comunidade.";
                                break;
                            case 'ritmos':
                                details = "💃 *RITMOS & BALLET*\n\n*RITMOS (Mix de Danças)*\n▫️ Seg/Qua às 09:00 (XTAGE)\n▫️ Seg/Qua às 19:00 (XTAGE)\n▫️ Ter/Qui às 19:00 (XCORE)\n\n*BALLET CLÁSSICO (Iniciante)*\n▫️ Ter/Qui às 20:00 (XCORE)";
                                break;
                            case 'teatro':
                                details = "🎭 *AULAS DE TEATRO*\n\nDesenvolva sua comunicação e expressão!\n\n*SEGUNDA*\n▫️ 09:00 — Manhã (XPERIENCE)\n▫️ 15:30 — Tarde (XLAB)\n\n*QUARTA*\n▫️ 09:30 — Manhã (XCORE)\n▫️ 15:30 — Tarde (XLAB)";
                                break;
                            case 'outros':
                                details = "✨ *AULAS ESPECIAIS*\n\n*DANÇAS POPULARES*\n▫️ Seg/Qua às 14:00 (XPERIENCE)\n\n*ACROBACIA*\n▫️ Seg/Qua às 20:00 (XTAGE)";
                                break;
                        }

                        await sendProfessionalMessage(from, details);
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
