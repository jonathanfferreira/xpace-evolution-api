import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { getHistory, saveMessage, clearHistory } from './services/memory';
import { generateResponse } from './services/ai';
import { sendMessage, sendButtons, sendList, sendMedia, sendPresence, sendReaction, sendLocation } from './services/whatsapp';

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

// Estado do Fluxo de Diagnóstico por usuário
const userFlow = new Map<string, { step: string, experience?: string }>();

// Webhook Reception (Evolution API)
app.post('/webhook', async (req: Request, res: Response) => {
    const body = req.body;
    const event = body.event?.toLowerCase();

    if (event !== 'messages.upsert' && event !== 'messages_upsert') {
        res.sendStatus(200);
        return;
    }

    const data = body.data;
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

            // 1. EXTRAÇÃO DA MENSAGEM (Texto ou Botão/Lista)
            let msgBody = data.message?.conversation ||
                data.message?.extendedTextMessage?.text ||
                data.message?.buttonsResponseMessage?.selectedDisplayText ||
                data.message?.listResponseMessage?.title;

            // IDs de Botão e Lista (Evolution API)
            const buttonId = data.message?.buttonsResponseMessage?.selectedButtonId ||
                data.message?.listResponseMessage?.singleSelectReply?.selectedRowId;

            if (msgBody || buttonId) {
                console.log(`[${from}] Msg: "${msgBody}" | ButtonID: ${buttonId}`);
                await sendPresence(from, 'composing');

                // ----------------------------------------------------
                // 🛑 COMANDOS DE DEBUG/RESET (Prioridade Total)
                // ----------------------------------------------------
                if (msgBody?.toLowerCase().trim() === '/reset') {
                    await clearHistory(from);
                    userFlow.delete(from);
                    await sendMessage(from, "♻️ Tudo limpo! Memória e Fluxo reiniciados.");
                    return;
                }
                if (msgBody?.toLowerCase().trim() === '/debug') {
                    const state = userFlow.get(from);
                    await sendMessage(from, `🐛 *DEBUG* 🐛\nFlow State: ${JSON.stringify(state || 'null')}`);
                    return;
                }

                // ----------------------------------------------------
                // 🟢 1. MENU PRINCIPAL (Gatilhos: Oi, Menu, 0)
                // ----------------------------------------------------
                if (isGreeting(msgBody) || msgBody?.trim() === '0') {
                    userFlow.delete(from);
                    await sendReaction(from, messageKey, '👋');
                    await sendMessage(from,
                        `Olá, ${pushName}! 👋\n\n` +
                        `Sou o *X-Bot* da XPACE. Como posso te ajudar?\n\n` +
                        `*1️⃣* Quero Dançar\n` +
                        `*2️⃣* Ver Preços\n` +
                        `*3️⃣* Localização\n` +
                        `*4️⃣* Falar com Humano\n\n` +
                        `_Digite o número da opção desejada._`
                    );
                    userFlow.set(from, { step: 'MENU_MAIN' });
                    return;
                }

                // ----------------------------------------------------
                // 🔵 2. TRATAMENTO DOS NÚMEROS DO MENU
                // ----------------------------------------------------
                const currentState = userFlow.get(from);
                const trimmedMsg = msgBody?.trim();

                // Menu Principal -> Escolha
                if (currentState?.step === 'MENU_MAIN') {
                    if (trimmedMsg === '1') {
                        // Fluxo Dançar
                        await sendMessage(from,
                            `Que demais! 🤩 Para indicar a turma certa:\n\n` +
                            `*1️⃣* Nunca dancei (Iniciante)\n` +
                            `*2️⃣* Já danço / Tenho noção\n\n` +
                            `_Digite 1 ou 2_`
                        );
                        userFlow.set(from, { step: 'ASK_EXPERIENCE' });
                        return;
                    }
                    if (trimmedMsg === '2') {
                        // Preços
                        await sendMessage(from,
                            `💰 *Investimento XPACE (2026)*\n\n` +
                            `💎 *Anual:* R$ 165/mês (Melhor!)\n` +
                            `💳 *Mensal:* R$ 215/mês\n` +
                            `🎟️ *Avulso:* R$ 50\n\n` +
                            `📝 Matricule-se: https://venda.nextfit.com.br/54a0cf4a-176f-46d3-b552-aad35019a4ff/contratos\n\n` +
                            `_Digite 0 para voltar ao menu._`
                        );
                        return;
                    }
                    if (trimmedMsg === '3') {
                        // Localização
                        await sendLocation(from, -26.301385, -48.847589, "XPACE Escola de Dança", "Rua Tijucas, 401 - Centro, Joinville");
                        await sendMessage(from, "Estacionamento gratuito! 🚗\n\n_Digite 0 para voltar ao menu._");
                        return;
                    }
                    if (trimmedMsg === '4') {
                        // Humano
                        await sendMessage(from, "Chamei a equipe! Alguém já vem falar com você. 🙋‍♂️");
                        await notifySocios(`🚨 Humano Solicitado: ${pushName}`, { jid: from, name: pushName });
                        return;
                    }
                }

                // Fluxo Dançar - Experiência
                if (currentState?.step === 'ASK_EXPERIENCE') {
                    if (trimmedMsg === '1' || trimmedMsg === '2') {
                        const exp = trimmedMsg === '1' ? 'iniciante' : 'avancado';
                        await sendMessage(from,
                            `E o que você busca na dança?\n\n` +
                            `*1️⃣* Hobby / Diversão\n` +
                            `*2️⃣* Exercício / Suar\n` +
                            `*3️⃣* Profissionalização\n\n` +
                            `_Digite 1, 2 ou 3_`
                        );
                        userFlow.set(from, { step: 'ASK_GOAL', experience: exp });
                        return;
                    }
                }

                // Fluxo Dançar - Objetivo -> Recomendação
                if (currentState?.step === 'ASK_GOAL') {
                    if (['1', '2', '3'].includes(trimmedMsg || '')) {
                        const exp = currentState.experience;
                        let rec = exp === 'iniciante'
                            ? "Para começar do zero: *Street Dance Iniciante*, *K-Pop* ou *Dança de Salão*."
                            : "Para evoluir: *FitDance*, *Hip Hop Open Level* ou *Jazz*!";

                        await sendMessage(from,
                            `Perfeito! ${rec}\n\n` +
                            `📅 *Agende sua aula experimental grátis:*\n` +
                            `https://agendamento.nextfit.com.br/f9b1ea53-0e0e-4f98-9396-3dab7c9fbff4\n\n` +
                            `_Digite 0 para voltar ao menu._`
                        );
                        userFlow.delete(from);
                        return;
                    }
                }

                // ----------------------------------------------------
                // 🟣 IA HÍBRIDA (Fallback para dúvidas complexas)
                // ----------------------------------------------------
                // Se não é número nem comando, usa a IA
                if (msgBody && msgBody.length > 2 && !['0', '1', '2', '3', '4'].includes(trimmedMsg || '')) {
                    console.log(`🤖 IA Fallback para: ${msgBody}`);
                    const history = await getHistory(from);
                    const aiResponse = await generateResponse(msgBody, history);
                    if (!aiResponse.startsWith("Erro:")) {
                        await saveMessage(from, 'user', msgBody);
                        await saveMessage(from, 'model', aiResponse);
                    }
                    await sendMessage(from, aiResponse);
                }
            }

            // Tratamento de Áudio
            if (data.message?.audioMessage) {
                await sendReaction(from, messageKey, '🎧');
                await sendPresence(from, 'recording');
                setTimeout(async () => {
                    await sendMessage(from, `Opa, já estou ouvindo seu áudio, ${pushName}! 🏃‍♂️`);
                }, 1000);
            }
        } catch (error) {
            console.error('Erro no webhook:', error);
        }
    };

    // Gerenciamento de Concorrência: Enfileira a promessa
    const previousPromise = messageQueues.get(from) || Promise.resolve();
    const currentPromise = previousPromise.then(processMessage);
    messageQueues.set(from, currentPromise);

    // Limpa a fila quando terminar para liberar memória
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
