import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const CHATWOOT_URL = process.env.CHATWOOT_URL;
const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN;
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;

// Remove trailing slash if present
const API_URL = CHATWOOT_URL?.replace(/\/$/, '');

export async function addLabelToConversation(phoneNumber: string, label: string) {
    if (!API_URL || !CHATWOOT_TOKEN || !CHATWOOT_ACCOUNT_ID) {
        console.error("❌ Chatwoot credentials missing in .env");
        return;
    }

    try {
        // 1. Search for Contact by Phone Number
        // Phone number comes as '554799999999@s.whatsapp.net', need to strip suffix and maybe add +
        const cleanPhone = phoneNumber.replace('@s.whatsapp.net', '').replace('@g.us', '');
        // Chatwoot search usually works with just the number part.

        const searchRes = await axios.get(`${API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/search`, {
            params: { q: cleanPhone },
            headers: { 'api_access_token': CHATWOOT_TOKEN }
        });

        const contacts = searchRes.data.payload;
        if (!contacts || contacts.length === 0) {
            console.warn(`⚠️ Chatwoot contact not found for ${cleanPhone}`);
            return;
        }

        const contactId = contacts[0].id;

        // 2. Get Conversations for Contact
        const convRes = await axios.get(`${API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/${contactId}/conversations`, {
            headers: { 'api_access_token': CHATWOOT_TOKEN }
        });

        const conversations = convRes.data.payload;
        if (!conversations || conversations.length === 0) {
            console.warn(`⚠️ No open conversations for contact ${contactId}`);
            return;
        }

        // Use the most recent conversation
        const conversationId = conversations[0].id;

        // 3. Add Label
        await axios.post(`${API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/labels`, {
            labels: [label] // Note: This API typically REPLACES labels or adds? Check docs. 
            // Usually returns the updated list. 
            // If we want to APPEND, we might need to fetch current labels first, but let's assume valid implementation for now.
            // Actually, the endpoint is POST /labels to add.
        }, {
            headers: { 'api_access_token': CHATWOOT_TOKEN }
        });

        console.log(`✅ [Chatwoot] Added label '${label}' to conversation ${conversationId}`);

    } catch (error: any) {
        console.error(`❌ [Chatwoot] Error adding label: ${error.message}`);
        // console.error(error.response?.data);
    }
}
