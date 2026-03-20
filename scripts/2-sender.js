import dotenv from 'dotenv';
import fs from 'fs';
import { IgApiClient } from 'instagram-private-api';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
process.env.IG_PROXY_URL = '';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const IG_USERNAME = 'nfnn404';
const IG_PASSWORD = 'Dios2090.';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEADS_FILE = path.join(__dirname, 'campaign_leads.json');

function loadLeads() {
    if (fs.existsSync(LEADS_FILE)) { return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8')); }
    return {};
}

function saveLeads(leadsObj) {
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leadsObj, null, 2), 'utf-8');
}

// 🕒 Simula que eres humano escribiendo (Mínimo: X milisegundos, Máximo: Y milisegundos)
function randomDelay(min, max) {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function processLeadsBatch(batchSize = 10) {
    console.log(`\n🚀 PASO 2: Goteo Seguro de DMs (${batchSize} al día)`);
    
    // 1. Cargar Base de Datos
    const leadsObj = loadLeads();
    const leadsArray = Object.values(leadsObj);
    const pedingLeads = leadsArray.filter(l => l.status === 'pending');

    console.log(`📊 Leads en base de datos: ${leadsArray.length}`);
    console.log(`⌛ Leads pendientes de DM: ${pedingLeads.length}\n`);

    if (pedingLeads.length === 0) {
        console.log("✅ No hay leads nuevos que contactar. Fin del goteo.");
        return;
    }

    // 2. Tomar "X" Leads (ej. los primeros 10 que encuentre pendientes)
    const batchToProcess = pedingLeads.slice(0, batchSize);
    console.log(`🔄 Empezando campaña con ${batchToProcess.length} leads para hoy...`);

    // 3. Conectar a IG
    const ig = new IgApiClient();
    ig.state.generateDevice(IG_USERNAME);
    await ig.simulate.preLoginFlow();
    await ig.account.login(IG_USERNAME, IG_PASSWORD);
    
    // 4. Bucle Seguro (IA -> IG -> Base Datos)
    for (let i = 0; i < batchToProcess.length; i++) {
        const lead = batchToProcess[i];
        console.log(`\n---------------------------------------------------------`);
        console.log(`👤 Prospecto #${i+1}: @${lead.username}`);
        
        let recentPosts = 'Sin posts recientes';
        if (lead.posts && lead.posts.length > 0) {
            recentPosts = lead.posts.slice(0, 3).map((p, j) => `Post #${j+1}: "${p.caption?.substring(0, 100)}..."`).join('\n\n');
        }
        
        const prompt = `
          Eres un experto en relaciones comerciales (Inbound DM) de SpeedLeads (Agencia Automatización IA).
          Tu objetivo es leer este prospecto y escribir 1 solo MENSAJE DIRECTO casual para vender tu sistema de agentes de IA para negocio/marcas personales.
          
          Reglas:
          1. Llama al usuario por su primer nombre sacado de su perfil.
          2. El primer párrafo DEBE ser un comentario genuino sobre algo específico de sus últimos posts o de su biografía.
          3. El segundo párrafo vende casualmente: "¿Tienes automatizado tu Instagram para no perder clientes 24/7? Te ayudaría muchísimo con tu cuenta". (O usa tus propias palabras).
          4. Termina con una pregunta muy corta para buscar respuesta y no envidada.
          5. MUY CORTO Y CASUAL (máximo 50 palabras en TOTAL).
          6. Devuelve SOLAMENTE el texto listo para enviar. Sin comillas extra.
        `;

        const userInfo = `
          Username: @${lead.username}
          Name: ${lead.name || 'Amigo'}
          Bio: ${lead.bio || ''}
          Posts: ${recentPosts}
        `;
        
        // Generar DM con IA
        let dmContent = "";
        try {
            const aiResponse = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [ { role: "system", content: prompt }, { role: "user", content: userInfo } ],
              temperature: 0.8,
            });
            dmContent = aiResponse.choices[0].message.content.trim().replace(/^["'\\]+|["'\\]+$/g, '');
            console.log(`   🧠 Generado: "${dmContent.replace(/\\n/g, ' ')}"`);
        } catch (e) {
            console.error(`   ❌ Error IA: ${e.message}`);
            continue;
        }

        // Enviar a IG
        try {
            console.log(`   📨 Enviando DM...`);
            const userId = await ig.user.getIdByUsername(lead.username);
            const thread = ig.entity.directThread([userId.toString()]);
            await thread.broadcastText(dmContent);
            console.log(`   ✅ ¡Éxito! Dm entregado.`);
            
            // Marcar en la BD como contactado
            leadsObj[lead.username].status = 'contacted';
            leadsObj[lead.username].dm_sent = dmContent;
            leadsObj[lead.username].date_contacted = new Date().toISOString();
            
            saveLeads(leadsObj);
            console.log(`   💾 Marcado como [CONTACTED] en Base de Datos.`);
            
        } catch (err) {
            // El usuario estaba bloqueado, o cuenta privada súper estricta, o "403 Forbidden" (límite diario).
            console.error(`   ❌ Falló el envío a @${lead.username}:`, err.message);
            // Si nos topamos con un 403, podríamos frenar todo el script para que no se arriesgue la cuenta:
            if (err.message.includes('403 Forbidden')) {
                console.log("   ‼️ ALERTA: Instagram limitó nuestra cuenta por el día de hoy (Exceso de nuevos chats). Abortando campaña de hoy.");
                break; 
            }
        }
        
        // Retraso CRUCIAL ENTRE ENVIOS COMPLETOS (Ej. 2 a 5 MINUTOS)
        // Para esta demo lo dejo entre 30 y 60 segundos, pero en la realidad deberás hacerlo muy lento (120 - 300 segs).
        if (i < batchToProcess.length - 1) {
             const waitSeconds = Math.floor(Math.random() * (60 - 30 + 1)) + 30; // 30 a 60 segs
             console.log(`   ⏳ PAUSA DE PREVENCIÓN DE BANEO: Esperando ${waitSeconds} segundos antes del siguiente prospecto...`);
             await randomDelay(waitSeconds * 1000, waitSeconds * 1000);
        }
    }
    
    console.log(`\n═════════════════════════════════════════════════════════`);
    console.log(`   🏁 Lote del Día FINALIZADO.`);
    console.log(`═════════════════════════════════════════════════════════\n`);
}

// Ejecutar goteo de 10 leads de tu base de datos (se puede poner en un CRON que corra cada 10 horas)
processLeadsBatch(2); // Ponemos 2 para la demo
