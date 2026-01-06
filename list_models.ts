import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function fetchModelsDirectly() {
    const key = process.env.GEMINI_API_KEY;
    console.log(`Checking models for key ending in ...${key?.slice(-4)}`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

    try {
        const response = await axios.get(url);
        const data = response.data;

        console.log("=== MODELOS DISPONÍVEIS NA SUA CONTA ===");
        if (data.models) {
            data.models.forEach((m: any) => {
                // Filtra só os que geram conteúdo (chat)
                if (m.supportedGenerationMethods.includes("generateContent")) {
                    console.log(`✅ ${m.name.replace('models/', '')}`);
                }
            });
        } else {
            console.log(data);
        }
    } catch (error: any) {
        console.error("Erro ao buscar modelos:", error.response?.data || error.message);
    }
}

fetchModelsDirectly();
