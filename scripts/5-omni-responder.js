import dotenv from 'dotenv';
import fs from 'fs';
import OpenAI from 'openai';
import path from 'path';
import qrcode from 'qrcode-terminal';
import { fileURLToPath } from 'url';
import pkg from 'whatsapp-web.js';
import { getOrCreatePrivateClient } from '../src/services/instagramPrivateApi.service.js';
const { Client: WhatsAppClient, LocalAuth } = pkg;

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
process.env.IG_PROXY_URL = '';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// Eliminado IG_USERNAME y IG_PASSWORD hardcodeados

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OMNI_DB_FILE = path.join(__dirname, 'omni_memory.json');

// =====================================
// 1. MEMORIA OMNICANAL
// =====================================
function loadDB() {
    if (fs.existsSync(OMNI_DB_FILE)) { return JSON.parse(fs.readFileSync(OMNI_DB_FILE, 'utf-8')); }
    return { users: {}, processed_messages: {} }; 
    /*
       users: {
         "ig_username": { 
            whatsapp: "346xxxxxx",
            history: [ { role: 'user/agent', content: '', platform: 'ig/wa' } ]
         }
       }
    */
}

function saveDB(db) {
    fs.writeFileSync(OMNI_DB_FILE, JSON.stringify(db, null, 2));
}

// Para limpiar/formatear el número sacado por la IA y que WhatsApp lo entienda
function formatWhatsAppNumber(phoneStr) {
    let clean = phoneStr.replace(/\D/g, ''); // Quita + espacios guiones
    if(!clean.startsWith('34') && clean.length === 9) {
        clean = '34' + clean; // Asume España si tiene 9 dígitos y no tiene prefijo (Modifica esto según tu país ppal)
    }
    return clean + '@c.us';
}

const db = loadDB();

// =====================================
// 2. IA CONTEXTUAL
// =====================================
async function getSmartResponse(username, newMessage, platform) {
    // Inicializar usuario si no existe
    if (!db.users[username]) {
        db.users[username] = { whatsapp: null, history: [] };
    }
    
    // Guardar su mensaje nuevo
    db.users[username].history.push({ role: 'user', content: newMessage, platform });
    saveDB(db);

    // Reconstruir historial para ChatGPT (últimos 10 mensajes)
    const recentHistory = db.users[username].history.slice(-10);
    const contextMessages = recentHistory.map(msg => ({
        role: msg.role === 'agent' ? 'assistant' : 'user',
        content: `[Vía ${msg.platform.toUpperCase()}] ${msg.content}`
    }));

    const prompt = `
Eres un Agente Omni-canal de Ventas B2B para la agencia SpeedLeads.
Estás hablando con un cliente. Tienes todo el contexto histórico arriba.

REGLAS VITALES:
1. Respuestas súper cortas, amigables, directas al grano. Sin saludos robóticos.
2. El objetivo es hablar de automatización en IA (Instagram / WhatsApp).
3. DEBES DEVOLVER UN JSON con 3 campos exactamente:
   {
      "reply_current_platform": "Tu respuesta empática para la plataforma donde te acaba de hablar.",
      "extracted_whatsapp": "El número de teléfono completo SIN espacios ni signos SI es que el cliente te lo acaba de pasar en su último mensaje (o null si no lo pasó).",
      "wa_first_message": "Si extrajiste un whatsapp, este es el primer mensaje inicial sorpresa que le enviarás directo por WhatsApp ahora mismo. Si no, déjalo en null."
   }
No incluyas markdown, solo texto raw JSON.
`;

    try {
        console.log(`   🧠 La IA está analizando todo el historial para responder en ${platform.toUpperCase()}...`);
        const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: prompt },
                ...contextMessages
            ],
            temperature: 0.7,
        });

        const resultRaw = aiResponse.choices[0].message.content;
        const result = JSON.parse(resultRaw);

        // Guardamos nuestra respuesta en el historial
        db.users[username].history.push({ role: 'agent', content: result.reply_current_platform, platform });
        
        if (result.extracted_whatsapp && result.wa_first_message) {
            db.users[username].whatsapp = result.extracted_whatsapp;
            db.users[username].history.push({ role: 'agent', content: result.wa_first_message, platform: 'wa' });
        }
        
        saveDB(db);
        return result;
    } catch (e) {
        console.error("❌ Error en la IA:", e.message);
        return { reply_current_platform: "Lo siento, tuve un pequeño fallo mental. ¿Me repites?", extracted_whatsapp: null, wa_first_message: null };
    }
}

// =====================================
// 3. WHATSAPP BOT (Cliente)
// =====================================
const waClient = new WhatsAppClient({
    authStrategy: new LocalAuth({ clientId: 'omni-bot-agent' }),
    puppeteer: { 
        headless: true,
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    }
});

waClient.on('qr', (qr) => {
    console.log('\n📱 ESCANEA ESTE QR CON TU WHATSAPP PARA CONECTAR EL MÓDULO OMNI-CANAL:');
    qrcode.generate(qr, { small: true });
});

waClient.on('ready', () => {
    console.log('✅ WhatsApp Omni-Bot conectado y listo para saltos cross-platform!');
});

// Escuchar si el cliente responde por WhatsApp (El bucle se cierra)
waClient.on('message', async (msg) => {
    // Buscar a quién pertenece este WhatsApp (ignoramos chats que no sean de leads nuestras)
    const senderNumber = msg.from.replace('@c.us', '');
    let foundIgUser = null;
    
    for (const [igUser, data] of Object.entries(db.users)) {
        if (data.whatsapp && data.whatsapp.includes(senderNumber)) {
            foundIgUser = igUser; break;
        }
    }

    if (foundIgUser) {
        console.log(`\n---------------------------------------------------------`);
        console.log(`🟢 [WHATSAPP] RESPUESTA RECIBIDA de @${foundIgUser} (+${senderNumber}): "${msg.body}"`);
        
        const aiResponse = await getSmartResponse(foundIgUser, msg.body, 'wa');
        
        // Simular typing
        const chat = await msg.getChat();
        await chat.sendStateTyping();
        await new Promise(r => setTimeout(r, 4000));
        
        await waClient.sendMessage(msg.from, aiResponse.reply_current_platform);
        console.log(`   🚀 Enviado por WHATSAPP: "${aiResponse.reply_current_platform}"`);
    } else {
         // Mensaje de alguien que no viene de insta, se ignora en este demo
    }
});


// =====================================
// 4. INSTAGRAM BOT (Polling)
// =====================================
async function runIGPolling() {
    const userId = process.argv[2];
    if (!userId) {
        console.error("❌ userId es requerido como argumento.");
        process.exit(1);
    }
    console.log(`\n🤖 INICIANDO MÓDULO INSTAGRAM para userId: ${userId} ...`);
    
    const privateClient = getOrCreatePrivateClient(userId);
    
    if (!privateClient.logged) {
        const restored = await privateClient.restoreSession();
        if (!restored) {
             console.error("❌ Sesión de Instagram no válida o expirada para este usuario. Inicia sesión primero.");
             return;
        }
    }
    
    const ig = privateClient.ig;
    const currentUser = await ig.account.currentUser();
    const myId = currentUser.pk;
    const activeUsername = currentUser.username;
    console.log(`✅ Instagram conectado a @${activeUsername}.`);

    setInterval(async () => {
        try {
            const inboxFeed = ig.feed.directInbox();
            const threads = await inboxFeed.items();

            for (const thread of threads) {
                const lastItem = thread.last_permanent_item;
                if (!lastItem || !lastItem.text) continue;
                if (lastItem.user_id.toString() === myId.toString()) continue; // Lo envié yo
                if (db.processed_messages[lastItem.item_id]) continue; // Ya lo procesamos
                
                const username = thread.users && thread.users[0] ? thread.users[0].username : "Desconocido";
                
                console.log(`\n---------------------------------------------------------`);
                console.log(`🟣 [INSTAGRAM] NUEVO MENSAJE de @${username}`);
                console.log(`   💬 Dice: "${lastItem.text}"`);

                // Visto
                const directThread = ig.entity.directThread(thread.thread_id);
                await directThread.markItemSeen(lastItem.item_id);

                // Llamar a IA para responder Y verificar si hay número
                const aiResult = await getSmartResponse(username, lastItem.text, 'ig');
                
                // Responder en IG
                const typingTime = 5000;
                console.log(`   ⌨️ Escribiendo en IG...`);
                await new Promise(r => setTimeout(r, typingTime)); 
                await directThread.broadcastText(aiResult.reply_current_platform);
                console.log(`   🚀 Enviado por INSTAGRAM: "${aiResult.reply_current_platform}"`);

                // ¡SALTO OMNI-CANAL! ¿El cliente nos dió un WhatsApp?
                if (aiResult.extracted_whatsapp && aiResult.wa_first_message) {
                    console.log(`\n   🔥 ¡ALERTA OMNI-CANAL! El cliente entregó su número: ${aiResult.extracted_whatsapp}`);
                    console.log(`   📲 SALTANDO A WHATSAPP AUTOMÁTICAMENTE...`);
                    
                    const waTarget = formatWhatsAppNumber(aiResult.extracted_whatsapp);
                    
                    try {
                        // Enviamos el mensaje instantáneamente por Whatsapp
                        await new Promise(r => setTimeout(r, 2000)); 
                        await waClient.sendMessage(waTarget, aiResult.wa_first_message);
                        console.log(`   🟢 [WHATSAPP] ¡BOMBA! Mensaje enviado al instante: "${aiResult.wa_first_message}"`);
                    } catch (waErr) {
                        console.log(`   ⚠️ Error saltando a WhatsApp (¿Número incorrecto?): ${waErr.message}`);
                    }
                }

                // Guardar mensaje procesado
                db.processed_messages[lastItem.item_id] = true;
                saveDB(db);
            }
        } catch (e) {
            if (!e.message.includes('403')) {}
        }
    }, 15000); 
}

// =====================================
// 5. INICIAR SISTEMA OMNI-CANAL
// =====================================
async function main() {
    console.log(`\n======================================================`);
    console.log(`👑 SISTEMA OMNI-CANAL CONTEXTUAL [IG <---> WA] INICIADO`);
    console.log(`======================================================`);
    
    // Inicia WA primero (pide QR si no hay sesión guardada)
    waClient.initialize();
    
    // Luego inicia Polling IG
    await runIGPolling();
}

main();
