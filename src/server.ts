import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { generateResponse } from './services/ai';
import { sendMessage } from './services/whatsapp';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

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

    console.log('Incoming webhook:', JSON.stringify(body, null, 2));

    // Evolution API sends 'event' property
    const event = body.event?.toLowerCase();
    if (event === 'messages.upsert' || event === 'messages_upsert') {
        const data = body.data;

        // Ensure it's not a status update or from me
        if (data.key.fromMe) {
            res.sendStatus(200);
            return;
        }

        const from = data.key.remoteJid;
        // Support both conversation (simple text) and extendedTextMessage (text with preview/formatting)
        const msgBody = data.message?.conversation || data.message?.extendedTextMessage?.text;

        if (msgBody) {
            console.log(`Received message from ${from}: ${msgBody}`);

            // Send 200 OK immediately
            res.sendStatus(200);

            // Processamento em Background
            (async () => {
                try {
                    // 1. Generate AI Response
                    console.log('Generating AI response...');
                    const aiResponse = await generateResponse(msgBody);
                    console.log(`AI Response: ${aiResponse}`);

                    // 2. Send Response via WhatsApp
                    console.log(`Sending response to ${from}...`);
                    await sendMessage(from, aiResponse);
                    console.log('Response sent successfully');
                } catch (error) {
                    console.error('Error processing message:', error);
                }
            })();
            return;
        }
    }

    // For other events or unhandled messages
    res.sendStatus(200);
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
