import { sendMessage, sendProfessionalMessage, sendList, sendLocation, sendReaction } from './whatsapp';
import { getFlowState, saveFlowState, deleteFlowState } from './memory';
import { notifySocios } from './notificationService';
import { addLabelToConversation } from './chatwoot';
import { isGreeting } from '../utils/textUtils';

// Configurações Globais
const SOCIOS = {
    ALCEU: '554791700812@s.whatsapp.net',
};

// HELPER: Schedule Booking Follow-up
const followUpQueue = new Map<string, NodeJS.Timeout>();

export function scheduleBookingFollowUp(jid: string, pushName: string) {
    if (followUpQueue.has(jid)) clearTimeout(followUpQueue.get(jid)!);

    const timer = setTimeout(async () => {
        try {
            await sendProfessionalMessage(jid,
                `Opa, ${pushName}! 👋\n\nPassando só pra saber se você conseguiu acessar o link de agendamento ou se ficou com alguma dúvida?\n\nQualquer coisa, estou por aqui! 😉`
            );
            followUpQueue.delete(jid);
        } catch (e) {
            console.error('Erro no follow-up:', e);
        }
    }, 15 * 60 * 1000); // 15 Minutos

    followUpQueue.set(jid, timer);
}

// ----------------------------------------------------
// 1. GRADE DE HORÁRIOS (Botão do Card)
// ----------------------------------------------------
export async function handleScheduleLead(msgBody: string, from: string, pushName: string): Promise<boolean> {
    if (!msgBody.includes('Vi a aula de') && !msgBody.includes('agendar uma experimental')) return false;

    console.log(`[SCHEDULE LEAD] Detectado click na Grade de Horários: ${from}`);

    const lowerMsg = msgBody.toLowerCase();
    let targetModality = identifyModality(lowerMsg);

    if (targetModality) {
        await sendProfessionalMessage(from, `Olá, ${pushName}! 👋\n\nQue legal que você se interessou pela aula da grade! 🤩`);
        await sendModalityDetails(from, targetModality);
        await notifySocios(`🚀 NOVO LEAD DA GRADE: ${msgBody}\nDe: ${pushName}`, { jid: from, name: pushName });
        return true;
    }
    return false;
}

// ----------------------------------------------------
// 2. SITE LEAD FALLBACK (Mensagem vinda do site)
// ----------------------------------------------------
export async function handleSiteLeadFallback(msgBody: string, from: string, pushName: string): Promise<boolean> {
    if (!msgBody.includes('NOVA MENSAGEM DO SITE')) return false;

    console.log(`[SITE FALLBACK] Detectado texto do site vindo de ${from}`);

    const parts = msgBody.split('*Mensagem:*');
    const userMessage = parts.length > 1 ? parts[1].trim() : "";
    const lowerMsg = userMessage.toLowerCase();

    let targetModality = identifyModality(lowerMsg);

    if (targetModality) {
        await sendProfessionalMessage(from, `Olá, ${pushName}! 👋\n\nVi que você tem interesse em *${targetModality.toUpperCase()}*! Ótima escolha. 🤩`);
        await sendModalityDetails(from, targetModality);
        await notifySocios(`🚀 NOVO LEAD VIA LINK (JÁ FILTRADO): ${targetModality.toUpperCase()}\nDe: ${pushName}`, { jid: from, name: pushName });
    } else {
        await sendProfessionalMessage(from, "Olá! Recebi sua mensagem. Como sou um robô, não entendi exatamente o que você disse, mas escolha uma opção abaixo que eu te ajudo! 👇");
        setTimeout(async () => {
            await sendMainMenu(from, pushName);
        }, 2000);
    }
    return true;
}

// ----------------------------------------------------
// 3. PALAVRAS-CHAVE DIRETAS (Grade, Preço, Local, Humano)
// ----------------------------------------------------
export async function handleDirectKeywords(msgBody: string, from: string, pushName: string, input: string): Promise<boolean> {
    // Ignora se estiver navegando no menu
    if (input?.startsWith('menu_') || input?.startsWith('exp_') || input?.startsWith('goal_') || input?.startsWith('mod_')) return false;

    const lowerMsg = msgBody.toLowerCase();

    // Grade
    if (lowerMsg.includes('grade') || lowerMsg.includes('horario') || lowerMsg.includes('aulas') || lowerMsg.includes('turmas')) {
        if (isGreeting(msgBody)) {
            await sendProfessionalMessage(from, `Olá, ${pushName}! 👋\n\nVi que você quer saber nossos horários. É pra já!`);
            await new Promise(r => setTimeout(r, 1000));
        }
        await sendScheduleList(from);
        await saveFlowState(from, 'SELECT_MODALITY');
        return true;
    }

    // Preços
    if (lowerMsg.includes('preco') || lowerMsg.includes('preço') || lowerMsg.includes('valor') || lowerMsg.includes('custo') || lowerMsg.includes('mensalidade')) {
        await sendPrices(from, pushName);
        return true;
    }

    // Localização
    if (lowerMsg.includes('endereco') || lowerMsg.includes('endereço') || lowerMsg.includes('onde fica') || lowerMsg.includes('local') || lowerMsg.includes('mapa')) {
        await sendLocationInfo(from);
        return true;
    }

    // Humano
    if (lowerMsg.includes('humano') || lowerMsg.includes('atendente') || lowerMsg.includes('falar com gente') || lowerMsg.includes('suporte')) {
        await sendHumanHandoff(from, pushName);
        return true;
    }

    return false;
}

// ----------------------------------------------------
// 4. MENU SELECTION LOGIC
// ----------------------------------------------------
export async function handleMenuSelection(input: string, from: string, pushName: string, currentState: any): Promise<boolean> {
    if (currentState?.step === 'MENU_MAIN') {
        // 1. Quero Dançar
        if (input === 'menu_dance' || input === '1' || input.includes('dança')) {
            await sendProfessionalMessage(from, "Que incrível que você quer dançar com a gente! 🤩\n\nPara eu te indicar a turma perfeita, preciso te conhecer um pouquinho melhor.\n\nPrimeiro, *como você gostaria de ser chamado?*");
            await saveFlowState(from, 'ASK_NAME');
            addLabelToConversation(from, 'prospect').catch(err => console.error(err));
            return true;
        }

        // 1.B Voltar ao Menu
        if (input === 'menu_menu' || input === '0' || input === 'voltar') {
            await sendMainMenu(from, pushName);
            return true;
        }

        // 2. Grade
        if (input === 'menu_schedule' || input === '2' || input.includes('grade') || input.includes('horario')) {
            await sendScheduleList(from);
            await saveFlowState(from, 'SELECT_MODALITY');
            return true;
        }

        // 3.B Agendar (Vindo do final do fluxo)
        if (input === 'final_booking' || input === 'agendar aula') {
            await sendProfessionalMessage(from, "Maravilha! Vamos agendar. 🤩\n\nVocê pode garantir sua vaga direto pelo nosso sistema ou ver os valores primeiro.");
            setTimeout(async () => {
                await sendPrices(from, pushName);
            }, 1000);
            return true;
        }

        // 3. Preços
        if (input === 'menu_prices' || input === '3' || input.includes('preço') || input.includes('valor')) {
            await sendPrices(from, pushName);
            return true;
        }

        // 4. Localização
        if (input === 'menu_location' || input === '4' || input.includes('endereço')) {
            await sendLocationInfo(from);
            return true;
        }

        // 5. Humano
        if (input === 'menu_human' || input === '5' || input.includes('humano')) {
            await sendHumanHandoff(from, pushName);
            return true;
        }

        // 6. Outros/Lutas/Etc (Opção oculta/extra)
        if (input === 'mod_outros' || input === '6' || input.includes('todas')) {
            await sendOtherModalities(from);
            return true;
        }
    }
    return false;
}

// ----------------------------------------------------
// HELPERS (Private)
// ----------------------------------------------------

function identifyModality(text: string): string {
    if (text.includes('street') || text.includes('urbana') || text.includes('funk')) return 'street';
    if (text.includes('jazz') || text.includes('contempor')) return 'jazz';
    if (text.includes('k-pop') || text.includes('kpop')) return 'kpop';
    if (text.includes('ritmos') || text.includes('ballet')) return 'ritmos';
    if (text.includes('teatro') || text.includes('acrobacia')) return 'teatro';
    if (text.includes('heels') || text.includes('salto')) return 'heels';
    if (text.includes('luta') || text.includes('muay') || text.includes('jiu')) return 'lutas';
    if (text.includes('populares') || text.includes('culture') || text.includes('hall')) return 'populares';
    if (text.includes('salao') || text.includes('salão') || text.includes('gafieira')) return 'salao';
    return "";
}

export async function sendMainMenu(from: string, pushName: string) {
    await sendList(from, "Menu XPACE", `Olá, ${pushName}! Sou o X-Bot.\nEscolha uma opção:`, "ABRIR MENU", [
        {
            title: "Navegação",
            rows: [
                { id: "menu_dance", title: "💃 Quero Dançar", description: "Encontre sua turma" },
                { id: "menu_schedule", title: "📅 Grade de Horários", description: "Ver dias e horas" },
                { id: "menu_prices", title: "💰 Ver Preços", description: "Planos e valores" },
                { id: "menu_location", title: "📍 Localização", description: "Endereço e mapa" },
                { id: "menu_human", title: "🙋‍♂️ Falar com Humano", description: "Atendimento equipe" }
            ]
        }
    ]);
    await saveFlowState(from, 'MENU_MAIN');
}

async function sendModalityDetails(from: string, modality: string) {
    let details = "";
    if (modality === 'street') details = "👟 *STREET & FUNK*\n\n*KIDS (5+):* Seg/Qua 08h, 14h30, 19h\n*TEENS/JUNIOR (12+):* Seg/Qua 19h | Ter/Qui 09h, 14h30\n*INICIANTE (12+):* Ter/Qui 20h\n*SENIOR/ADULTO (16+):* Seg/Qua 20h, Sex 19h, Sáb 10h\n*STREET FUNK (15+):* Sex 20h";
    if (modality === 'jazz') details = "🦢 *JAZZ & CONTEMP.*\n\n*JAZZ FUNK (15+):* Ter 19h, Sáb 09h\n*JAZZ (18+):* Seg/Qua 20h (Inic) | Seg/Qua 21h\n*CONTEMP (12+):* Seg/Qua 19h";
    if (modality === 'kpop') details = "🇰🇷 *K-POP (12+)*\n\nTer/Qui 20h (XTAGE)";
    if (modality === 'ritmos') details = "💃 *RITMOS & BALLET*\n\n*RITMOS/FIT (15+):* Seg/Qua 08h, 19h | Ter/Qui 19h\n*BALLET (12+):* Ter/Qui 21h";
    // ... complete list
    if (modality === 'heels') details = "👠 *HEELS (15+)*\n\nQui 17h, 18h, 19h | Sáb 11h, 12h";
    // fallback for brevity
    if (!details) details = "Ainda estamos atualizando os horários desta modalidade! 😅";

    await sendProfessionalMessage(from, details);
    await saveFlowState(from, 'VIEW_MODALITY_DETAILS', { viewing: modality });

    setTimeout(async () => {
        await sendList(from, "Próximos Passos", "Gostou dos horários?", "O QUE FAZER?", [
            { title: "Ações", rows: [{ id: "final_booking", title: "📅 Agendar Aula", description: "Quero experimentar!" }, { id: "menu_menu", title: "🔙 Ver outras opções", description: "Voltar ao menu" }] }
        ]);
    }, 2000);
}

export async function sendScheduleList(from: string) {
    await sendList(
        from, "Grade de Horários 📅", "Toque em uma modalidade:", "VER GRADE",
        [
            {
                title: "Modalidades",
                rows: [
                    { id: "mod_street", title: "👟 Street / Urban", description: "Kids, Teens, Adulto" },
                    { id: "mod_jazz", title: "🦢 Jazz / Contemp.", description: "Técnico, Funk, Lyrical" },
                    { id: "mod_kpop", title: "🇰🇷 K-Pop", description: "Coreografias" },
                    // ... abbreviated
                    { id: "mod_outros", title: "✨ Ver Todas", description: "Heels, Lutas, Ballet" },
                ]
            }
        ]
    );
}

export async function sendPrices(from: string, pushName: string) {
    await sendProfessionalMessage(from,
        `💰 *INVESTIMENTO XPACE (2026)* 🚀\n\n` +
        `💎 *PASSE LIVRE:* R$ 350/mês\n` +
        `*2x NA SEMANA:* Mensal R$ 215 | Semestral R$ 195 | Anual R$ 165\n\n` +
        `🔗 *GARANTIR VAGA:* https://venda.nextfit.com.br/54a0cf4a-176f-46d3-b552-aad35019a4ff/contratos`
    );
    await deleteFlowState(from);
    scheduleBookingFollowUp(from, pushName);
}

export async function sendLocationInfo(from: string) {
    await sendLocation(from, -26.296210, -48.845500, "XPACE", "Rua Tijucas, 401 - Joinville");
    await sendProfessionalMessage(from, "Estamos no coração de Joinville! 📍\n\n✅ Estacionamento gratuito.\n_Digite 0 para voltar._");
    await deleteFlowState(from);
}

export async function sendHumanHandoff(from: string, pushName: string) {
    await sendProfessionalMessage(from, "Sem problemas! Já chamei alguém da equipe pra te ajudar. Aguarde! ⏳");
    await saveFlowState(from, 'WAITING_FOR_HUMAN', { timestamp: Date.now() });
    await notifySocios(`🚨 SOLICITAÇÃO DE HUMANO: ${pushName}`, { jid: from, name: pushName });
    addLabelToConversation(from, 'human_handoff').catch(console.error);
}

async function sendOtherModalities(from: string) {
    await sendProfessionalMessage(from, "✨ *OUTRAS MODALIDADES*\n\n👠 HEELS\n🥊 LUTAS\n🩰 BALLET\n🇧🇷 POPULARES\n💃 DANÇA DE SALÃO");
    await saveFlowState(from, 'VIEW_MODALITY_DETAILS', { viewing: 'outros' });
}

export async function handleQuizResponse(msgBody: string, from: string, currentState: any): Promise<boolean> {
    const step = currentState?.step;

    // 1. Resposta do Nome
    if (step === 'ASK_NAME') {
        const name = msgBody.trim();
        await sendProfessionalMessage(from, `Prazer, ${name}! 😉\n\nAgora me conta: qual a sua idade (ou da criança que vai dançar)?\n_(Digite apenas o número)_`);
        await saveFlowState(from, 'ASK_AGE', { name });
        return true;
    }

    // 2. Resposta da Idade
    if (step === 'ASK_AGE') {
        const age = parseInt(msgBody.replace(/\D/g, ''));
        const name = currentState.data?.name || 'Aluno';

        if (!age || isNaN(age)) {
            await sendProfessionalMessage(from, "Ops, não entendi! Digite apenas a idade (número). Ex: 15");
            return true;
        }

        let recommendation = "";
        let flowType = "";

        if (age <= 11) {
            recommendation = "Para essa idade, temos o **Baby Class** (3-5 anos) e o **Kids** (6-11 anos)! 🧸✨\n\n- Ballet\n- Jazz\n- Street Dance\n\nQuer ver os horários dessas turmas?";
            flowType = 'kids';
        } else if (age >= 12 && age < 16) {
            recommendation = "Show! Para teens (12-15 anos), a energia é lá em cima! ⚡\n\n- Street Dance\n- K-Pop\n- Jazz\n\nQuer ver a grade teen?";
            flowType = 'teen';
        } else {
            recommendation = "Para adultos (16+), temos turmas incríveis, do iniciante ao avançado! 🔥\n\n- Street / Hip Hop\n- Jazz & Heels\n- Ritmos / Fit\n\nQuer conferir os horários?";
            flowType = 'adult';
        }

        await sendProfessionalMessage(from, `Entendi, ${age} anos! \n\n${recommendation}`);

        // Pequeno delay para mandar os botões
        setTimeout(async () => {
            await sendList(from, "Recomendação", "Como quer prosseguir?", "VER OPÇÕES", [
                {
                    title: "Próximos Passos", rows: [
                        { id: "menu_schedule", title: "📅 Ver Horários", description: "Ver grade completa" },
                        { id: "mod_outros", title: "✨ Ver Estilos", description: "Saber mais sobre as aulas" }
                    ]
                }
            ]);
        }, 1500);

        // Finaliza o quiz resetando para MENU_MAIN ou deletando
        await saveFlowState(from, 'MENU_MAIN', { name, age, flowType });
        return true;
    }

    return false;
}
