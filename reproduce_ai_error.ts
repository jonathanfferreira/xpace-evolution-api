
import dotenv from 'dotenv';
import { generateResponse } from './src/services/ai';

dotenv.config();

async function testAI() {
    console.log("🧪 Testing AI Service...");
    try {
        const response = await generateResponse("test-user-123", "Olá, quais os horários de Street Dance?");
        console.log("✅ Response received:", response);
    } catch (error) {
        console.error("❌ Test Failed:", error);
    }
}

testAI();
