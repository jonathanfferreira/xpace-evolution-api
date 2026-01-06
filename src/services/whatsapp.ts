import axios from 'axios';



export async function sendMessage(to: string, text: string) {
    const apiKey = process.env.AUTHENTICATION_API_KEY || 'xpace_secure_key_2025';
    const serverUrl = process.env.SERVER_URL || 'http://localhost:8080';
    const instanceName = 'XPACE'; // Using cloud instance name XPACE

    if (!text) return;

    try {
        await axios.post(
            `${serverUrl}/message/sendText/${instanceName}`,
            {
                number: to,
                text: text,
                delay: 1200,
                linkPreview: true
            },
            {
                headers: {
                    apikey: apiKey,
                    "Content-Type": "application/json",
                },
            }
        );
        console.log(`Message sent to ${to} via Evolution API`);
    } catch (error: any) {
        console.error("Error sending message:", error?.response?.data || error.message);
    }
}

export async function sendButtons(to: string, text: string, buttons: { id: string, label: string }[]) {
    const apiKey = process.env.AUTHENTICATION_API_KEY || 'xpace_secure_key_2025';
    const serverUrl = process.env.SERVER_URL || 'http://localhost:8080';
    const instanceName = 'XPACE';

    if (!text || !buttons || buttons.length === 0) return;

    // Converter para o formato correto da Evolution API v2
    const formattedButtons = buttons.map(btn => ({
        type: "reply",
        buttonId: btn.id,
        buttonText: { displayText: btn.label }
    }));

    try {
        await axios.post(
            `${serverUrl}/message/sendButtons/${instanceName}`,
            {
                number: to,
                title: "XPACE",
                description: text,
                buttons: formattedButtons,
                delay: 1200
            },
            {
                headers: {
                    apikey: apiKey,
                    "Content-Type": "application/json",
                },
            }
        );
        console.log(`Buttons sent to ${to} via Evolution API`);
    } catch (error: any) {
        console.error("Error sending buttons:", error?.response?.data || error.message);
    }
}

export async function sendList(to: string, title: string, text: string, buttonText: string, sections: { title: string, rows: { id: string, title: string, description?: string }[] }[]) {
    const apiKey = process.env.AUTHENTICATION_API_KEY || 'xpace_secure_key_2025';
    const serverUrl = process.env.SERVER_URL || 'http://localhost:8080';
    const instanceName = 'XPACE';

    if (!text || !sections || sections.length === 0) return;

    try {
        await axios.post(
            `${serverUrl}/message/sendList/${instanceName}`,
            {
                number: to,
                title: title,
                text: text,
                buttonText: buttonText,
                sections: sections,
                delay: 1200
            },
            {
                headers: {
                    apikey: apiKey,
                    "Content-Type": "application/json",
                },
            }
        );
        console.log(`List sent to ${to} via Evolution API`);
    } catch (error: any) {
        console.error("Error sending list:", error?.response?.data || error.message);
    }
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
        console.log(`${type} sent to ${to} via Evolution API`);
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
