
import { config } from './src/config';
import { generateResponse } from './src/services/ai';

async function verify() {
    console.log("🔍 Configured Model:", config.gemini.model);
    console.log("🔑 API Key First 4:", config.gemini.apiKey ? config.gemini.apiKey.substring(0, 4) : "NONE");

    try {
        const response = await generateResponse("verify-user", "Oi, funciona?");
        console.log("✅ RESULT:", response);
    } catch (e) {
        console.error("❌ ERROR:", e);
    }
}

verify();
