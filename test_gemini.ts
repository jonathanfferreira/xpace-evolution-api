import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;

async function testModel(modelName: string) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`;
    console.log(`\nTesting ${modelName}...`);
    try {
        const payload = {
            contents: [{ parts: [{ text: "Hello, are you there?" }] }]
        };
        const res = await axios.post(url, payload);
        console.log(`✅ Success! Status: ${res.status}`);
        // console.log(JSON.stringify(res.data, null, 2));
        return true;
    } catch (error: any) {
        console.log(`❌ Failed: ${error.message}`);
        if (error.response) {
            console.log(`   Response: ${JSON.stringify(error.response.data)}`);
        }
        return false;
    }
}

async function run() {
    console.log("Checking Gemini Models...");
    const v25 = await testModel('gemini-2.5-flash');
    if (!v25) {
        console.log("Trying 1.5-flash...");
        await testModel('gemini-1.5-flash');
    }
}

run();
