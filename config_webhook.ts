import axios from 'axios';

const url = 'http://localhost:8080/webhook/set/XPACE';
const apiKey = 'xpace_secure_key_2025';

// Payload configuration - Correct schema based on EventDto
const payload = {
    webhook: {
        enabled: true,
        url: 'http://localhost:3001/webhook',
        byEvents: false,
        base64: false,
        events: [
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'CONNECTION_UPDATE',
            'SEND_MESSAGE'
        ]
    }
};

async function run() {
    console.log(`Setting webhook for instance XPACE...`);
    console.log(`Payload: ${JSON.stringify(payload, null, 2)}`);
    try {
        const res = await axios.post(url, payload, {
            headers: {
                apikey: apiKey,
                "Content-Type": "application/json"
            }
        });
        console.log('✅ Success:', JSON.stringify(res.data, null, 2));
    } catch (err: any) {
        console.error('❌ Error:', err.response?.data || err.message);
        if (err.response?.data?.response) {
            console.error('Details:', JSON.stringify(err.response.data.response, null, 2));
        }
    }
}

run();
