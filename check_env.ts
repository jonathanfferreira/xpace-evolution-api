
import dotenv from 'dotenv';
dotenv.config();

console.log("DB URI present:", !!process.env.DATABASE_CONNECTION_URI);
console.log("Gemini Key present:", !!process.env.GEMINI_API_KEY);
console.log("Gemini Key length:", process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0);
if (process.env.GEMINI_API_KEY) {
    console.log("Gemini Key first 4 chars:", process.env.GEMINI_API_KEY.substring(0, 4));
}
