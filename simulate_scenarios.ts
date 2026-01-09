import axios from 'axios';

const WEBHOOK_URL = 'http://localhost:3001/webhook';
const TEST_JID = '554799999999@s.whatsapp.net';



const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function runFlowTest() {
    console.log("🛠️ Starting Full Flow Test...");
    const FROM = '554799999998'; // Unique Tester

    // 1. Send Greeting (Expect Menu)
    await sendTestMessage("Oi", FROM);
    await delay(3000);

    // 2. Select 'Quero Dançar' (Expect Name Question)
    await sendTestMessage("1", FROM);
    await delay(3000);

    // 3. Send Name (Expect Age Question)
    await sendTestMessage("Jonathan", FROM);
    await delay(3000);

    // 4. Send Age (Expect Experience)
    await sendTestMessage("25", FROM);
    await delay(3000);

    console.log("✅ Flow Test sequence completed. Check server logs/behavior.");
}

// Helper updated to accept custom number
async function sendTestMessage(text: string, remoteJid: string = TEST_JID) {
    console.log(`\n📨 Sending [${remoteJid}]: "${text}"`);
    try {
        await axios.post(WEBHOOK_URL, {
            event: 'messages.upsert',
            instanceData: { user: 'Tester da Silva' },
            data: {
                key: {
                    remoteJid: remoteJid + '@s.whatsapp.net',
                    fromMe: false,
                    id: 'TEST_MSG_' + Date.now()
                },
                message: { conversation: text }
            }
        });
        console.log('✅ Sent to webhook');
    } catch (err: any) {
        console.error('❌ Error hitting webhook:', err.message);
    }
}

runFlowTest();
