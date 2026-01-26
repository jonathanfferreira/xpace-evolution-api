
import axios from 'axios';
import { config } from '../src/config';
import fs from 'fs';
import path from 'path';

async function setupAlceu() {
    const { serverUrl, apiKey, instance: mainInstance } = config.evolutionApi;
    const newInstanceName = 'XPACE_ALCEU';

    console.log(`🔌 Conectando ao Evolution API: ${serverUrl}`);

    try {
        // 1. Obter Webhook da Instância Principal
        console.log(`🔍 Buscando webhook da instância principal (${mainInstance})...`);
        const mainConfig = await axios.get(`${serverUrl}/webhook/find/${mainInstance}`, {
            headers: { apikey: apiKey }
        });

        const webhookUrl = mainConfig.data?.webhook?.url || mainConfig.data?.url;
        // Evolution API schema varies by version. Assuming standard.
        // If not found, ask user.

        if (!webhookUrl) {
            console.error("❌ Não foi possível encontrar a URL do Webhook na instância XPACE. Verifique manualmente.");
            // Fallback: try to guess or use placeholder
        } else {
            console.log(`✅ Webhook encontrado: ${webhookUrl}`);
        }

        // 2. Criar Nova Instância
        console.log(`🔨 Criando instância ${newInstanceName}...`);
        try {
            await axios.post(`${serverUrl}/instance/create`, {
                instanceName: newInstanceName,
                token: "", // Optional
                qrcode: true,
                webhook: webhookUrl || "https://SEU-BOT-URL-AQUI/webhook", // Placeholder if null
                events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE"] // Common events
            }, {
                headers: { apikey: apiKey }
            });
            console.log(`✅ Instância ${newInstanceName} criada!`);
        } catch (e: any) {
            if (e.response?.data?.error?.includes('already exists')) {
                console.log(`⚠️ Instância ${newInstanceName} já existe.`);
                // Update webhook just in case
                if (webhookUrl) {
                    await axios.post(`${serverUrl}/webhook/set/${newInstanceName}`, {
                        webhook: {
                            enabled: true,
                            url: webhookUrl,
                            byEvents: false,
                            base64: false,
                            events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE"]
                        }
                    }, { headers: { apikey: apiKey } });
                    console.log(`🔄 Webhook atualizado.`);
                }
            } else {
                throw e;
            }
        }

        // 3. Obter QR Code
        console.log(`📷 Buscando QR Code...`);
        const qrResponse = await axios.get(`${serverUrl}/instance/connect/${newInstanceName}`, {
            headers: { apikey: apiKey }
        });

        const base64 = qrResponse.data?.base64 || qrResponse.data?.qrcode?.base64;

        if (base64) {
            const buffer = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ""), 'base64');
            fs.writeFileSync('qrcode_alceu.png', buffer);
            console.log(`✅ QR Code salvo em: ${path.resolve('qrcode_alceu.png')}`);
            console.log(`🚀 POR FAVOR, ABRA A IMAGEM E ESCANEIE COM O WHATSAPP DO ALCEU!`);
        } else {
            console.log("⚠️ Não foi possível obter o QR Code (talvez já esteja conectado?)");
        }

    } catch (error: any) {
        console.error("❌ Erro:", error?.response?.data || error.message);
    }
}

setupAlceu();
