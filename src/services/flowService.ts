import { sendMessage, sendProfessionalMessage, sendList, sendLocation, sendReaction } from './whatsapp';
import { getFlowState, saveFlowState, deleteFlowState, saveStudentProfile, getStudentProfile } from './memory';
import { notifySocios } from './notificationService';
import { addLabelToConversation } from './chatwoot';
import { isGreeting } from '../utils/textUtils';

// Configurações Globais
const SOCIOS = {
    ALCEU: '554791700812@s.whatsapp.net',
};

// HELPER: Schedule Booking Follow-up
const followUpQueue = new Map<string, NodeJS.Timeout>();

export function scheduleBookingFollowUp(jid: string, pushName: string, instance?: string) {
    if (followUpQueue.has(jid)) clearTimeout(followUpQueue.get(jid)!);

    const timer = setTimeout(async () => {
        try {
            await sendProfessionalMessage(jid,
                `Opa, ${pushName}! 👋\n\nPassando só pra saber se você conseguiu acessar o link de agendamento ou se ficou com alguma dúvida?\n\nQualquer coisa, estou por aqui! 😉`,
                instance
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
export async function handleScheduleLead(msgBody: string, from: string, pushName: string, instance?: string): Promise<boolean> {
    if (!msgBody.includes('Vi a aula de') && !msgBody.includes('agendar uma experimental')) return false;

    console.log(`[SCHEDULE LEAD] Detectado click na Grade de Horários: ${from}`);

    const lowerMsg = msgBody.toLowerCase();
    let targetModality = identifyModality(lowerMsg);

    if (targetModality) {
        await sendProfessionalMessage(from, `Olá, ${pushName}! 👋\n\nQue legal que você se interessou pela aula da grade! 🤩`, instance);
        await sendModalityDetails(from, targetModality, instance);
        await notifySocios(`🚀 NOVO LEAD DA GRADE: ${msgBody}\nDe: ${pushName}`, { jid: from, name: pushName });
        return true;
    }
    return false;
}

// ----------------------------------------------------
// 2. SITE LEAD FALLBACK (Mensagem vinda do site)
// ----------------------------------------------------
export async function handleSiteLeadFallback(msgBody: string, from: string, pushName: string, instance?: string): Promise<boolean> {
    if (!msgBody.includes('NOVA MENSAGEM DO SITE')) return false;

    console.log(`[SITE FALLBACK] Detectado texto do site vindo de ${from}`);

    const parts = msgBody.split('*Mensagem:*');
    const userMessage = parts.length > 1 ? parts[1].trim() : "";
    const lowerMsg = userMessage.toLowerCase();

    let targetModality = identifyModality(lowerMsg);

    if (targetModality) {
        await sendProfessionalMessage(from, `Olá, ${pushName}! 👋\n\nVi que você tem interesse em *${targetModality.toUpperCase()}*! Ótima escolha. 🤩`, instance);
        await sendModalityDetails(from, targetModality, instance);
        await notifySocios(`🚀 NOVO LEAD VIA LINK (JÁ FILTRADO): ${targetModality.toUpperCase()}\nDe: ${pushName}`, { jid: from, name: pushName });
    } else {
        await sendProfessionalMessage(from, "Olá! Recebi sua mensagem. Como sou um robô, não entendi exatamente o que você disse, mas escolha uma opção abaixo que eu te ajudo! 👇", instance);
        setTimeout(async () => {
            await sendMainMenu(from, pushName, instance);
        }, 2000);
    }
    return true;
}

// ----------------------------------------------------
// 3. PALAVRAS-CHAVE DIRETAS (Grade, Preço, Local, Humano)
// ----------------------------------------------------
export async function handleDirectKeywords(msgBody: string, from: string, pushName: string, input: string, instance?: string): Promise<boolean> {
    // Ignora se estiver navegando no menu
    if (input?.startsWith('menu_') || input?.startsWith('exp_') || input?.startsWith('goal_') || input?.startsWith('mod_')) return false;

    const lowerMsg = msgBody.toLowerCase();

    // Grade
    if (lowerMsg.includes('grade') || lowerMsg.includes('horario') || lowerMsg.includes('aulas') || lowerMsg.includes('turmas')) {
        if (isGreeting(msgBody)) {
            await sendProfessionalMessage(from, `Olá, ${pushName}! 👋\n\nVi que você quer saber nossos horários. É pra já!`, instance);
            await new Promise(r => setTimeout(r, 1000));
        }
        await sendScheduleList(from, instance);
        await saveFlowState(from, 'SELECT_MODALITY');
        return true;
    }

    // Preços
    if (lowerMsg.includes('preco') || lowerMsg.includes('preço') || lowerMsg.includes('valor') || lowerMsg.includes('custo') || lowerMsg.includes('mensalidade')) {
        await sendPrices(from, pushName, instance);
        return true;
    }

    // Localização
    if (lowerMsg.includes('endereco') || lowerMsg.includes('endereço') || lowerMsg.includes('onde fica') || lowerMsg.includes('local') || lowerMsg.includes('mapa')) {
        await sendLocationInfo(from, instance);
        return true;
    }

    // Humano
    if (lowerMsg.includes('humano') || lowerMsg.includes('atendente') || lowerMsg.includes('falar com gente') || lowerMsg.includes('suporte')) {
        await sendHumanHandoff(from, pushName, instance);
        return true;
    }

    return false;
}

// ----------------------------------------------------
// 4. MENU SELECTION LOGIC
// ----------------------------------------------------
export async function handleMenuSelection(input: string, from: string, pushName: string, currentState: any, instance?: string): Promise<boolean> {
    if (currentState?.step === 'MENU_MAIN') {
        // 1. Quero Dançar
        if (input === 'menu_dance' || input === '1' || input.includes('dança')) {
            await sendProfessionalMessage(from, "Que incrível que você quer dançar com a gente! 🤩\n\nPara eu te indicar a turma perfeita, preciso te conhecer um pouquinho melhor.\n\nPrimeiro, *como você gostaria de ser chamado?*", instance);
            await saveFlowState(from, 'ASK_NAME');
            addLabelToConversation(from, 'prospect').catch(err => console.error(err));
            return true;
        }

        // 1.B Voltar ao Menu
        if (input === 'menu_menu' || input === '0' || input === 'voltar') {
            await sendMainMenu(from, pushName, instance);
            return true;
        }

        // 2. Grade
        if (input === 'menu_schedule' || input === '2' || input.includes('grade') || input.includes('horario')) {
            await sendScheduleList(from, instance);
            await saveFlowState(from, 'SELECT_MODALITY');
            return true;
        }

        // 3.B Agendar (Vindo do final do fluxo)
        if (input === 'final_booking' || input === 'agendar aula') {
            await sendProfessionalMessage(from, "Maravilha! Vamos agendar. 🤩\n\nVocê pode garantir sua vaga direto pelo nosso sistema ou ver os valores primeiro.", instance);
            setTimeout(async () => {
                await sendPrices(from, pushName, instance);
            }, 1000);
            return true;
        }

        // 3. Preços
        if (input === 'menu_prices' || input === '3' || input.includes('preço') || input.includes('valor')) {
            await sendPrices(from, pushName, instance);
            return true;
        }

        // 4. Localização
        if (input === 'menu_location' || input === '4' || input.includes('endereço')) {
            await sendLocationInfo(from, instance);
            return true;
        }

        // 5. Humano
        if (input === 'menu_human' || input === '5' || input.includes('humano')) {
            await sendHumanHandoff(from, pushName, instance);
            return true;
        }

        // 6. Outros/Lutas/Etc (Opção oculta/extra)
        if (input === 'mod_outros' || input === '6' || input.includes('todas')) {
            await sendOtherModalities(from, instance);
            return true;
        }

        // 7. Modalidades Específicas (Vindo da recomendação)
        if (input.startsWith('mod_')) {
            const modality = input.replace('mod_', '');
            await sendModalityDetails(from, modality, instance);
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

export async function sendMainMenu(from: string, pushName: string, instance?: string) {
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
    ], instance);
    await saveFlowState(from, 'MENU_MAIN');
}

async function sendModalityDetails(from: string, modality: string, instance?: string) {
    let details = "";
    if (modality === 'street') details = "👟 *STREET DANCE*\n\n*KIDS (5+):* Seg/Qua 08h, 14h30, 19h\n*JUNIOR (12+):* Seg/Qua 19h\n*SENIOR (16+):* Seg/Qua 20h";
    if (modality === 'jazz') details = "🦢 *JAZZ & CONTEMP.*\n\n*JAZZ (18+):* Seg/Qua 21h\n*JAZZ INICIANTE (18+):* Ter/Qui 20h\n*CONTEMPORÂNEO (12+):* Seg/Qua 19h";
    if (modality === 'kpop') details = "🇰🇷 *K-POP (12+)*\n\nConsulte nossa grade especial XTAGE para horários de K-Pop!";
    if (modality === 'ritmos') details = "💃 *RITMOS & FIT*\n\n*RITMOS (15+):* Ter/Qui 08h\n*FIT DANCE (15+):* Ter/Qui 19h";
    if (modality === 'heels') details = "👠 *HEELS (15+)*\n\nConsulte nossos consultores para a grade atualizada de Heels!";
    if (modality === 'lutas') details = "🥊 *LUTAS*\n\n*MUAY THAI (12+):* Ter/Qui 20h";
    if (modality === 'teatro') details = "🎭 *TEATRO & ACROBACIA*\n\n*TEATRO (12+):* Ter/Qui 09h\n*TEATRO (15+):* Ter/Qui 15h30\n*ACROBACIA (12+):* Seg/Qua 20h";
    if (modality === 'salao') details = "💃 *DANÇAS POPULARES*\n\n*POPULARES (12+):* Ter/Qui 14h";

    if (!details) details = "Ainda estamos atualizando os horários desta modalidade! 😅 Mas você pode perguntar para um de nossos consultores.";

    await sendProfessionalMessage(from, details, instance);
    await saveFlowState(from, 'VIEW_MODALITY_DETAILS', { viewing: modality });

    setTimeout(async () => {
        await sendList(from, "Próximos Passos", "Gostou dos horários?", "O QUE FAZER?", [
            { title: "Ações", rows: [{ id: "final_booking", title: "📅 Agendar Aula", description: "Quero experimentar!" }, { id: "menu_menu", title: "🔙 Ver outras opções", description: "Voltar ao menu" }] }
        ], instance);
    }, 2000);
}

export async function sendScheduleList(from: string, instance?: string) {
    await sendList(
        from, "Grade de Horários 📅", "Toque em uma modalidade:", "VER GRADE",
        [
            {
                title: "Modalidades",
                rows: [
                    { id: "mod_street", title: "👟 Street / Urban", description: "Kids, Teens, Adulto" },
                    { id: "mod_jazz", title: "🦢 Jazz / Contemp.", description: "Técnico, Funk, Lyrical" },
                    { id: "mod_kpop", title: "🇰🇷 K-Pop", description: "Coreografias" },
                    { id: "mod_ritmos", title: "💃 Ritmos / Fit", description: "Energia e Bem-estar" },
                    { id: "mod_outros", title: "✨ Ver Todas", description: "Heels, Lutas, Ballet, etc" },
                ]
            }
        ], instance
    );
}

export async function sendPrices(from: string, pushName: string, instance?: string) {
    await sendProfessionalMessage(from,
        `💰 *INVESTIMENTO XPACE (2026)* 🚀\n\n` +
        `💎 *PASSE LIVRE:* R$ 350/mês\n` +
        `*2x NA SEMANA:* Mensal R$ 215 | Semestral R$ 195 | Anual R$ 165\n\n` +
        `🔗 *GARANTIR VAGA:* https://venda.nextfit.com.br/54a0cf4a-176f-46d3-b552-aad35019a4ff/contratos`,
        instance
    );
    // Em vez de deletar, marcamos que o usuário viu os preços para o follow-up ser mais preciso
    await saveFlowState(from, 'VIEWED_PRICES', { timestamp: Date.now() });
    scheduleBookingFollowUp(from, pushName, instance);
}

export async function sendLocationInfo(from: string, instance?: string) {
    await sendLocation(from, -26.296210, -48.845500, "XPACE", "Rua Tijucas, 401 - Joinville", instance);
    await sendProfessionalMessage(from, "Estamos no coração de Joinville! 📍\n\n✅ Estacionamento gratuito.\n_Digite 0 para voltar._", instance);
    await deleteFlowState(from);
}

export async function sendHumanHandoff(from: string, pushName: string, instance?: string) {
    await sendProfessionalMessage(from, "Sem problemas! Já chamei alguém da equipe pra te ajudar. Aguarde! ⏳", instance);
    await saveFlowState(from, 'WAITING_FOR_HUMAN', { timestamp: Date.now() });
    await notifySocios(`🚨 SOLICITAÇÃO DE HUMANO: ${pushName}`, { jid: from, name: pushName });
    addLabelToConversation(from, 'human_handoff').catch(console.error);
}

async function sendOtherModalities(from: string, instance?: string) {
    await sendList(from, "Outras Modalidades ✨", "Escolha para ver os horários:", "VER MODALIDADE", [
        {
            title: "Mais Opções",
            rows: [
                { id: "mod_heels", title: "👠 Heels", description: "Dança no salto" },
                { id: "mod_lutas", title: "🥊 Lutas", description: "Muay Thai e Jiu Jitsu" },
                { id: "mod_teatro", title: "🎭 Teatro/Acro", description: "Expressão e movimento" },
                { id: "mod_salao", title: "💃 Dança de Salão", description: "Para dançar junto" },
                { id: "menu_menu", title: "🔙 Voltar", description: "Menu Principal" }
            ]
        }
    ], instance);
    await saveFlowState(from, 'SELECT_MODALITY');
}

export async function handleQuizResponse(msgBody: string, from: string, currentState: any, instance?: string): Promise<boolean> {
    try {
        const step = currentState?.step;
        console.log(`[QUIZ] Processando step ${step} para ${from}. Input: ${msgBody}`);

        // 1. Resposta do Nome
        if (step === 'ASK_NAME') {
            const name = msgBody.trim();
            if (!name) return false;

            await sendProfessionalMessage(from, `Prazer, ${name}! 😉\n\nAgora me conta: qual a sua idade (ou da criança que vai dançar)?\n_(Digite apenas o número)_`, instance);
            await saveFlowState(from, 'ASK_AGE', { name });
            await saveStudentProfile(from, { name });
            return true;
        }

        // 2. Resposta da Idade
        if (step === 'ASK_AGE') {
            const age = parseInt(msgBody.replace(/\D/g, ''));
            const name = currentState.data?.name || 'Aluno';

            if (!age || isNaN(age)) {
                await sendProfessionalMessage(from, "Ops, não entendi! Digite apenas a idade (número). Ex: 15", instance);
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

            await sendProfessionalMessage(from, `Entendi, ${age} anos! \n\n${recommendation}`, instance);

            // Pequeno delay para perguntar o objetivo (etapa sequencial, sem menu duplicado)
            await new Promise(r => setTimeout(r, 1500));

            // Próxima etapa: Perguntar Objetivo
            await sendList(from, "Seu Objetivo 🎯", "O que você busca com a dança?", "ESCOLHER OBJETIVO", [
                {
                    title: "Opções", rows: [
                        { id: "goal_fun", title: "Socializar e Diversão", description: "Conhecer pessoas e relaxar" },
                        { id: "goal_health", title: "Saúde e Bem-estar", description: "Atividade física e queima calórica" },
                        { id: "goal_learn", title: "Aprender Técnica", description: "Focar no aprendizado do zero" },
                        { id: "goal_pro", title: "Performance/Profissional", description: "Aperfeiçoamento e palcos" }
                    ]
                }
            ], instance);

            await saveFlowState(from, 'ASK_GOAL', { name, age, flowType });
            return true;
        }

        // 3. Resposta do Objetivo
        if (step === 'ASK_GOAL') {
            const goalId = msgBody.toLowerCase();
            const { name, age, flowType } = currentState.data;

            await sendList(from, "Sua Experiência 💃", "Você já dançou antes?", "ESCOLHER EXPERIÊNCIA", [
                {
                    title: "Opções", rows: [
                        { id: "exp_none", title: "Nunca dancei", description: "Quero começar do zero" },
                        { id: "exp_basic", title: "Já fiz algumas aulas", description: "Conheço o básico" },
                        { id: "exp_advanced", title: "Já danço há tempo", description: "Tenho experiência" }
                    ]
                }
            ], instance);

            await saveFlowState(from, 'ASK_EXPERIENCE', { name, age, flowType, goalId });
            return true;
        }

        // 4. Resposta da Experiência e Recomendação Final
        if (step === 'ASK_EXPERIENCE') {
            const expId = msgBody.toLowerCase();
            const { name, age, flowType, goalId } = currentState.data;

            const recommendation = getPersonalizedRecommendation(age, goalId, expId);

            await sendProfessionalMessage(from, `Incrível, ${name}! Com base no que você me contou, preparei uma recomendação especial para você:`, instance);

            setTimeout(async () => {
                await sendProfessionalMessage(from, recommendation.text, instance);

                setTimeout(async () => {
                    await sendList(from, "Próximos Passos", "O que achou da recomendação?", "VER OPÇÕES", [
                        {
                            title: "Ações", rows: [
                                { id: recommendation.modalityId, title: "📅 Ver Horários", description: "Ver grade desta turma" },
                                { id: "menu_schedule", title: "🗓️ Ver Grade Completa", description: "Ver todas as turmas" },
                                { id: "menu_human", title: "🙋‍♂️ Falar com Consultor", description: "Tirar dúvidas específicas" }
                            ]
                        }
                    ], instance);
                    await saveFlowState(from, 'MENU_MAIN', { name, age, flowType, goalId, expId, recommended: recommendation.modalityId });
                    await saveStudentProfile(from, {
                        name,
                        age,
                        goal: goalId,
                        experience: expId,
                        last_recommendation: recommendation.modalityId
                    });
                }, 2000);
            }, 1500);

            return true;
        }

        return false;
    } catch (error) {
        console.error(`[QUIZ ERROR] Erro no processamento do quiz para ${from}:`, error);
        await sendProfessionalMessage(from, "Ops, tive um pequeno probleminha técnico aqui! 😅 Mas já estou de volta. Pode repetir o que você disse?", instance);
        return true;
    }
}

function getPersonalizedRecommendation(age: number, goalId: string, expId: string): { text: string, modalityId: string } {
    // Lógica de Recomendação
    if (age <= 11) {
        return {
            text: "Para os pequenos, nossa recomendação é o **KIDS XPACE**! 🧸\n\nÉ um mix de Street e Jazz que foca na coordenação e diversão. É perfeito para começar com o pé direito!",
            modalityId: "mod_street"
        };
    }

    if (goalId.includes('health') || goalId.includes('fun')) {
        return {
            text: "Você vai amar nossas aulas de **RITMOS / FIT**! 🔥\n\nMuita energia, música boa e queima calórica sem nem perceber que está treinando. É a escolha ideal para quem quer se divertir e cuidar da saúde!",
            modalityId: "mod_ritmos"
        };
    }

    if (expId.includes('none') || expId.includes('basic')) {
        if (age >= 12 && age < 16) {
            return {
                text: "Nossa turma de **STREET TEEN** é o lugar certo! ⚡\n\nUma galera da sua idade, aprendendo as bases das danças urbanas com muita vibe. Você vai se sentir em casa!",
                modalityId: "mod_street"
            };
        }
        return {
            text: "Recomendo começar pelo **STREET DANCE INICIANTE**! 👟\n\nPasso a passo, do zero, para você ganhar confiança e dominar o ritmo. É nossa turma mais procurada por quem está começando!",
            modalityId: "mod_street"
        };
    }

    // Default para experientes ou performance
    return {
        text: "Para o seu nível, as turmas de **STREET SENIOR** ou **JAZZ FUNK** são ideais! 🔥\n\nFoco em coreografia, performance e técnica avançada. Vamos elevar sua dança para o próximo nível!",
        modalityId: "mod_street"
    };
}
