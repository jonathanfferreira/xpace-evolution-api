import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { getHistory, saveMessage, clearHistory } from './services/memory';
import { generateResponse } from './services/ai';
import { sendMessage, sendButtons, sendMedia, sendPresence, sendReaction, sendLocation } from './services/whatsapp';

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

// Webhook Reception (Evolution API)
app.post('/webhook', async (req: Request, res: Response) => {
    const body = req.body;
    const event = body.event?.toLowerCase();

    if (event === 'messages.upsert' || event === 'messages_upsert') {
        const data = body.data;

        if (data.key.fromMe) {
            res.sendStatus(200);
            return;
        }

        const from = data.key.remoteJid;
        const pushName = (body.instanceData?.user || "Aluno").split(' ')[0];
        const messageKey = data.key;

        // 1. EXTRAÇÃO DA MENSAGEM (Texto ou Botão)
        let msgBody = data.message?.conversation ||
            data.message?.extendedTextMessage?.text ||
            data.message?.buttonsResponseMessage?.selectedDisplayText ||
            data.message?.listResponseMessage?.title;

        // Caso o usuário clique num botão, o ID também é útil
        const buttonId = data.message?.buttonsResponseMessage?.selectedButtonId;

        if (msgBody) {
            console.log(`Received: ${msgBody} from ${from}`);
            res.sendStatus(200);

            (async () => {
                try {
                    // 0. COMANDO DE RESET (Debug)
                    if (msgBody.toLowerCase().trim() === '/reset') {
                        await clearHistory(from);
                        await sendMessage(from, "🧠 Memória reiniciada com sucesso! Começando do zero.");
                        return;
                    }

                    // 0.1 COMANDO DE DEBUG (Ver Memória)
                    if (msgBody.toLowerCase().trim() === '/debug') {
                        const debugHistory = await getHistory(from);
                        const debugText = JSON.stringify(debugHistory, null, 2);
                        await sendMessage(from, `🐛 *DEBUG MEMORY* 🐛\n\n\`\`\`json\n${debugText}\n\`\`\``);
                        return;
                    }

                    // 1. REAÇÃO E STATUS (Humanização)
                    if (isGreeting(msgBody)) {
                        await sendReaction(from, messageKey, '👋');
                    }
                    await sendPresence(from, 'composing');

                    // 2. TRATAMENTO DE INTERAÇÕES ESPECÍFICAS
                    if (buttonId === 'agendar_aula') {
                        await sendMessage(from, `Bora dançar, ${pushName}! ✨ Escolha sua modalidade aqui: \n\nhttps://agendamento.nextfit.com.br/f9b1ea53-0e0e-4f98-9396-3dab7c9fbff4`);
                        return;
                    }

                    if (buttonId === 'ver_precos') {
                        await sendMessage(from, "Nossos planos são super flexíveis! 💰 Confira a tabela e escolha o seu clicando aqui: \n\nhttps://venda.nextfit.com.br/54a0cf4a-176f-46d3-b552-aad35019a4ff/contratos");
                        return;
                    }

                    // 3. ENVIO DE LOCALIZAÇÃO (Card do Maps)
                    if (isLocationRequest(msgBody)) {
                        await sendLocation(from, -26.301385, -48.847589, "XPACE Escola de Dança", "Rua Tijucas, 401 - Centro, Joinville - SC");
                        await sendMessage(from, "Aqui está nossa localização exata! Temos estacionamento próprio gratuito no local. 🚗💨");
                        return;
                    }

                    // 4. IA COM MEMÓRIA
                    // Debug: Ver o que está indo para o histórico
                    const history = await getHistory(from);
                    console.log(`[DEBUG] History for ${from}:`, JSON.stringify(history));

                    const aiResponse = await generateResponse(msgBody, history);

                    // Se a IA devolver uma mensagem de erro explícita (iniciada com "Erro:"), não salvamos na memória para não poluir
                    if (!aiResponse.startsWith("Erro:")) {
                        await saveMessage(from, 'user', msgBody);
                        await saveMessage(from, 'model', aiResponse);
                    }

                    await sendMessage(from, aiResponse);

                    // ...

                    // 5. MENU DE BOTÕES (Apenas se for início ou solicitado explicitamente)
                    // Removido o envio automático ao final de cada mensagem para não poluir o chat.
                    // A IA deve guiar a conversa. Se o usuário quiser o menu, ele pode pedir "menu".
                    if (msgBody.toLowerCase().trim() === 'menu') {
                        await sendButtons(from, `Aqui está nosso menu rápido:`, [
                            { id: "agendar_aula", label: "📅 Agendar Aula" },
                            { id: "ver_precos", label: "💰 Ver Preços" },
                            { id: "falar_humano", label: "🙋 Falar com Humano" }
                        ]);
                    }

                    // 6. NOTIFICAÇÃO DE INTERESSE
                    if (msgBody.toLowerCase().includes('matricula') || msgBody.toLowerCase().includes('fechar') || buttonId === 'falar_humano') {
                        await notifySocios(msgBody, { jid: from, name: pushName });
                    }

                } catch (error) {
                    console.error('Error processing message:', error);
                }
            })();
            return;
        }

        // 9. TRATAMENTO DE ÁUDIO (Log e Aviso)
        if (data.message?.audioMessage) {
            res.sendStatus(200);
            await sendReaction(from, messageKey, '🎧');
            await sendPresence(from, 'recording');
            setTimeout(async () => {
                await sendMessage(from, `Opa, já estou ouvindo seu áudio, ${pushName}! Só um minutinho... 🏃‍♂️💨`);
            }, 1000);
            return;
        }
    }

    res.sendStatus(200);
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
