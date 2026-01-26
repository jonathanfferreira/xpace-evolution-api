import axios from 'axios';
import { config } from '../config';


// Função Utilitária para Humanização (Digitando...)
// Função Utilitária para Humanização (Digitando...)
export async function sendProfessionalMessage(to: string, text: string, instance?: string) {
    if (!text) return;

    // Calcular delay baseado no tamanho do texto
    // Mínimo 1s, Máximo 5s. Aprox 50ms por caractere.
    const typingTime = Math.min(5000, Math.max(1000, text.length * 50));

    // Enviar status "Digitando..."
    await sendPresence(to, 'composing', instance);

    // Aguardar o tempo simulado
    await new Promise(resolve => setTimeout(resolve, typingTime));

    // Enviar a mensagem real
    await sendMessage(to, text, instance);
}

export async function sendMessage(to: string, text: string, instance?: string) {
    const { apiKey, serverUrl, instance: defaultInstance } = config.evolutionApi;
    const targetInstance = instance || defaultInstance;

    try {
        await axios.post(
            `${serverUrl}/message/sendText/${targetInstance}`,
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
        console.log(`Message sent to ${to} via ${targetInstance}`);
    } catch (error: any) {
        console.error("Error sending message:", error?.response?.data || error.message);
    }
}

export async function sendButtons(to: string, text: string, buttons: { id: string, label: string }[], instance?: string) {
    // FALLBACK: Enviar botões como TEXTO com números
    if (!text || !buttons || buttons.length === 0) return;

    let messageBody = text + "\n\n";
    buttons.forEach((btn, index) => {
        messageBody += `${index + 1}. ${btn.label}\n`;
    });

    console.log(`[FALLBACK] Sending buttons as text to ${to}`);
    await sendMessage(to, messageBody, instance);
}

export async function sendList(to: string, title: string, text: string, buttonText: string, sections: { title: string, rows: { id: string, title: string, description?: string }[] }[], instance?: string) {
    // FALLBACK: Enviar lista como TEXTO com números
    if (!text || !sections || sections.length === 0) return;

    // Humanização: Enviar "Digitando..."
    await sendPresence(to, 'composing', instance);
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
    await sendMessage(to, messageBody, instance);
}

export async function sendMedia(to: string, url: string, type: 'image' | 'video' | 'document' | 'audio', caption: string = "", instance?: string) {
    const { apiKey, serverUrl, instance: defaultInstance } = config.evolutionApi;
    const targetInstance = instance || defaultInstance;

    try {
        await axios.post(
            `${serverUrl}/message/sendMedia/${targetInstance}`,
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
        console.log(`${type} sent to ${to} via ${targetInstance}`);
    } catch (error: any) {
        console.error(`Error sending ${type}:`, error?.response?.data || error.message);
    }
}

export async function sendPresence(to: string, presence: 'composing' | 'recording' | 'paused', instance?: string) {
    const { apiKey, serverUrl, instance: defaultInstance } = config.evolutionApi;
    const targetInstance = instance || defaultInstance;

    try {
        await axios.post(
            `${serverUrl}/chat/sendPresence/${targetInstance}`,
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

export async function sendLocation(to: string, lat: number, lon: number, name: string, address: string, instance?: string) {
    const { apiKey, serverUrl, instance: defaultInstance } = config.evolutionApi;
    const targetInstance = instance || defaultInstance;

    try {
        await axios.post(
            `${serverUrl}/message/sendLocation/${targetInstance}`,
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
        console.log(`Location card sent to ${to} via ${targetInstance}`);
    } catch (error: any) {
        console.error("Error sending location:", error?.response?.data || error.message);
    }
}

export async function sendReaction(to: string, messageKey: any, emoji: string, instance?: string) {
    const { apiKey, serverUrl, instance: defaultInstance } = config.evolutionApi;
    const targetInstance = instance || defaultInstance;

    try {
        await axios.post(
            `${serverUrl}/message/sendReaction/${targetInstance}`,
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
        console.log(`Reaction ${emoji} sent via ${targetInstance}`);
    } catch (error: any) {
        console.error("Error sending reaction:", error?.response?.data || error.message);
    }
}
