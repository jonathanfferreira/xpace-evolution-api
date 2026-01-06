import { getHistory, saveMessage, clearHistory } from '../services/memory';
import { generateResponse } from '../services/ai';
import dotenv from 'dotenv';
import path from 'path';

// Carregar .env da raiz do projeto (d:\antigravity\xpace\automação\.env)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const TEST_USER_ID = 'integration_test_user_12345'; // ID único para teste

async function runTest() {
    console.log(`🚀 Iniciando Teste de Integração (User: ${TEST_USER_ID})`);

    const dbUri = process.env.DATABASE_CONNECTION_URI;
    console.log(`📊 ENV CHECK: DATABASE_CONNECTION_URI is ${dbUri ? 'DEFINED' : 'UNDEFINED'} (${dbUri ? dbUri.substring(0, 10) + '...' : 'NULL'})`);

    try {
        // 1. Limpar memória antiga
        console.log('🧹 Limpando memória antiga...');
        await clearHistory(TEST_USER_ID);

        // 2. Simular Conversa (Inserção no Banco Real)
        console.log('📝 Inserindo mensagens no banco...');

        const messages = [
            { role: 'user', content: 'Olá, gostaria de saber sobre as aulas.' },
            { role: 'model', content: 'Olá! Bem-vindo à XPACE. Você já dança ou é iniciante?' },
            { role: 'user', content: 'Eu sou iniciante.' },
            { role: 'model', content: 'Perfeito. E você busca dança por hobby ou profissional?' }
        ];

        // Inserir com pequeno delay para garantir timestamps diferentes (simular real)
        for (const msg of messages) {
            await saveMessage(TEST_USER_ID, msg.role as 'user' | 'model', msg.content);
            await new Promise(r => setTimeout(r, 100)); // 100ms delay
        }

        // 3. Verificação de Leitura (O BUG ESTAVA AQUI)
        console.log('🔍 Buscando histórico do banco...');
        const history = await getHistory(TEST_USER_ID);

        console.log('📋 Histórico Recuperado:');
        history.forEach((h, i) => {
            console.log(`   [${i}] ${h.role}: ${h.parts[0].text}`);
        });

        // 4. Asserções
        if (history.length !== 4) {
            throw new Error(`❌ Tamanho do histórico incorreto! Esperado: 4, Recebido: ${history.length}`);
        }

        if (history[0].parts[0].text !== messages[0].content) {
            throw new Error(`❌ Ordem incorreta! A primeira mensagem deveria ser "${messages[0].content}", mas foi "${history[0].parts[0].text}"`);
        }

        if (history[3].parts[0].text !== messages[3].content) {
            throw new Error(`❌ Ordem incorreta! A última mensagem deveria ser "${messages[3].content}", mas foi "${history[3].parts[0].text}"`);
        }

        console.log('✅ TESTE DE MEMÓRIA (DB): APROVADO! Ordem e Persistência estão corretas.');

        // 5. Teste de IA (Contexto)
        console.log('🤖 Testando resposta da IA com o contexto recuperado...');
        const nextPrompt = 'Apenas hobby mesmo.';

        // Adiciona a pergunta atual ao contexto simulado (como o server.ts faz)
        // Nota: generateResponse espera o histórico *anterior*, a msg atual vai no prompt.
        const response = await generateResponse(nextPrompt, history);

        console.log(`🗣️ Resposta da IA: "${response}"`);

        // Check simples se a IA entendeu (ela deve recomendar uma turma de iniciante/hobby, e não perguntar de novo)
        if (response.toLowerCase().includes('iniciante') || response.toLowerCase().includes('hobby') || response.toLowerCase().includes('turma')) {
            console.log('✅ TESTE DE INTELIGÊNCIA: APROVADO! A IA usou o contexto.');
        } else {
            console.log('⚠️ ALERTA: A IA pode não ter usado o contexto corretamente (Verifique a resposta acima).');
        }

    } catch (error) {
        console.error('❌ ERRO NO TESTE:', error);
        process.exit(1);
    } finally {
        // Limpar após teste
        console.log('🧹 Limpando dados de teste...');
        await clearHistory(TEST_USER_ID);
        process.exit(0);
    }
}

runTest();
