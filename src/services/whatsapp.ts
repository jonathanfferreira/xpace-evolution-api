import axios from 'axios';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v22.0';

export async function sendMessage(to: string, text: string) {
    const apiKey = process.env.AUTHENTICATION_API_KEY || 'xpace_secure_key_2025';
    const serverUrl = process.env.SERVER_URL || 'http://localhost:8080';
    const instanceName = 'main'; // We'll use a fixed instance name 'main'

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
