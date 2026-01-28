// Script de envio de mensagens em massa para ex-alunos AZ
// Usa a Evolution API para enviar mensagens com intervalo seguro

import axios from 'axios';
import * as fs from 'fs';

// Configuração
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'B6D711FCDE4D4FD5936544120E713976';
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'xpace';

// Intervalo entre mensagens (10-15 segundos - randomizado para parecer mais natural)
const MIN_INTERVAL = 10000; // 10 segundos
const MAX_INTERVAL = 15000; // 15 segundos

// Lista de números (formato: apenas números, sem formatação)
// Exemplo: ['5547999999999', '5547888888888']
const CONTACTS_FILE = './contacts_az.json';

// Mensagem a ser enviada
const MESSAGE = `Bom dia! Tudo bem? 😊

Devido à grande procura e aos pedidos dos pais e alunos sobre a nossa grade de horários, a *XPace Escola de Dança* preparou uma programação especial para atender a todos!

Já estamos com as matrículas abertas para:

🩰 *Infantil:* Ballet e Baby Class

💃 *Adulto:* Ballet, Jazz e Contemporâneo

🎭 *Ritmos e Arte:* Sapateado, Hip Hop e Teatro

🏆 *Performance:* Cia de Competição

📍 Estamos localizados na *Rua Tijucas, 401 - Centro*

Como muitos pais nos consultaram sobre essas modalidades específicas, as vagas estão sendo preenchidas por ordem de procura. Se você tiver interesse em algum desses horários, me avise por aqui para eu te enviar a tabela detalhada! 🩰✨

🌐 xpacecompany.com
📸 @xpaceescoladedanca`;

// Log file
const LOG_FILE = './bulk_send_log.json';

interface SendResult {
    number: string;
    status: 'success' | 'error';
    timestamp: string;
    error?: string;
}

function getRandomInterval(): number {
    return Math.floor(Math.random() * (MAX_INTERVAL - MIN_INTERVAL + 1)) + MIN_INTERVAL;
}

function formatNumber(number: string): string {
    // Remove tudo que não é número
    let clean = number.replace(/\D/g, '');

    // Adiciona código do país se não tiver
    if (!clean.startsWith('55')) {
        clean = '55' + clean;
    }

    // Adiciona @s.whatsapp.net
    return clean + '@s.whatsapp.net';
}

async function sendMessage(number: string): Promise<SendResult> {
    const jid = formatNumber(number);

    try {
        const response = await axios.post(
            `${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`,
            {
                number: jid.replace('@s.whatsapp.net', ''),
                text: MESSAGE
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': EVOLUTION_API_KEY
                }
            }
        );

        console.log(`✅ Enviado para ${number}`);
        return {
            number,
            status: 'success',
            timestamp: new Date().toISOString()
        };
    } catch (error: any) {
        console.error(`❌ Erro ao enviar para ${number}:`, error.message);
        return {
            number,
            status: 'error',
            timestamp: new Date().toISOString(),
            error: error.message
        };
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function loadContacts(): Promise<string[]> {
    try {
        const data = fs.readFileSync(CONTACTS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Arquivo de contatos não encontrado. Crie o arquivo contacts_az.json com a lista de números.');
        return [];
    }
}

function loadProgress(): SendResult[] {
    try {
        const data = fs.readFileSync(LOG_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

function saveProgress(results: SendResult[]): void {
    fs.writeFileSync(LOG_FILE, JSON.stringify(results, null, 2));
}

async function main() {
    console.log('🚀 Iniciando envio em massa...\n');

    const contacts = await loadContacts();
    if (contacts.length === 0) {
        console.log('Nenhum contato encontrado. Crie o arquivo contacts_az.json');
        return;
    }

    const previousResults = loadProgress();
    const sentNumbers = new Set(previousResults.filter(r => r.status === 'success').map(r => r.number));

    const toSend = contacts.filter(c => !sentNumbers.has(c));

    console.log(`📊 Total de contatos: ${contacts.length}`);
    console.log(`✅ Já enviados: ${sentNumbers.size}`);
    console.log(`📤 Pendentes: ${toSend.length}\n`);

    const results: SendResult[] = [...previousResults];

    for (let i = 0; i < toSend.length; i++) {
        const number = toSend[i];
        const progress = `[${i + 1}/${toSend.length}]`;

        console.log(`${progress} Enviando para ${number}...`);

        const result = await sendMessage(number);
        results.push(result);
        saveProgress(results);

        if (i < toSend.length - 1) {
            const interval = getRandomInterval();
            console.log(`⏳ Aguardando ${interval / 1000}s antes do próximo...\n`);
            await sleep(interval);
        }
    }

    // Estatísticas finais
    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    console.log('\n===========================================');
    console.log('📊 RELATÓRIO FINAL');
    console.log('===========================================');
    console.log(`✅ Enviados com sucesso: ${successCount}`);
    console.log(`❌ Erros: ${errorCount}`);
    console.log(`📁 Log salvo em: ${LOG_FILE}`);
    console.log('===========================================');
}

main().catch(console.error);
