import dotenv from 'dotenv';
import fs from 'fs';
import { IgApiClient } from 'instagram-private-api';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
process.env.IG_PROXY_URL = ''; 

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const IG_USERNAME = 'nfnn404'; // La cuenta que "Atiende"
const IG_PASSWORD = 'Dios2090.';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, 'responder_cache.json');

// Memoria de mensajes ya respondidos
let respondedCache = {};
if (fs.existsSync(CACHE_FILE)) {
    respondedCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
}

function saveCache() {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(respondedCache, null, 2));
}

async function runAutoResponder() {
    console.log(`\n🎧 INICIANDO AUTO-RESPONDEDOR INBOUND CON IA...`);
    const ig = new IgApiClient();
    ig.state.generateDevice(IG_USERNAME);
    
    // Login
    console.log(`🔐 Conectando cuenta @${IG_USERNAME}...`);
    await ig.simulate.preLoginFlow();
    await ig.account.login(IG_USERNAME, IG_PASSWORD);
    
    const myId = await ig.user.getIdByUsername(IG_USERNAME);
    console.log(`✅ ¡Conectado! La IA ahora está escuchando tu Bandeja de Entrada de Instagram (Directs) 24/7...`);
    console.log(`⏳ Buscando mensajes nuevos cada 15 segundos...\n`);

    // Poll Inbox Infinito
    setInterval(async () => {
        try {
            const inboxFeed = ig.feed.directInbox();
            const threads = await inboxFeed.items();

            for (const thread of threads) {
                const lastItem = thread.last_permanent_item;
                
                // 1. Validar que exista el mensaje
                // 2. Que NO haya sido enviado por mí
                // 3. Que NO esté en mi registro de "mensajes ya respondidos"
                if (lastItem && lastItem.user_id.toString() !== myId.toString() && !respondedCache[lastItem.item_id]) {
                    
                    const username = thread.users && thread.users[0] ? thread.users[0].username : "Desconocido";
                    
                    console.log(`\n---------------------------------------------------------`);
                    console.log(`📩 NUEVO MENSAJE RECIBIDO de @${username}`);
                    
                    // Solo respondemos a texto por ahora (ignoramos fotos/audios)
                    if (!lastItem.text) {
                        console.log(`   ⚠️ [Mensaje Multimedial] Marcado como ignorado por la IA.`);
                        respondedCache[lastItem.item_id] = true;
                        saveCache();
                        continue;
                    }
                    
                    console.log(`   💬 Dice: "${lastItem.text}"`);

                    // Marcar como "Visto" en Instagram
                    const directThread = ig.entity.directThread(thread.thread_id);
                    await directThread.markItemSeen(lastItem.item_id);
                    console.log(`   👀 Marcado como 'Visto' (Leído).`);
                    
                    await new Promise(r => setTimeout(r, 2000)); // Simula tiempo humano leyendo el chat

                    // Prompt Experto de IA para Inbound
                    const prompt = `
Eres la Inteligencia Artificial de atención al cliente de SpeedLeads Agencia, instalada en la cuenta de Instagram "nfnn404".
Un posible cliente acaba de responder un mensaje antiguo de prospección con esto: "${lastItem.text}"

Instrucciones:
1. Respóndele de manera empática, extremadamente casual, amistosa y muy humana (Máximo 2 o 3 oraciones cortas).
2. Tómate libertades conversacionales en base a su mensaje. Si pregunta precios, dile que de momento regalamos una consultoría gratuita.
3. El objetivo es que la persona confirme su interés y tú la invites a hacer una videollamada de 10 minutos (Zoom/Meet) para hablar de cómo automatizarle su IG, o pídele su WhatsApp para pasarle info.
Devuelve ÚNICAMENTE el texto que le quieres enviar por chat (sin comillas).
                    `;
                    
                    console.log(`   🧠 La IA está redactando la respuesta...`);
                    const aiResponse = await openai.chat.completions.create({
                        model: "gpt-4o",
                        messages: [{ role: "user", content: prompt }],
                        temperature: 0.7,
                    });
                    
                    const replyContent = aiResponse.choices[0].message.content.trim().replace(/^["'\\]+|["'\\]+$/g, '');
                    console.log(`   🤖 Respuesta generada: "${replyContent}"`);
                    
                    // Tiempo humano "escribiendo" (proporcional a la longitud del texto real)
                    const typingTime = Math.min(Math.max(replyContent.length * 60, 2000), 8000);
                    console.log(`   ⌨️ Simulando escritura humana en Instagram (${(typingTime/1000).toFixed(1)} segundos)...`);
                    await new Promise(r => setTimeout(r, typingTime)); 
                    
                    // Enviar Respuesta a la bandeja del cliente
                    await directThread.broadcastText(replyContent);
                    console.log(`   🚀 ¡BOMBA! Respuesta enviada directo a @${username}.`);

                    // Guardar ID del mensaje en el cerebro para NO hacer un "loop infinito" respondiendo lo mismo
                    respondedCache[lastItem.item_id] = true;
                    saveCache();
                }
            }
        } catch (e) {
            // Silenciamos el error 403 o errores de red ocasionales para no llenar la consola si Instagram rate-limita el polling
            if (!e.message.includes('403')) {
                // console.error(`⚠️ Polling error: ${e.message}`);
            }
        }
    }, 12000); // Polling cada 12 segundos (muy conservador para no triggearear defensas)
}

runAutoResponder();
