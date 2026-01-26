
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './src/config';

// Polyfill for missing fetch in older node versions if needed, but ts-node usually handles it or node 18+
// SDK 0.24.1 should work.

async function listModels() {
    console.log("🔍 Listing Available Models for API Key...");
    try {
        // Need to access the ModelManager directly if exposed, or infer from error.
        // The SDK doesn't always expose listModels directly on the main class in all versions.
        // Let's try to use the GenAI instance.
        const genAI = new GoogleGenerativeAI(config.gemini.apiKey || '');

        // Unfortunately the high-level SDK doesn't make listing models super easy in one line in all versions.
        // We might have to rely on the error message suggesting "Call ListModels" 
        // which implies we might be able to hit the REST endpoint if SDK fails.
        // But let's try the SDK method if it exists on the client.
        // Examining node_modules would be slow.

        // Let's try a direct REST call to be sure, avoiding SDK version quirks.
        const key = config.gemini.apiKey;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const data = await response.json();

        if (data.models) {
            console.log("✅ Models Found:");
            const modelsList = data.models.map((m: any) => `- ${m.name} (${m.displayName}) - Methods: ${JSON.stringify(m.supportedGenerationMethods)}`).join('\n');
            console.log("✅ Models Found (writing to file)");
            require('fs').writeFileSync('models.txt', modelsList);
        } else {
            console.error("❌ No models in response:", data);
        }

    } catch (e) {
        console.error("❌ Error listing models:", e);
    }
}

listModels();
