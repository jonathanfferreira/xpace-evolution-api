import axios from 'axios';



// Função Utilitária para Humanização (Digitando...)
export async function sendProfessionalMessage(to: string, text: string) {
    if (!text) return;

    // Calcular delay baseado no tamanho do texto
    // Mínimo 1s, Máximo 5s. Aprox 50ms por caractere.
    const typingTime = Math.min(5000, Math.max(1000, text.length * 50));

    // Enviar status "Digitando..."
    await sendPresence(to, 'composing');

    // Aguardar o tempo simulado
    await new Promise(resolve => setTimeout(resolve, typingTime));

    // Enviar a mensagem real
    await sendMessage(to, text);
}

export async function sendMessage(to: string, text: string) {
    const apiKey = process.env.AUTHENTICATION_API_KEY || 'xpace_secure_key_2025';
    const serverUrl = process.env.SERVER_URL || 'http://localhost:8080';
    const instanceName = 'XPACE';

    try {
        await axios.post(
            `${serverUrl}/message/sendText/${instanceName}`,
            {
                number: to,
                text: text,
                delay: 0, // Delay já tratado externamente se necessário
                linkPreview: true
            },
            {
                headers: {
                    apikey: apiKey,
                    "Content-Type": "application/json",
                },
            }
        );
        console.log(`Message sent to ${to}`);
    } catch (error: any) {
        console.error("Error sending message:", error?.response?.data || error.message);
    }
}

export async function sendButtons(to: string, text: string, buttons: { id: string, label: string }[]) {
    // FALLBACK: Enviar botões como TEXTO com números
    // Motivo: Evolution API v2 / WhatsApp frequentemente falha com botões interativos (Error 400)

    if (!text || !buttons || buttons.length === 0) return;

    let messageBody = text + "\n\n";
    buttons.forEach((btn, index) => {
        messageBody += `${index + 1}. ${btn.label}\n`;
    });

    console.log(`[FALLBACK] Sending buttons as text to ${to}`);
    await sendMessage(to, messageBody);
}

export async function sendList(to: string, title: string, text: string, buttonText: string, sections: { title: string, rows: { id: string, title: string, description?: string }[] }[]) {
    // FALLBACK: Enviar lista como TEXTO com números
    // Motivo: Evolution API v2 / WhatsApp frequentemente falha com listas interativas (Error 400)

    if (!text || !sections || sections.length === 0) return;

    // Humanização: Enviar "Digitando..."
    await sendPresence(to, 'composing');
    await new Promise(resolve => setTimeout(resolve, 1500));

    let messageBody = `*${title}*\n${text}\n\n`;

    let optionIndex = 1;
    sections.forEach(section => {
        if (section.title) messageBody += `*${section.title}*\n`;

        section.rows.forEach(row => {
            messageBody += `${optionIndex}. ${row.title}`;
            if (row.description) messageBody += ` - ${row.description}`;
            messageBody += "\n";
            optionIndex++;
        });
        messageBody += "\n";
    });

    console.log(`[FALLBACK] Sending list as text to ${to}`);
    await sendMessage(to, messageBody);
}

export async function sendMedia(to: string, url: string, type: 'image' | 'video' | 'document' | 'audio', caption: string = "") {
    const apiKey = process.env.AUTHENTICATION_API_KEY || 'xpace_secure_key_2025';
    const serverUrl = process.env.SERVER_URL || 'http://localhost:8080';
    const instanceName = 'XPACE';

    try {
        await axios.post(
            `${serverUrl}/message/sendMedia/${instanceName}`,
            {
                number: to,
                media: url,
                mediatype: type,
                caption: caption,
                delay: 1200
            },
            {
                headers: {
                    apikey: apiKey,
                    "Content-Type": "application/json",
                },
            }
        );
        console.log(`${type} sent to ${to}`);
    } catch (error: any) {
        console.error(`Error sending ${type}:`, error?.response?.data || error.message);
    }
}

export async function sendPresence(to: string, presence: 'composing' | 'recording' | 'paused') {
    const apiKey = process.env.AUTHENTICATION_API_KEY || 'xpace_secure_key_2025';
    const serverUrl = process.env.SERVER_URL || 'http://localhost:8080';
    const instanceName = 'XPACE';

    try {
        await axios.post(
            `${serverUrl}/chat/sendPresence/${instanceName}`,
            {
                number: to,
                presence: presence,
                delay: 0
            },
            {
                headers: {
                    apikey: apiKey,
                    "Content-Type": "application/json",
                },
            }
        );
    } catch (error: any) {
        console.error("Error sending presence:", error?.response?.data || error.message);
    }
}

export async function sendLocation(to: string, lat: number, lon: number, name: string, address: string) {
    const apiKey = process.env.AUTHENTICATION_API_KEY || 'xpace_secure_key_2025';
    const serverUrl = process.env.SERVER_URL || 'http://localhost:8080';
    const instanceName = 'XPACE';

    try {
        await axios.post(
            `${serverUrl}/message/sendLocation/${instanceName}`,
            {
                number: to,
                latitude: lat,
                longitude: lon,
                name: name,
                address: address
            },
            {
                headers: {
                    apikey: apiKey,
                    "Content-Type": "application/json",
                },
            }
        );
        console.log(`Location card sent to ${to}`);
    } catch (error: any) {
        console.error("Error sending location:", error?.response?.data || error.message);
    }
}

export async function sendReaction(to: string, messageKey: any, emoji: string) {
    const apiKey = process.env.AUTHENTICATION_API_KEY || 'xpace_secure_key_2025';
    const serverUrl = process.env.SERVER_URL || 'http://localhost:8080';
    const instanceName = 'XPACE';

    try {
        await axios.post(
            `${serverUrl}/message/sendReaction/${instanceName}`,
            {
                number: to,
                reaction: emoji,
                key: messageKey
            },
            {
                headers: {
                    apikey: apiKey,
                    "Content-Type": "application/json",
                },
            }
        );
        console.log(`Reaction ${emoji} sent`);
    } catch (error: any) {
        console.error("Error sending reaction:", error?.response?.data || error.message);
    }
}
