import { sendMessage } from './whatsapp';

// Configurações de Sócios
const SOCIOS = {
    ALCEU: '554791700812@s.whatsapp.net',
    // RUAN: '554799463474@s.whatsapp.net',
    JHONNEY: '554784970324@s.whatsapp.net'
};

export async function notifySocios(intent: string, userInfo: any) {
    let text = "";
    // Gera o link do WhatsApp (wa.me)
    const phone = userInfo.jid.replace('@s.whatsapp.net', '');
    const waLink = `https://wa.me/${phone}`;

    if (intent.startsWith("👁️")) {
        text = `🚨 *ALERTA DE LEITURA (XPACE)*\n\n${intent}\nAluno: ${userInfo.name || "Desconhecido"}\nLink: ${waLink}`;
    } else {
        text = `🚨 *ALERTA XPACE-BOT*\n\nUm aluno demonstrou forte interesse em: *${intent}*\nDe: ${userInfo.name || "Desconhecido"}\nLink: ${waLink}\n\nFavor entrar em contato!`;
    }

    // Notifica todos (ou apenas Alceu/Ruan/Jhonney como configurado)
    await sendMessage(SOCIOS.ALCEU, text);
    // await sendMessage(SOCIOS.RUAN, text); 
    await sendMessage(SOCIOS.JHONNEY, text);
}

export async function notifyQuizLead(data: { name: string, phone: string, result: string, score: any }) {
    const { name, phone, result } = data;
    const waLink = `https://wa.me/${phone}`;

    const text = `🎯 *NOVO LEAD DO QUIZ*\n\n` +
        `👤 *Nome:* ${name}\n` +
        `📱 *Tel:* ${phone}\n` +
        `🏆 *Resultado:* ${result}\n` +
        `🔗 *Link:* ${waLink}\n\n` +
        `_Este lead acabou de completar o quiz no site!_`;

    await sendMessage(SOCIOS.ALCEU, text);
    await sendMessage(SOCIOS.JHONNEY, text);
}
