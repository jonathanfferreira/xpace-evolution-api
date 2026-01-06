import axios from 'axios';
import dotenv from 'dotenv';
import qrcode from 'qrcode-terminal';

dotenv.config();

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:8080';
const API_KEY = process.env.AUTHENTICATION_API_KEY || 'xpace_secure_key_2025';
const INSTANCE_NAME = 'main';


// ... (imports remain)

async function init() {
    const shouldDelete = process.argv.includes('--delete');
    console.log(`Checking Evolution API at ${SERVER_URL}...`);

    try {
        await checkApiStatus();

        if (shouldDelete) {
            await deleteInstance();
            // Wait a bit to ensure full deletion
            await new Promise(r => setTimeout(r, 2000));
        }

        await createInstance();
        await connectInstance();

    } catch (error: any) {
        // ... (error handling remains)
    }
}

// ... (other functions remain)

async function deleteInstance() {
    try {
        console.log(`🗑️ Deletando instância '${INSTANCE_NAME}' para limpar sessão...`);
        await axios.delete(
            `${SERVER_URL}/instance/delete/${INSTANCE_NAME}`,
            { headers: { apikey: API_KEY } }
        );
        console.log('✅ Instância deletada com sucesso.');
    } catch (error: any) {
        console.log('ℹ️ Instância não existia ou erro ao deletar (ignorando).');
    }
}

init();

async function checkApiStatus() {
    try {
        await axios.get(`${SERVER_URL}/instance/fetchInstances`, {
            headers: { apikey: API_KEY }
        });
        console.log('✅ Evolution API Online');
    } catch (error) {
        throw error;
    }
}

async function createInstance() {
    try {
        const { data } = await axios.post(
            `${SERVER_URL}/instance/create`,
            {
                instanceName: INSTANCE_NAME,
                token: "", // Token aleatório ou fixo para a instância
                qrcode: true,
                integration: 'WHATSAPP-BAILEYS',
            },
            { headers: { apikey: API_KEY } }
        );
        console.log(`✅ Instância '${INSTANCE_NAME}' criada/verificada.`);
        return data;
    } catch (error: any) {
        const errorMsg = JSON.stringify(error.response?.data || '');
        if (error.response?.status === 403 && (errorMsg.includes('already in use') || errorMsg.includes('already exists'))) {
            console.log(`ℹ️ Instância '${INSTANCE_NAME}' já existe. Prosseguindo para conexão...`);
            return;
        } else {
            throw error;
        }
    }
}

async function connectInstance() {
    try {
        const { data } = await axios.get(
            `${SERVER_URL}/instance/connect/${INSTANCE_NAME}`,
            { headers: { apikey: API_KEY } }
        );

        if (data && data.base64) {
            // QR Code recebido
            console.log('\n📱 Escaneie o QR Code abaixo com seu WhatsApp:\n');
            const qrCodeStr = data.code || data.base64; // Depende da versão, as vezes vem 'code' ou 'base64' com prefixo

            // Se vier base64 puro imagem, precisamos converter? 
            // Evolution v2 geralmente retorna base64 da imagem OU string do QR para terminal se configurado?
            // O endpoint connect retorna base64 da imagem. O endpoint /instance/qrcode retorna base64.

            // Vamos tentar renderizar se for string, mas geralmente é imagem.
            // Para terminal, melhor pegar a string do QR code se disponivel.
            // V2: data.base64 é a imagem. data.code é a string (se disponível).

            if (data.code) {
                qrcode.generate(data.code, { small: true });
            } else {
                console.log('⚠️ QR Code recebido em Base64 (Imagem). Abra o navegador ou decodifique para ver.');
                console.log(data.base64.substring(0, 50) + '...');
            }

        } else if (data && data.instance && data.instance.state === 'open') {
            console.log('✅ WhatsApp já conectado!');
        } else {
            console.log('Estado da instância:', data);
        }
    } catch (error: any) {
        throw error;
    }
}

init();
