import fetch from 'node-fetch';
import { load } from 'cheerio';
import { supabaseAdmin } from '../config/db.js';

/**
 * Scrapea el contenido de un sitio web y extrae el texto relevante
 * @param {string} url - URL del sitio web a scrapear
 * @returns {Promise<string>} - Texto extraído del sitio web
 */
export async function scrapeWebsite(url) {
  try {
    // Validar y normalizar URL
    if (!url || typeof url !== 'string') {
      throw new Error('URL inválida');
    }

    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    console.log(`🌐 Iniciando scraping de: ${normalizedUrl}`);

    // Hacer fetch del sitio web con timeout
    const response = await fetch(normalizedUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
      timeout: 30000, // 30 segundos timeout
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    
    if (!html || html.length === 0) {
      throw new Error('No se pudo obtener contenido del sitio web');
    }

    // Parsear HTML con cheerio
    const $ = load(html);

    // Remover elementos no deseados
    $('script, style, noscript, iframe, nav, footer, header, aside, .advertisement, .ads, [class*="ad-"], [id*="ad-"]').remove();

    // Extraer texto de elementos importantes
    const textParts = [];

    // Título de la página
    const title = $('title').text().trim();
    if (title) {
      textParts.push(`Título: ${title}`);
    }

    // Meta descripción
    const metaDescription = $('meta[name="description"]').attr('content');
    if (metaDescription) {
      textParts.push(`Descripción: ${metaDescription}`);
    }

    // Contenido principal (priorizar main, article, section)
    const mainContent = $('main, article, [role="main"], .content, .main-content, #content, #main').first();
    if (mainContent.length > 0) {
      const mainText = mainContent.text().trim();
      if (mainText) {
        textParts.push(`Contenido principal:\n${mainText}`);
      }
    }

    // Si no hay contenido principal, extraer de body
    if (textParts.length <= 2) {
      const bodyText = $('body').text().trim();
      if (bodyText && bodyText.length > 100) {
        // Limpiar texto: remover espacios múltiples y saltos de línea excesivos
        const cleanedText = bodyText
          .replace(/\s+/g, ' ')
          .replace(/\n\s*\n\s*\n/g, '\n\n')
          .trim();
        
        if (cleanedText.length > 100) {
          textParts.push(`Contenido del sitio:\n${cleanedText}`);
        }
      }
    }

    // Extraer enlaces importantes con contexto y URLs
    const importantLinks = [];
    const baseUrl = new URL(normalizedUrl);
    
    $('a[href]').each((i, elem) => {
      const $link = $(elem);
      const linkText = $link.text().trim();
      const href = $link.attr('href');
      
      if (!href || !linkText || linkText.length < 3 || linkText.length > 100) {
        return;
      }
      
      // Resolver URL relativa a absoluta
      let absoluteUrl;
      try {
        absoluteUrl = new URL(href, baseUrl).href;
      } catch {
        return; // URL inválida, saltar
      }
      
      // Obtener contexto alrededor del enlace (texto del párrafo o sección)
      let context = '';
      const $parent = $link.closest('p, li, div, section, article, h1, h2, h3, h4, h5, h6');
      if ($parent.length > 0) {
        context = $parent.text().trim().substring(0, 200);
      }
      
      // Filtrar enlaces no relevantes (javascript:, mailto:, #, etc.)
      if (absoluteUrl.startsWith('javascript:') || 
          absoluteUrl.startsWith('mailto:') || 
          absoluteUrl.startsWith('#') ||
          absoluteUrl.includes('facebook.com') ||
          absoluteUrl.includes('twitter.com') ||
          absoluteUrl.includes('instagram.com') ||
          absoluteUrl.includes('linkedin.com')) {
        return;
      }
      
      importantLinks.push({
        text: linkText,
        url: absoluteUrl,
        context: context || linkText
      });
    });

    // Limitar a 30 enlaces más relevantes
    const uniqueLinks = [];
    const seenUrls = new Set();
    for (const link of importantLinks.slice(0, 50)) {
      if (!seenUrls.has(link.url) && uniqueLinks.length < 30) {
        seenUrls.add(link.url);
        uniqueLinks.push(link);
      }
    }
    
    if (uniqueLinks.length > 0) {
      // Formatear enlaces con contexto para la IA de manera más estructurada
      const linksFormatted = uniqueLinks.map((link, index) => {
        const cleanContext = link.context.replace(/\s+/g, ' ').substring(0, 120).trim();
        return `${index + 1}. Tema: "${link.text}"\n   URL: ${link.url}\n   Contexto: ${cleanContext}${cleanContext.length >= 120 ? '...' : ''}`;
      }).join('\n\n');
      
      textParts.push(`\n\n🔗 ENLACES DISPONIBLES EN EL SITIO WEB:\n\n${linksFormatted}\n\n📋 INSTRUCCIONES PARA USAR ENLACES:\n- Cuando el usuario pregunte sobre algo relacionado con estos temas, SIEMPRE incluye el enlace correspondiente en tu respuesta\n- Puedes incluir múltiples enlaces si son relevantes\n- Formatea los enlaces así: [Texto descriptivo](URL) o simplemente la URL completa\n- Si el usuario pregunta "dónde puedo ver X" o "más información sobre Y", incluye el enlace relevante\n- Los enlaces están organizados por tema - usa el que mejor corresponda a la pregunta del usuario`);
    }

    // Combinar todo el texto
    let finalText = textParts.join('\n\n');

    // Limpiar y limitar tamaño
    finalText = finalText
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();

    // Limitar a 10000 caracteres para evitar instrucciones demasiado largas
    if (finalText.length > 10000) {
      finalText = finalText.substring(0, 10000) + '... [Contenido truncado]';
    }

    if (finalText.length < 50) {
      throw new Error('No se pudo extraer suficiente contenido del sitio web');
    }

    console.log(`✅ Scraping completado: ${finalText.length} caracteres extraídos`);
    return finalText;

  } catch (error) {
    console.error(`❌ Error scrapeando sitio web ${url}:`, error.message);
    throw new Error(`Error al scrapear sitio web: ${error.message}`);
  }
}

/**
 * Guarda el contenido scrapeado como instrucción en personality_instructions
 * @param {string} userId - ID del usuario
 * @param {number} personalityId - ID de la personalidad
 * @param {string} websiteUrl - URL del sitio web
 * @param {string} scrapedContent - Contenido scrapeado
 * @returns {Promise<object>} - Instrucción guardada
 */
export async function saveWebsiteAsInstruction(userId, personalityId, websiteUrl, scrapedContent) {
  try {
    // Crear texto de instrucción con el contenido scrapeado
    const instruction = `Información del sitio web ${websiteUrl}:\n\n${scrapedContent}\n\nUsa esta información para responder preguntas sobre la empresa, productos, servicios y cualquier tema relacionado con este sitio web.`;

    // Verificar si ya existe una instrucción para este sitio web
    const { data: existingInstructions, error: checkError } = await supabaseAdmin
      .from('personality_instructions')
      .select('id')
      .eq('personality_id', personalityId)
      .eq('users_id', userId)
      .ilike('instruccion', `%${websiteUrl}%`)
      .limit(1);

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error verificando instrucciones existentes:', checkError);
    }

    // Si ya existe, actualizarla; si no, crear nueva
    if (existingInstructions && existingInstructions.length > 0) {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('personality_instructions')
        .update({
          instruccion: instruction,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingInstructions[0].id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      console.log(`✅ Instrucción de sitio web actualizada para personalidad ${personalityId}`);
      return updated;
    } else {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('personality_instructions')
        .insert({
          users_id: userId,
          personality_id: personalityId,
          instruccion: instruction,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      console.log(`✅ Instrucción de sitio web guardada para personalidad ${personalityId}`);
      return inserted;
    }
  } catch (error) {
    console.error('Error guardando sitio web como instrucción:', error);
    throw error;
  }
}

/**
 * Scrapea un sitio web y lo guarda automáticamente como instrucción
 * @param {string} userId - ID del usuario
 * @param {number} personalityId - ID de la personalidad
 * @param {string} websiteUrl - URL del sitio web
 * @returns {Promise<object>} - Instrucción guardada
 */
export async function scrapeAndSaveWebsite(userId, personalityId, websiteUrl) {
  try {
    console.log(`🔄 Iniciando proceso de scraping y guardado para sitio web: ${websiteUrl}`);
    
    // Scrapear el sitio web
    const scrapedContent = await scrapeWebsite(websiteUrl);
    
    // Guardar como instrucción
    const instruction = await saveWebsiteAsInstruction(userId, personalityId, websiteUrl, scrapedContent);
    
    return instruction;
  } catch (error) {
    console.error(`❌ Error en scrapeAndSaveWebsite:`, error);
    throw error;
  }
}

