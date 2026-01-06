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
                // 🟢 1. MENU PRINCIPAL (Gatilhos: Oi, Menu, Voltar)
                // ----------------------------------------------------
                if (isGreeting(msgBody) || buttonId === 'btn_back_menu') {
                    userFlow.delete(from);
                    await sendReaction(from, messageKey, '👋');
                    await sendMessage(from, `Olá, ${pushName}! 👋\n\nSou o *X-Bot* da XPACE. Como posso te ajudar hoje?`);
                    await sendButtons(from, "Escolha uma opção:", [
                        { id: "flow_dance", label: "💃 Quero Dançar" },
                        { id: "flow_prices", label: "💰 Ver Preços" },
                        { id: "flow_more", label: "📋 Mais Opções" }
                    ]);
                    return;
                }

                // Sub-menu para Mais Opções
                if (buttonId === 'flow_more') {
                    await sendButtons(from, "Outras opções:", [
                        { id: "flow_address", label: "📍 Localização" },
                        { id: "flow_human", label: "🙋 Falar com Humano" },
                        { id: "btn_back_menu", label: "🔙 Voltar" }
                    ]);
                    return;
                }

                // ----------------------------------------------------
                // 🔵 2. FLUXO DE DANÇA (Diagnóstico)
                // ----------------------------------------------------
                if (buttonId === 'flow_dance') {
                    userFlow.set(from, { step: 'ASK_EXPERIENCE' });
                    await sendButtons(from, "Que massa! 🤩 Para te recomendar a turma certa, me diz:", [
                        { id: "exp_beginner", label: "👶 Nunca dancei" },
                        { id: "exp_intermediate", label: "🕺 Já danço" }
                    ]);
                    return;
                }
                if (['exp_beginner', 'exp_intermediate'].includes(buttonId || '')) {
                    userFlow.set(from, { step: 'ASK_GOAL', experience: buttonId });
                    await sendButtons(from, "E o que você busca na dança?", [
                        { id: "goal_hobby", label: "😄 Hobby/Diversão" },
                        { id: "goal_exercise", label: "💪 Exercício" },
                        { id: "goal_pro", label: "🏆 Profissional" }
                    ]);
                    return;
                }
                if (['goal_hobby', 'goal_exercise', 'goal_pro'].includes(buttonId || '')) {
                    const state = userFlow.get(from);
                    const exp = state?.experience === 'exp_beginner' ? 'iniciante' : 'avançado';
                    let rec = exp === 'iniciante'
                        ? "Para começar do zero: **Street Dance Iniciante**, **K-Pop** ou **Dança de Salão**."
                        : "Para evoluir: **FitDance**, **Hip Hop Open Level** ou **Jazz**!";
                    await sendMessage(from, `Perfeito! ${rec}\n\n📅 Que tal uma aula experimental grátis?`);
                    await sendButtons(from, "Próximos passos:", [
                        { id: "flow_schedule", label: "📅 Agendar Aula" },
                        { id: "btn_back_menu", label: "🔙 Voltar" }
                    ]);
                    userFlow.delete(from);
                    return;
                }

                // ----------------------------------------------------
                // 🟡 3. OUTROS FLUXOS (Preço, Endereço, Humano)
                // ----------------------------------------------------
                if (buttonId === 'flow_prices') {
                    await sendMessage(from, "💰 **Investimento XPACE (2026)**\n\n💎 Anual: R$ 165/mês\n💳 Mensal: R$ 215/mês\n🎟️ Avulso: R$ 50\n\nQuer garantir sua vaga?");
                    await sendButtons(from, "Opções:", [
                        { id: "link_contrato", label: "📝 Fazer Matrícula" },
                        { id: "btn_back_menu", label: "🔙 Voltar" }
                    ]);
                    return;
                }
                if (buttonId === 'flow_address' || isLocationRequest(msgBody || '')) {
                    await sendLocation(from, -26.301385, -48.847589, "XPACE Escola de Dança", "Rua Tijucas, 401 - Centro, Joinville");
                    await sendMessage(from, "Estacionamento gratuito! 🚗");
                    return;
                }
                if (buttonId === 'flow_human') {
                    await sendMessage(from, "Chamei a equipe! Alguém já vem falar com você. 🙋‍♂️");
                    await notifySocios(`🚨 Humano Solicitado: ${pushName}`, { jid: from, name: pushName });
                    return;
                }
                if (buttonId === 'flow_schedule') {
                    await sendMessage(from, "Acesse aqui: https://agendamento.nextfit.com.br/f9b1ea53-0e0e-4f98-9396-3dab7c9fbff4");
                    return;
                }
                if (buttonId === 'link_contrato') {
                    await sendMessage(from, "Acesse aqui: https://venda.nextfit.com.br/54a0cf4a-176f-46d3-b552-aad35019a4ff/contratos");
                    return;
                }

                // ----------------------------------------------------
                // 🟣 4. IA HÍBRIDA (Fallback para dúvidas complexas)
                // ----------------------------------------------------
                if (!buttonId && msgBody && msgBody.length > 2) {
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

    // Limpa a fila quando terminar para liberar memória (opcional, mas bom pra evitar leak)
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
