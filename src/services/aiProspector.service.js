import OpenAI from 'openai';
import { scrapeProfiles } from './brightDataScraper.service.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Re-exporta scrapeProfiles desde brightDataScraper (compatibilidad).
 * @param {string[]} urls - Ejemplo: ['https://www.instagram.com/cristiano/']
 */
export { scrapeProfiles } from './brightDataScraper.service.js';

/**
 * 2. Analizar perfil con Inteligencia Artificial (OpenAI)
 * @param {Object} profile - JSON devuelto por Bright Data
 * @returns {Promise<Object>} - Decisión de la IA + Razón
 */
export async function analyzeProfileAI(profile) {
  const systemPrompt = `
    Eres un asistente de ventas muy amigable y persuasivo.
    Tu objetivo es leer el perfil de Instagram de un usuario y preparar todo para enviarle un mensaje.
    
    REGLA PRINCIPAL:
    - TODOS los perfiles son considerados "BUEN PROSPECTO" (isTarget: true) sin importar si son negocios, cuentas personales, privadas o sin biografía. NO RECHACES A NADIE.
    
    Tu tarea es:
    1. Aceptar el perfil marcando "isTarget": true.
    2. Analizar la biografía o el nombre para crear un saludo MUY CORTO (1 línea) personalizado que usaremos de gancho. Si la cuenta es privada o no tiene bio, genera un saludo general amigable.
    
    Responde ÚNICAMENTE en JSON válido con el siguiente formato:
    {
      "isTarget": true,
      "reason": "Siempre aceptado por solicitud del cliente",
      "niche": "Ej: Fitness, Personal, Creador, Ninguno",
      "customGreeting": "Holii! Qué bonita vibra la de tu perfil ✨ / Hola [Nombre]! me encantó lo que compartes / Hola! Qué tal va tu día?"
    }
  `;

  // Preparamos los datos clave del perfil para dárselos a la IA
  const profileInfo = `
    Username: ${profile.username || 'N/A'}
    Full Name: ${profile.full_name || 'N/A'}
    Bio: ${profile.biography || 'N/A'}
    Followers: ${profile.followers || 0}
    Following: ${profile.following || 0}
    Is Private: ${profile.is_private ? 'Yes' : 'No'}
    Is Business Account: ${profile.is_business_account ? 'Yes' : 'No'}
    Business Category: ${profile.business_category_name || 'N/A'}
    External URL: ${profile.external_url || 'N/A'}
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // rápido y barato para esto
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: profileInfo }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2, // Respuestas consistentes
    });

    const result = JSON.parse(response.choices[0].message.content);
    return {
      success: true,
      analysis: result
    };
  } catch (error) {
    return {
      success: false,
      error: `Error IA: ${error.message}`
    };
  }
}

/**
 * Genera comentario público + DM para un perfil con posts (like + comentar + DM)
 */
export async function generateCommentAndDMForProfile(profile) {
  const lastMedia = profile?.posts?.[0] || profile?.reels?.[0] || null;
  const lastPostCaption = lastMedia?.caption || 'Sin caption';

  const prompt = `
Eres un experto en relaciones B2B (Agencia SpeedLeads). Genera un JSON con DOS campos:

1. "comentario_publico": Comentario genuino para su última publicación. Breve (max 20 palabras), con emojis, sin ventas. Basado en el caption del post. Si no hay post, devuelve "".
2. "customGreeting": DM personalizado. Referencia su bio o el post si comentaste. Termina con "¿Encajamos?". Max 60 palabras.

Devuelve ÚNICAMENTE JSON válido.
`;

  const userInfo = `
Username: ${profile.username || profile.account}
Name: ${profile.full_name || 'N/A'}
Bio: ${profile.biography || 'N/A'}
Último post caption: "${lastPostCaption}"
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userInfo },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });
    const result = JSON.parse(response.choices[0].message.content);
    return {
      success: true,
      comment: result.comentario_publico || '',
      dm: result.customGreeting || 'Hola! Me encantó tu perfil ✨',
    };
  } catch (error) {
    return {
      success: false,
      comment: '',
      dm: 'Hola! Me encantó tu perfil ✨',
      error: error.message,
    };
  }
}

/**
 * 3. FLUJO COMPLETO: Scrape + AI Filter
 * @param {string[]} urls - URLs a analizar
 */
export async function processLeadsPipeline(urls) {
  console.log(`[Agente IA] Iniciando Pipeline para ${urls.length} URLs...`);
  
  // 1. Extraer con Bright Data
  console.log('[Agente IA] ⏳ Solicitando datos a Bright Data ($1.50/1k)...');
  const raw = await scrapeProfiles(urls);
  const scrapedData = Array.isArray(raw) ? raw : (typeof raw === 'string'
    ? raw.trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    : [raw]);
  
  const results = {
    totalScraped: scrapedData.length,
    qualifiedLeads: [],
    rejectedLeads: [],
    errors: []
  };

  // 2. Analizar cada uno con IA
  console.log('[Agente IA] 🧠 Analizando perfiles con ChatGPT...');
  
  for (const profile of scrapedData) {
    // Si hubo error al hacer el scrape de ese perfil (ej. no existe)
    if (profile.error) {
      results.errors.push({ url: profile.url, error: profile.error });
      continue;
    }

    const aiResult = await analyzeProfileAI(profile);
    
    if (aiResult.success) {
      const prospect = {
        username: profile.username,
        name: profile.full_name,
        followers: profile.followers,
        bio: profile.biography,
        category: aiResult.analysis.niche,
        reason: aiResult.analysis.reason,
        customGreeting: aiResult.analysis.customGreeting
      };

      if (aiResult.analysis.isTarget) {
        results.qualifiedLeads.push(prospect);
        console.log(` ✅ ACEPTADO: @${profile.username} | Saludo IA: "${prospect.customGreeting}"`);
      } else {
        results.rejectedLeads.push(prospect);
        console.log(` ❌ RECHAZADO: @${profile.username} - ${prospect.reason}`);
      }
    } else {
      results.errors.push({ username: profile.username, error: aiResult.error });
    }
  }

  console.log(`[Agente IA] Pipeline completado. ${results.qualifiedLeads.length} leads calificados de ${urls.length}.`);
  return results;
}
