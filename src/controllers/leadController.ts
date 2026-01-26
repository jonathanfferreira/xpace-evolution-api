import { Request, Response } from 'express';
import { sendMessage } from '../services/whatsapp';
import { notifySocios, notifyQuizLead } from '../services/notificationService';

// --- SITE LEAD (General Form) ---
export const handleNewLead = async (req: Request, res: Response) => {
    try {
        const { name, phone, intent, unit } = req.body;

        console.log(`[SITE LEAD] Novo lead recebido: ${name} (${phone}) - ${intent}`);

        // 1. Formata o telefone
        let cleanPhone = phone.toString().replace(/\D/g, '');
        if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
        if (!cleanPhone.startsWith('55')) cleanPhone = '55' + cleanPhone;
        const jid = cleanPhone + '@s.whatsapp.net';

        // 2. Mensagem de Boas-vindas
        const firstName = name.split(' ')[0];
        let welcomeMsg = "";

        if (intent === 'enrollment' || intent === 'matricula') {
            welcomeMsg = `Olá, ${firstName}! 👋\n\nVi que você se interessou pela matrícula na XPACE pelo nosso site. 🤩\n\nEu sou o X-Bot e posso tirar todas as suas dúvidas agora mesmo. Quer ver os planos ou horários?`;
        } else if (intent === 'doubt') {
            welcomeMsg = `Olá, ${firstName}! 👋\n\nRecebemos seu contato pelo site. Como posso ajudar com sua dúvida?`;
        } else {
            welcomeMsg = `Oi, ${firstName}! 👋\n\nObrigado pelo contato no site da XPACE. Logo nossa equipe vai te responder, mas se quiser agilizar, pode falar comigo por aqui!`;
        }

        await sendMessage(jid, welcomeMsg);

        // 3. Notifica Sócios
        await notifySocios(`🚀 NOVO LEAD DO SITE: ${intent}\nNome: ${name}\nTel: ${phone}`, { jid, name });

        res.status(200).json({ success: true, message: 'Lead processed' });

    } catch (error) {
        console.error('Erro ao processar lead do site:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

// --- QUIZ LEAD (Gamified Form) ---
export const handleQuizLead = async (req: Request, res: Response) => {
    try {
        const { name, phone, result, answers } = req.body;

        console.log(`[QUIZ LEAD] ${name} fez o quiz -> ${result}`);

        // 1. Formata o telefone
        let cleanPhone = phone.toString().replace(/\D/g, '');
        if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
        if (!cleanPhone.startsWith('55')) cleanPhone = '55' + cleanPhone;
        const jid = cleanPhone + '@s.whatsapp.net';

        // 2. Mensagem Personalizada (Baseada no Resultado)
        const firstName = name.split(' ')[0];
        let quizMsg = "";

        if (result === 'STREET DANCE / URBAN') {
            quizMsg = `E aí, ${firstName}! 🔥\n\nVi no nosso Quiz que você tem a alma das *Danças Urbanas*! 👟\n\nO Street Dance é perfeito pra gastar energia e aprender técnica com estilo. Quer ver os horários das turmas de Street?`;
        } else if (result === 'JAZZ / CONTEMPORÂNEO') {
            quizMsg = `Olá, ${firstName}! ✨\n\nO Quiz da XPACE indicou que *Jazz & Contemporâneo* combinam com você! 🦢\n\nTemos turmas focadas em técnica e expressão. Gostaria de conhecer a grade de horários?`;
        } else if (result === 'K-POP') {
            quizMsg = `Annyeong, ${firstName}! ✌️🇰🇷\n\nSeu resultado deu *K-POP*! Que tudo! Temos a melhor estrutura pra você dançar seus hits favoritos.\n\nQuer saber quando são os ensaios?`;
        } else {
            quizMsg = `Olá, ${firstName}! 👋\n\nVi que você completou nosso Quiz e seu estilo é *${result}*! Incrível.\n\nEu sou o X-Bot, quer agendar uma aula experimental dessa modalidade?`;
        }

        await sendMessage(jid, quizMsg);

        // 3. Notifica Sócios (Prioridade ALTA)
        await notifyQuizLead({ name, phone, result, score: answers });

        res.status(200).json({ success: true });

    } catch (error) {
        console.error('Erro ao processar lead do quiz:', error);
        res.status(500).json({ success: false });
    }
};
