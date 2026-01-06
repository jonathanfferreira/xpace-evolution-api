import { XPACE_CONTEXT } from './ai';

interface Message {
    role: 'user' | 'model';
    parts: { text: string }[];
}

const memoryStore: Record<string, Message[]> = {};
const MAX_HISTORY = 10;

export function getHistory(userId: string): Message[] {
    return memoryStore[userId] || [];
}

export function saveMessage(userId: string, role: 'user' | 'model', text: string) {
    if (!memoryStore[userId]) {
        memoryStore[userId] = [];
    }

    memoryStore[userId].push({
        role,
        parts: [{ text }]
    });

    // Keep only the last N messages
    if (memoryStore[userId].length > MAX_HISTORY) {
        memoryStore[userId].shift();
    }
}

export function clearHistory(userId: string) {
    delete memoryStore[userId];
}
