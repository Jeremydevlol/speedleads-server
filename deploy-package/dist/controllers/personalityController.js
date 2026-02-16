import fetch from 'node-fetch'
import { io } from '../app.js'
import pool, { supabaseAdmin } from '../config/db.js'
import { createConversation, getConversationHistory, saveMessage } from '../services/conversationService.js'
import { generateBotResponse, reprocessExistingInstructions, transcribeAudioBuffer } from '../services/openaiService.js'
import { getSaludoFromDB } from '../services/personalityService.js'
import { processMediaArray } from '../utils/fileUtils.js'
import { extractImageText } from '../utils/mediaUtils.js'
import { getUserIdFromToken } from './authController.js'
// Imports para soporte de URLs de video
import { processVideoUrls } from '../utils/personalityVideoUrlHandler.js'
import { checkYtDlpAvailability, detectVideoUrl } from '../utils/videoUrlProcessor.js'
// Import para scraping de sitios web
import { scrapeAndSaveWebsite } from '../utils/websiteScraper.js'

// -----------------------------------------------------------------------------
// Función auxiliar para formatear datos de personalidad
// -----------------------------------------------------------------------------
function formatPersonalityData(personalidad, lang = 'es') {
  // Valores por defecto para cada categoría de personalidad
  const defaults = {
    amigable: {
      nombre: { es: 'Amigo', en: 'Friend' },
      empresa: '',
      sitioWeb: '',
      posicion: '',
      context: {
        es: 'Eres un amigo cercano dispuesto a echar una mano y bromear un poco.',
        en: 'You are a close friend ready to help and joke around.'
      },
      instrucciones: {
        es: 'Habla como un amigo de confianza: usa lenguaje coloquial, emojis y preguntas informales.',
        en: 'Speak like a trusted friend: use colloquial language, emojis, and informal questions.'
      },
      saludo: { es: '', en: '' }
    },
    familia: {
      nombre: { es: 'Tu familiar', en: 'Your family member' },
      empresa: '',
      sitioWeb: '',
      posicion: '',
      context: {
        es: 'Eres un familiar cariñoso que siempre recuerda anécdotas y apodos.',
        en: 'You are a loving family member who always remembers anecdotes and nicknames.'
      },
      instrucciones: {
        es: 'Responde con un tono familiar: usa apodos cariñosos, anécdotas y cercanía.',
        en: 'Reply with a familial tone: use affectionate nicknames, anecdotes, and warmth.'
      },
      saludo: { es: '', en: '' }
    },
    formal: {
      nombre: { es: 'Tu asistente', en: 'Your assistant' },
      empresa: '',
      sitioWeb: '',
      posicion: '',
      context: {
        es: 'Eres un asistente profesional, preciso y respetuoso.',
        en: 'You are a professional, precise, and respectful assistant.'
      },
      instrucciones: {
        es: 'Responde con el máximo profesionalismo: lenguaje formal, oraciones completas y sin coloquialismos.',
        en: 'Reply with utmost professionalism: formal language, complete sentences, and no slang.'
      },
      saludo: { es: '', en: '' }
    },
    negocios: {  // Se añaden los valores predeterminados para la categoría 'negocios'
      nombre: { es: 'Trabajador de tu empresa', en: 'Your bussiness Worker' },
      empresa: 'Tu empresa',
      sitioWeb: 'https://tuempresa.com',
      posicion: 'Trabajador',
      context: {
        es: 'Eres un trabajador profesional de la empresa tu empresa.',
        en: 'You are a professional worker at your bussiness.'
      },
      instrucciones: {
        es: 'Responde con un tono profesional y empresarial. Usa un lenguaje claro y preciso.',
        en: 'Reply with a professional and business-like tone. Use clear and precise language.'
      },
      saludo: { es: '', en: '' }
    },
  };

  // Aceptar tanto sitioWeb (camelCase) como sitio_web (snake_case)
  let sitio_web = (personalidad.sitioWeb || personalidad.sitio_web || '').trim();
  
  // Si hay un sitio web, normalizar la URL
  if (sitio_web) {
    // Remover espacios y caracteres no válidos
    sitio_web = sitio_web.replace(/\s+/g, '');
    
    // Si no empieza con http:// o https://, agregar https://
    if (!sitio_web.startsWith('http://') && !sitio_web.startsWith('https://')) {
      sitio_web = 'https://' + sitio_web;
    }
  } else {
    // Si está vacío, usar string vacío explícitamente
    sitio_web = '';
  }

  const cat = personalidad.category;
  const useDef = defaults[cat.toLowerCase()] || {};  // Seleccionamos los valores por defecto según la categoría.
  
  // Asignación de valores predeterminados
  const nombre = (personalidad.nombre && personalidad.nombre !== "")
    ? personalidad.nombre
    : useDef.nombre?.[lang] || 'Sin nombre';  // Si no hay nombre, asignamos 'Sin nombre'

  const saludo = (personalidad.saludo && personalidad.saludo !== "")
    ? personalidad.saludo
    : useDef.saludo?.[lang] || '';  // Sin saludo predeterminado - la IA responde directamente

  const instrucciones = (personalidad.instrucciones && personalidad.instrucciones !== "")
    ? personalidad.instrucciones
    : useDef.instrucciones?.[lang] || 'No hay instrucciones';  // Si no hay instrucciones, asignamos 'No hay instrucciones'

  const context = (personalidad.context && personalidad.context !== "")
    ? personalidad.context
    : useDef.context?.[lang] || 'Contexto no especificado';  // Si no hay contexto, asignamos 'Contexto no especificado'

  return {
    nombre,
    empresa: personalidad.empresa || useDef.empresa || 'Sin empresa',  // Asignamos valor predeterminado
    sitio_web,
    posicion: personalidad.posicion || useDef.posicion || 'Sin posición',  // Asignamos valor predeterminado
    instrucciones,
    saludo,
    category: cat,
    context,
    timeResponse: personalidad.timeResponse
  };
}

// Función para dividir texto en fragmentos de máximo 1000 caracteres
function splitTextIntoChunks(text, maxChars = 1000) {
  if (!text || text.length <= maxChars) {
    return [text];
  }

  const chunks = [];
  let currentChunk = '';
  
  // Dividir por líneas para mantener la coherencia
  const lines = text.split('\n');
  
  for (const line of lines) {
    // Si una línea sola es más larga que el límite, dividirla por palabras
    if (line.length > maxChars) {
      // Si hay contenido acumulado, guardarlo
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      // Dividir la línea larga por palabras
      const words = line.split(' ');
      for (const word of words) {
        if ((currentChunk + ' ' + word).length > maxChars) {
          if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
            currentChunk = word;
          } else {
            // Si una palabra sola es más larga que el límite, dividirla
            chunks.push(word.substring(0, maxChars));
            currentChunk = word.substring(maxChars);
          }
        } else {
          currentChunk += (currentChunk ? ' ' : '') + word;
        }
      }
    } else {
      // Si agregar esta línea excede el límite, guardar el chunk actual
      if ((currentChunk + '\n' + line).length > maxChars) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
          currentChunk = line;
        } else {
          currentChunk = line;
        }
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
    }
  }
  
  // Agregar el último chunk si tiene contenido
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(chunk => chunk.trim().length > 0);
}

// -----------------------------------------------------------------------------
// Obtener todas las personalidades del usuario
// GET /api/personalities/all
// -----------------------------------------------------------------------------
export const getAllPersonalities = async (req, res) => {
  try {
    const userId = getUserIdFromToken(req)
    
    // MIGRADO: Usar API de Supabase en lugar de pool.query
    const { data, error } = await supabaseAdmin
      .from('personalities')
      .select('*')
      .eq('users_id', userId)
      .order('updated_at', { ascending: false });
    
    if (error) {
      console.error('Error al obtener personalidades desde Supabase:', error);
      throw error;
    }
    
    console.log(`✅ Personalidades cargadas: ${data?.length || 0} encontradas para usuario ${userId}`);
    return res.json({ success: true, personalidades: data || [] })
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error al obtener personalidades:', error.message)
      const statusCode = error.message.includes('Token') ? 401 : 500
      return res.status(statusCode).json({ success: false, message: error.message })
    }
    console.error('Error desconocido:', error)
    return res.status(500).json({ success: false, message: 'Error desconocido' })
  }
}

// -----------------------------------------------------------------------------
// Crear una nueva personalidad
// POST /api/personalities/create_personality
// Body: { personalidad: { nombre, instrucciones, category, ... } }
// -----------------------------------------------------------------------------
export const createPersonality = async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    const { personalidad } = req.body;
    const langHeader = req.get('accept-language') || '';
    const lang = langHeader.toLowerCase().startsWith('en') ? 'en' : 'es';

    // Debug: verificar el userId
    console.log('🔍 DEBUG createPersonality:', {
      userId,
      userIdType: typeof userId,
      userIdLength: userId?.length,
      isUUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)
    });

    if (!personalidad?.category) {
      return res.status(400).json({
        success: false,
        message: 'Falta la categoria',
      });
    }

    const formattedData = formatPersonalityData(personalidad, lang);

    // Extrae 'context' si existe, separa los datos para la base de datos
    const { context, ...dbData } = formattedData;

    const avatar_url = personalidad.avatar_url ?? null;
    const time_response = personalidad.timeResponse ? parseInt(personalidad.timeResponse, 10) : null;

    // Debug: verificar los datos que se van a insertar
    console.log('🔍 DEBUG datos a insertar:', {
      users_id: userId,
      nombre: dbData.nombre,
      category: dbData.category,
      sitio_web: dbData.sitio_web,
      empresa: dbData.empresa,
      posicion: dbData.posicion
    });
    
    // Debug: verificar qué viene del frontend
    console.log('🔍 DEBUG datos recibidos del frontend:', {
      sitioWeb: personalidad.sitioWeb,
      sitio_web: personalidad.sitio_web,
      empresa: personalidad.empresa
    });

    // MIGRADO: Usar función SQL directa para evitar trigger problemático, con fallback
    console.log('🛠️ Intentando función SQL create_personality_safe...');
    let { data, error } = await supabaseAdmin.rpc('create_personality_safe', {
      p_users_id: userId,
      p_nombre: dbData.nombre,
      p_empresa: dbData.empresa,
      p_sitio_web: dbData.sitio_web,
      p_posicion: dbData.posicion,
      p_instrucciones: dbData.instrucciones,
      p_saludo: dbData.saludo,
      p_category: dbData.category,
      p_avatar_url: avatar_url,
      p_time_response: time_response
    });

    // Si la función no existe, usar método directo con workaround
    if (error && error.code === 'PGRST202') {
      console.log('⚠️ Función SQL no encontrada, usando INSERT directo...');
      
      const insertResult = await supabaseAdmin
        .from('personalities')
        .insert({
          users_id: userId,
          nombre: dbData.nombre,
          empresa: dbData.empresa,
          sitio_web: dbData.sitio_web,
          posicion: dbData.posicion,
          instrucciones: dbData.instrucciones,
          saludo: dbData.saludo,
          category: dbData.category,
          avatar_url: avatar_url,
          time_response: time_response,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      data = insertResult.data;
      error = insertResult.error;
    }

    if (error) {
      console.error('❌ Error detallado al crear personalidad:', {
        error,
        code: error.code,
        message: error.message,
        hint: error.hint,
        details: error.details,
        userId,
        userIdType: typeof userId
      });
      
      // Si es error de tipo, dar sugerencia específica
      if (error.message.includes('operator does not exist: bigint = uuid')) {
        return res.status(400).json({
          success: false,
          message: 'Error de tipo de datos. Necesitas ejecutar la función SQL en Supabase.',
          debug: {
            userId,
            userIdType: typeof userId,
            errorDetails: error.message,
            solution: 'Ejecuta el archivo create_personality_function.sql en Supabase SQL Editor'
          }
        });
      }
      
      throw error;
    }

    // La función SQL retorna JSON, el INSERT directo retorna objeto
    const newP = typeof data === 'string' ? JSON.parse(data) : data;
    console.log(`✅ Personalidad creada exitosamente: ${newP.nombre} (ID: ${newP.id})`);
    console.log(`🔍 DEBUG sitio_web guardado en BD:`, {
      sitio_web_en_bd: newP.sitio_web,
      sitio_web_enviado: dbData.sitio_web,
      coincide: newP.sitio_web === dbData.sitio_web
    });

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
    }

    // 🌐 Scrapear sitio web automáticamente si existe
    if (dbData.sitio_web && dbData.sitio_web.trim() !== '') {
      console.log(`🌐 Iniciando scraping automático del sitio web: ${dbData.sitio_web}`);
      // Ejecutar en segundo plano sin bloquear la respuesta
      scrapeAndSaveWebsite(userId, newP.id, dbData.sitio_web)
        .then(() => {
          console.log(`✅ Sitio web scrapeado y guardado como instrucción para personalidad ${newP.id}`);
        })
        .catch((scrapeError) => {
          console.error(`⚠️ Error scrapeando sitio web (no crítico):`, scrapeError.message);
          // No lanzar error, solo loguearlo - el scraping es opcional
        });
    }

    // Notificar vía Socket.IO (opcional)
    io.to(userId).emit('personality-created', newP);

    return res.json({ success: true, personality: newP });
  } catch (error) {
    console.error('❌ Error en createPersonality:', {
      error,
      message: error.message,
      stack: error.stack?.split('\n')[0]
    });
    
    return res.status(500).json({ 
      success: false, 
      message: 'Error al crear personalidad',
      debug: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Función alternativa para insertar personalidad usando SQL directo
async function createPersonalityDirectSQL(userId, personalityData) {
  try {
    // Usar SQL directo para evitar triggers problemáticos
    const { data, error } = await supabaseAdmin.rpc('create_personality_direct', {
      p_users_id: userId,
      p_nombre: personalityData.nombre,
      p_empresa: personalityData.empresa,
      p_sitio_web: personalityData.sitio_web,
      p_posicion: personalityData.posicion,
      p_instrucciones: personalityData.instrucciones,
      p_saludo: personalityData.saludo,
      p_category: personalityData.category,
      p_avatar_url: personalityData.avatar_url,
      p_time_response: personalityData.time_response
    });

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error en createPersonalityDirectSQL:', error);
    throw error;
  }
}

// -----------------------------------------------------------------------------
// Editar una personalidad existente
// POST /api/personalities/edit_personality
// Body: { personalidad: { id, nombre, instrucciones, category, ... } }
// -----------------------------------------------------------------------------
export const editPersonality = async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    const { personalidad } = req.body;
    const langHeader = req.get('accept-language') || '';
    const lang = langHeader.toLowerCase().startsWith('en') ? 'en' : 'es';

    if (!personalidad?.id) {
      return res.status(400).json({
        success: false,
        message: 'Falta ID de personalidad',
      });
    }

    // Verificar que la personalidad pertenezca al usuario y obtener sitio_web actual - MIGRADO A SUPABASE
    const { data: checkData, error: checkError } = await supabaseAdmin
      .from('personalities')
      .select('id, sitio_web')
      .eq('id', personalidad.id)
      .eq('users_id', userId)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Personalidad no encontrada',
        });
      }
      console.error('Error al verificar personalidad:', checkError);
      throw checkError;
    }

    const oldWebsiteUrl = checkData.sitio_web || '';

    const formattedData = formatPersonalityData(personalidad, lang);
    const avatar_url = personalidad.avatar_url ?? null;

    const { context, timeResponse, ...dbData } = formattedData;

    // MIGRADO: Usar API de Supabase en lugar de pool.query
    const { data, error } = await supabaseAdmin
      .from('personalities')
      .update({
        nombre: dbData.nombre,
        empresa: dbData.empresa,
        sitio_web: dbData.sitio_web,
        posicion: dbData.posicion,
        instrucciones: dbData.instrucciones,
        saludo: dbData.saludo,
        category: dbData.category,
        avatar_url: avatar_url,
        time_response: timeResponse,
        updated_at: new Date().toISOString()
      })
      .eq('id', personalidad.id)
      .eq('users_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error al actualizar personalidad en Supabase:', error);
      throw error;
    }

    const updatedP = data;
    console.log(`✅ Personalidad actualizada: ${updatedP.nombre} (ID: ${updatedP.id})`);
    console.log(`🔍 DEBUG sitio_web guardado en BD (edit):`, {
      sitio_web_en_bd: updatedP.sitio_web,
      sitio_web_enviado: dbData.sitio_web,
      sitio_web_anterior: oldWebsiteUrl,
      coincide: updatedP.sitio_web === dbData.sitio_web
    });

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      });
    }

    // 🌐 Scrapear sitio web automáticamente si cambió o es nuevo
    const newWebsiteUrl = dbData.sitio_web || '';
    if (newWebsiteUrl.trim() !== '' && newWebsiteUrl !== oldWebsiteUrl) {
      console.log(`🌐 Sitio web cambió o es nuevo. Iniciando scraping automático: ${newWebsiteUrl}`);
      // Ejecutar en segundo plano sin bloquear la respuesta
      scrapeAndSaveWebsite(userId, updatedP.id, newWebsiteUrl)
        .then(() => {
          console.log(`✅ Sitio web scrapeado y guardado como instrucción para personalidad ${updatedP.id}`);
        })
        .catch((scrapeError) => {
          console.error(`⚠️ Error scrapeando sitio web (no crítico):`, scrapeError.message);
          // No lanzar error, solo loguearlo - el scraping es opcional
        });
    }

    io.to(userId).emit('personality-updated', updatedP);

    return res.json({
      success: true,
      personality: updatedP,
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error al editar personalidad:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Error al editar personalidad',
      });
    }
    console.error('Error desconocido:', error);
    return res.status(500).json({
      success: false,
      message: 'Error desconocido',
    });
  }
};


// -----------------------------------------------------------------------------
// Eliminar personalidad por ID
// POST /api/personalities/delete/:id
// -----------------------------------------------------------------------------
export const deletePersonalityById = async (req, res) => {
  try {
    const userId = getUserIdFromToken(req)
    const personalityId = req.params.id

    if (!personalityId) {
      return res.status(400).json({ success: false, message: 'ID de personalidad inválido' })
    }
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuario no autenticado' })
    }

    // MIGRADO: Usar API de Supabase en lugar de pool.query
    const { data, error } = await supabaseAdmin
      .from('personalities')
      .delete()
      .eq('users_id', userId)
      .eq('id', personalityId)
      .select();

    if (error) {
      console.error('Error al eliminar personalidad en Supabase:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Personalidad no encontrada o no pertenece al usuario',
      })
    }

    console.log(`✅ Personalidad eliminada: ${data[0].nombre} (ID: ${personalityId})`);

    io.to(userId).emit('personality-deleted', { id: personalityId })

    return res.json({ success: true, message: 'Personalidad eliminada' })
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error al eliminar personalidad:', error.message)
      return res.status(500).json({ success: false, message: 'Error al eliminar personalidad' })
    }
    console.error('Error desconocido:', error)
    return res.status(500).json({ success: false, message: 'Error desconocido' })
  }
}

// -----------------------------------------------------------------------------
// Añadir instrucción a una personalidad
// POST /api/personalities/instructions
// Body: { personalityId, instruction, media? }
// -----------------------------------------------------------------------------
export const sendInstruction = async (req, res) => {
  try {
    const userId = getUserIdFromToken(req)
    const { personalityId, instruction, media, useAI = false } = req.body

    // Validar campos obligatorios
    if (
      !personalityId ||
      (
        (!instruction || instruction.trim() === "") &&
        (!Array.isArray(media) || media.length === 0)
      )
    ) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos: debe venir texto o al menos un fichero adjunto'
      })
    }
    // Validar longitud
    if (instruction.length > 1000) {
      return res.status(400).json({ success: false, message: 'El texto no puede superar los 1000 caracteres.' })
    }

    // Verificar personalidad del usuario y obtener datos completos
    const { data: personalityCheck, error: checkError } = await supabaseAdmin
      .from('personalities')
      .select('id, nombre, category, empresa, posicion')
      .eq('id', personalityId)
      .eq('users_id', userId)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({ success: false, message: 'Personalidad no encontrada' });
      }
      console.error('Error al verificar personalidad:', checkError);
      throw checkError;
    }

    // Insertar instrucción - MIGRADO: Usar API de Supabase
    const { data: instructionData, error: insertError } = await supabaseAdmin
      .from('personality_instructions')
      .insert({
        users_id: userId,
        personality_id: personalityId,
        instruccion: instruction,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Error al insertar instrucción:', insertError);
      throw insertError;
    }

    const instructionId = instructionData.id;

    // Manejar archivos adjuntos con validación mejorada para el frontend
    let extractedTexts = []
    let processedMedia = [] // Declarar aquí para que esté disponible en todo el scope
    const MAX_TOTAL_SIZE = 1024 * 1024 * 1024 // 1 GB
    const MAX_SINGLE_FILE = 500 * 1024 * 1024 // 500 MB por archivo individual
    const ALLOWED_MIME_TYPES = new Set([
      'application/pdf',
      // imágenes
      'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml',
      // audio
      'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/mp4',
      // video
      'video/mp4', 'video/webm', 'video/quicktime'
    ])
    function isAllowedMime(mime) {
      if (!mime) return false
      if (mime.startsWith('image/')) return true
      if (mime.startsWith('audio/')) return true
      if (mime.startsWith('video/')) return true
      return ALLOWED_MIME_TYPES.has(mime)
    }

    // Función auxiliar para detectar URLs de video
    function isVideoUrl(url) {
      if (!url || typeof url !== 'string') return false
      const videoInfo = detectVideoUrl(url)
      return videoInfo.isValid
    }

    // Función auxiliar para validar URLs de video en el array de media
    function validateVideoUrls(mediaArray) {
      const videoUrls = []
      const invalidUrls = []
      
      mediaArray.forEach((m, index) => {
        if (m.url && !m.data) {
          const videoInfo = detectVideoUrl(m.url)
          if (videoInfo.isValid) {
            videoUrls.push({ ...m, index, videoInfo })
          } else if (m.url.includes('youtube.com') || m.url.includes('youtu.be') || 
                     m.url.includes('instagram.com') || m.url.includes('tiktok.com')) {
            invalidUrls.push({ url: m.url, index })
          }
        }
      })
      
      return { videoUrls, invalidUrls, hasVideoUrls: videoUrls.length > 0 }
    }
    
    if (Array.isArray(media) && media.length) {
      console.log(`📁 Validando ${media.length} archivos multimedia...`);
      
      // Validar URLs de video primero
      const urlValidation = validateVideoUrls(media)
      if (urlValidation.invalidUrls.length > 0) {
        return res.status(400).json({
          success: false,
          message: `URLs de video no válidas detectadas: ${urlValidation.invalidUrls.map(u => u.url).join(', ')}`,
          supportedPlatforms: ['YouTube', 'Instagram Reels', 'TikTok']
        })
      }
      
      // Si hay URLs de video, verificar disponibilidad del servicio
      if (urlValidation.hasVideoUrls) {
        const ytDlpAvailable = await checkYtDlpAvailability()
        if (!ytDlpAvailable) {
          return res.status(503).json({
            success: false,
            message: 'Servicio de descarga de videos no disponible. Las URLs de video no pueden procesarse en este momento.',
            error: 'yt-dlp no está instalado'
          })
        }
        console.log(`🎬 Detectadas ${urlValidation.videoUrls.length} URLs de video válidas`)
      }
      
      // Validar cada archivo individualmente
      let totalBytes = 0
      for (const [index, m] of media.entries()) {
        // Validar estructura del archivo
        if (!m.data && !m.url) {
          return res.status(400).json({
            success: false,
            message: `Archivo ${index + 1}: Faltan datos requeridos (data o url)`
          })
        }
        
        // Validar tipo MIME (saltar validación para URLs de video válidas)
        const mimeType = m.mimeType || m.type;
        const isValidVideoUrl = m.url && !m.data && isVideoUrl(m.url)
        
        if (!m.url && !isAllowedMime(mimeType)) {
          return res.status(400).json({
            success: false,
            message: `Archivo ${index + 1} (${m.filename || 'sin nombre'}): Tipo no soportado (${mimeType}). Tipos permitidos: PDF, imágenes, audio, video, URLs de video`
          })
        }
        
        // Calcular tamaño del archivo
        let fileSize = 0
        if (m.data) {
          let raw = m.data
          if (raw.startsWith('data:')) raw = raw.split(',')[1]
          fileSize = Buffer.from(raw, 'base64').byteLength
        }
        
        // Validar tamaño individual
        if (!m.url && fileSize > MAX_SINGLE_FILE) {
          return res.status(400).json({
            success: false,
            message: `Archivo ${index + 1} (${m.filename || 'sin nombre'}): Tamaño (${(fileSize / 1024 / 1024).toFixed(2)} MB) supera el máximo de ${(MAX_SINGLE_FILE / 1024 / 1024)} MB por archivo`
          })
        }
        
        totalBytes += fileSize
        console.log(`   - Archivo ${index + 1}: ${m.filename || (m.url ? m.url : 'sin nombre')} (${mimeType || 'desconocido'}${m.url ? ', url' : ''}${fileSize ? `, ${(fileSize / 1024).toFixed(2)} KB` : ''})`);
      }
      
      // Validar tamaño total
      if (totalBytes > MAX_TOTAL_SIZE) {
        return res.status(400).json({
          success: false,
          message: `El tamaño total de los archivos (${(totalBytes / 1024 / 1024).toFixed(2)} MB) supera el máximo de ${(MAX_TOTAL_SIZE / 1024 / 1024)} MB`
        })
      }
      
      console.log(`✅ Validación completada: ${media.length} archivos, ${(totalBytes / 1024 / 1024).toFixed(2)} MB total`);

      // Separar medios normales de URLs de video
      const normalMedia = []
      const videoUrls = []
      
      media.forEach((m, index) => {
        if (m.url && !m.data && isVideoUrl(m.url)) {
          const videoInfo = detectVideoUrl(m.url)
          videoUrls.push({ ...m, index, videoInfo })
        } else {
          normalMedia.push(m)
        }
      })

      console.log(`🎯 Procesando ${normalMedia.length} archivos normales y ${videoUrls.length} URLs de video para instrucción ${instructionId}`);
      console.log(`🤖 Datos de personalidad para IA: ${personalityCheck.nombre} (${personalityCheck.category})`);
      
      // Crear contexto de usuario con la instrucción para análisis más inteligente
      const userContext = {
        userIntent: instruction,
        personalityName: personalityCheck.nombre,
        personalityCategory: personalityCheck.category
      };
      
      // Procesar archivos normales primero
      if (normalMedia.length > 0) {
        processedMedia = await processMediaArray(normalMedia, null, instructionId, 'instruction', userId, personalityCheck, userContext, useAI)
      }
      
      // Procesar URLs de video por separado
      if (videoUrls.length > 0) {
        console.log(`🎬 Procesando ${videoUrls.length} URLs de video...`)
        try {
          await processVideoUrls(videoUrls, instructionId, userId, personalityCheck)
          console.log(`✅ URLs de video procesadas exitosamente`)
        } catch (videoError) {
          console.error('❌ Error procesando URLs de video:', videoError)
          // Continuar con el procesamiento normal, no fallar completamente
        }
      }

      // Recuperar textos extraídos
      // Recuperar textos extraídos (filtramos por personality_instruction_id, no message_id)
      console.log(`📚 Recuperando textos extraídos para instrucción ${instructionId}`);
      const { data: mediaRows, error: mediaError } = await supabaseAdmin
        .from('media')
        .select('extracted_text')
        .eq('personality_instruction_id', instructionId)
        .eq('users_id', userId)
        .order('created_at', { ascending: true });

      if (mediaError) {
        console.error('Error al recuperar textos extraídos:', mediaError);
        throw mediaError;
      }

      // ¡Asignamos al array exterior, no redeclaramos!
      extractedTexts = (mediaRows || []).map(r => r.extracted_text).filter(txt => txt)
      console.log(`✅ Textos extraídos recuperados: ${extractedTexts.length} elementos`);
      
      if (extractedTexts.length) {
        const onlyPdfText = extractedTexts.join("\n\n");
        console.log(`📝 Texto extraído completo (${onlyPdfText.length} caracteres)`);
        
        // Dividir el texto en fragmentos de máximo 1000 caracteres
        const textChunks = splitTextIntoChunks(onlyPdfText, 1000);
        console.log(`✂️ Texto dividido en ${textChunks.length} fragmentos de máximo 1000 caracteres`);
        
        if (textChunks.length === 1) {
          // Si solo hay un fragmento, actualizar la instrucción existente
          const { error: updateError } = await supabaseAdmin
            .from('personality_instructions')
            .update({ instruccion: textChunks[0] })
            .eq('id', instructionId);

          if (updateError) {
            console.error('Error al actualizar instrucción:', updateError);
            throw updateError;
          }
          console.log(`✅ Instrucción actualizada con fragmento único`);
        } else {
          // Si hay múltiples fragmentos, actualizar el primero y crear nuevas instrucciones para el resto
          const { error: updateError } = await supabaseAdmin
            .from('personality_instructions')
            .update({ instruccion: textChunks[0] })
            .eq('id', instructionId);

          if (updateError) {
            console.error('Error al actualizar primera instrucción:', updateError);
            throw updateError;
          }
          console.log(`✅ Primera instrucción actualizada con fragmento 1/${textChunks.length}`);
          
          // Crear instrucciones adicionales para los fragmentos restantes
          for (let i = 1; i < textChunks.length; i++) {
            const { error: insertError } = await supabaseAdmin
              .from('personality_instructions')
              .insert({
                users_id: userId,
                personality_id: personalityId,
                instruccion: textChunks[i],
                created_at: new Date().toISOString()
              });

            if (insertError) {
              console.error('Error al crear instrucción adicional:', insertError);
              throw insertError;
            }
            console.log(`✅ Instrucción adicional ${i + 1}/${textChunks.length} creada (${textChunks[i].length} caracteres)`);
          }
          
          console.log(`🎯 Proceso completado: Se crearon ${textChunks.length} instrucciones en total`);
        }
      }

    }

    // Preparar respuesta con información adicional de procesamiento
    const responseData = {
      success: true,
      instructionId,
      extractedTexts
    };
    
    // Si se procesó media con IA, incluir información adicional
    if (processedMedia && processedMedia.length > 0) {
      responseData.media = processedMedia.map(item => ({
        id: item.id,
        filename: item.filename,
        type: item.type,
        url: item.url,
        extractedText: item.extractedText,
        videoTranscription: item.videoTranscription,
        aiAnalysis: item.aiAnalysis,
        processedWithAI: item.processedWithAI
      }));
    }
    
    return res.json(responseData)
  } catch (err) {
    console.error('Error al enviar instrucción:', err)
    return res.status(500).json({ success: false, message: 'Error al agregar instrucción' })
  }
}

export const getPersonalityInstructions = async (req, res) => {
  const userId = getUserIdFromToken(req);
  const { personalityId } = req.body;
  if (!personalityId) return res.status(400).json({ success: false, message: 'Falta ID' });

  try {
    // MIGRADO: Usar API de Supabase con JOIN simulado (dos consultas)
    
    // 1) Obtener instrucciones
    const { data: instructions, error: instructionsError } = await supabaseAdmin
      .from('personality_instructions')
      .select('id, instruccion, created_at')
      .eq('personality_id', personalityId)
      .eq('users_id', userId)
      .order('created_at', { ascending: true });

    if (instructionsError) {
      console.error('Error al obtener instrucciones desde Supabase:', instructionsError);
      throw instructionsError;
    }

    // 2) Para cada instrucción, obtener su media con metadatos completos
    const grouped = [];
    
    for (const instruction of instructions || []) {
      const { data: mediaData, error: mediaError } = await supabaseAdmin
        .from('media')
        .select('id, media_type, filename, mime_type, image_url, extracted_text, created_at')
        .eq('personality_instruction_id', instruction.id)
        .eq('users_id', userId)
        .order('created_at', { ascending: true });

      if (mediaError) {
        console.error('❌ [DEBUG] Error al obtener media desde Supabase:', mediaError);
        console.error('❌ [DEBUG] Query que falló: SELECT id, media_type, filename, mime_type, image_url, extracted_text, created_at');
        console.error('❌ [DEBUG] Para instrucción:', instruction.id);
        // Continuar sin media si hay error
      } else {
        console.log(`✅ [DEBUG] Media encontrada para instrucción ${instruction.id}: ${mediaData?.length || 0} archivos`);
      }

      // Procesar media con metadatos completos para el frontend (incluyendo size vía HEAD si es posible)
      const processedMedia = await Promise.all((mediaData || []).map(async mediaItem => {
        const isSupabaseUrl = mediaItem.image_url && mediaItem.image_url.includes('supabase.co/storage');
        const isLocalFile = mediaItem.image_url && mediaItem.image_url.startsWith('/uploads/');

        // Construir URL completa según el tipo de almacenamiento
        let fullUrl = mediaItem.image_url;
        if (isLocalFile) {
          const baseUrl = process.env.NODE_ENV === 'production' 
            ? 'https://api.uniclick.io' 
            : 'http://localhost:5001';
          fullUrl = `${baseUrl}${mediaItem.image_url}`;
        }

        // Intentar obtener tamaño con HEAD
        let sizeBytes = 0;
        try {
          if (fullUrl && fullUrl.startsWith('http')) {
            const resp = await fetch(fullUrl, { method: 'HEAD' });
            const cl = resp.headers.get('content-length');
            if (cl) sizeBytes = parseInt(cl, 10) || 0;
          }
        } catch (e) {
          // ignorar si falla
        }

        return {
          id: mediaItem.id,
          // compat existentes
          data: fullUrl,
          url: fullUrl,
          // requerido por el front
          image_url: fullUrl,
          mime_type: mediaItem.mime_type || 'application/octet-stream',
          filename: mediaItem.filename || 'archivo_sin_nombre',
          size: sizeBytes,
          // campos adicionales
          mimeType: mediaItem.mime_type || 'application/octet-stream',
          type: mediaItem.mime_type === 'application/pdf' ? 'pdf' : 
                (mediaItem.mime_type?.startsWith('image/') ? 'image' : 
                (mediaItem.mime_type?.startsWith('audio/') ? 'audio' : 
                (mediaItem.mime_type?.startsWith('video/') ? 'video' : mediaItem.media_type))),
          extractedText: mediaItem.extracted_text || undefined,
          uploadedAt: mediaItem.created_at,
          isSupabaseStorage: isSupabaseUrl,
          isLocalStorage: isLocalFile,
          previewSupported: ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'].includes(mediaItem.mime_type)
        };
      }));

      grouped.push({
        id: instruction.id,
        texto: instruction.instruccion,
        created_at: instruction.created_at,
        media: processedMedia,
        // Estadísticas adicionales
        mediaCount: processedMedia.length,
        hasPdfs: processedMedia.some(m => m.type === 'pdf'),
        hasImages: processedMedia.some(m => m.type === 'image'),
        hasAudio: processedMedia.some(m => m.type === 'audio'),
        totalSize: 0 // Tamaño no disponible en la tabla actual
      });
    }

    // Estadísticas generales
    const totalMedia = grouped.reduce((sum, instr) => sum + instr.mediaCount, 0);
    const totalPdfs = grouped.reduce((sum, instr) => sum + (instr.hasPdfs ? instr.media.filter(m => m.type === 'pdf').length : 0), 0);
    const totalSize = grouped.reduce((sum, instr) => sum + instr.totalSize, 0);
    
    console.log(`✅ Instrucciones cargadas: ${grouped.length} instrucciones para personalidad ${personalityId}`);
    console.log(`   - Total archivos multimedia: ${totalMedia}`);
    console.log(`   - Total PDFs: ${totalPdfs}`);
    console.log(`   - Tamaño total: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

    return res.json({ 
      success: true, 
      instructions: grouped,
      // Metadatos para el frontend
      metadata: {
        totalInstructions: grouped.length,
        totalMediaFiles: totalMedia,
        totalPdfs: totalPdfs,
        totalSizeMB: parseFloat((totalSize / 1024 / 1024).toFixed(2)),
        apiUrl: process.env.NODE_ENV === 'production' ? 'https://api.uniclick.io' : 'http://localhost:5001'
      }
    });
  } catch (error) {
    console.error('Error al obtener instrucciones de personalidad:', error);
    return res.status(500).json({ success: false, message: 'Error al obtener instrucciones' });
  }
}
// -----------------------------------------------------------------------------
// Reprocesar instrucciones existentes con IA
// POST /api/personalities/reprocess_instructions
// Body: { personalityId }
// -----------------------------------------------------------------------------
export const reprocessPersonalityInstructions = async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    const { personalityId } = req.body;

    if (!personalityId) {
      return res.status(400).json({
        success: false,
        message: 'Falta ID de personalidad'
      });
    }

    console.log(`🔄 Iniciando reprocesamiento de instrucciones para personalidad ${personalityId}`);

    // Obtener datos de la personalidad
    const { data: personality, error: personalityError } = await supabaseAdmin
      .from('personalities')
      .select('id, nombre, category, instrucciones')
      .eq('id', personalityId)
      .eq('users_id', userId)
      .single();

    if (personalityError) {
      if (personalityError.code === 'PGRST116') {
        return res.status(404).json({ success: false, message: 'Personalidad no encontrada' });
      }
      console.error('Error al obtener personalidad:', personalityError);
      throw personalityError;
    }

    // Obtener todas las instrucciones adicionales
    const { data: additionalInstructions, error: instructionsError } = await supabaseAdmin
      .from('personality_instructions')
      .select('id, instruccion')
      .eq('personality_id', personalityId)
      .eq('users_id', userId)
      .order('created_at', { ascending: true });

    if (instructionsError) {
      console.error('Error al obtener instrucciones adicionales:', instructionsError);
      throw instructionsError;
    }

    // Combinar todas las instrucciones
    let allInstructions = personality.instrucciones || '';
    if (additionalInstructions && additionalInstructions.length > 0) {
      const additionalText = additionalInstructions
        .map(instr => instr.instruccion)
        .filter(text => text && text.trim())
        .join('\n\n');
      
      if (additionalText.trim()) {
        allInstructions = allInstructions.trim() 
          ? `${allInstructions}\n\nInstrucciones adicionales:\n${additionalText}`
          : additionalText;
      }
    }

    if (!allInstructions || allInstructions.trim().length < 20) {
      return res.status(400).json({
        success: false,
        message: 'No hay suficientes instrucciones para reprocesar'
      });
    }

    console.log(`📝 Reprocesando ${allInstructions.length} caracteres de instrucciones`);

    // Reprocesar con IA
    const improvedInstructions = await reprocessExistingInstructions(
      allInstructions,
      personality.nombre || 'Asistente',
      personality.category || 'formal'
    );

    // Actualizar las instrucciones base de la personalidad
    const { error: updateError } = await supabaseAdmin
      .from('personalities')
      .update({
        instrucciones: improvedInstructions,
        updated_at: new Date().toISOString()
      })
      .eq('id', personalityId)
      .eq('users_id', userId);

    if (updateError) {
      console.error('Error al actualizar instrucciones:', updateError);
      throw updateError;
    }

    console.log(`✅ Instrucciones reprocesadas exitosamente para ${personality.nombre}`);

    return res.json({
      success: true,
      message: 'Instrucciones reprocesadas exitosamente',
      originalLength: allInstructions.length,
      improvedLength: improvedInstructions.length,
      improvementRatio: (improvedInstructions.length / allInstructions.length).toFixed(2),
      preview: improvedInstructions.substring(0, 200) + '...'
    });

  } catch (error) {
    console.error('❌ Error reprocesando instrucciones:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error al reprocesar instrucciones',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export async function fetchPersonalityInstructions(personalityId, userId) {
  try {
    console.log(`🔍 fetchPersonalityInstructions iniciado:`, { personalityId, userId });
    
    // 1. Obtener datos básicos de la personalidad - MIGRADO A SUPABASE
    const { data: personalityData, error: personalityError } = await supabaseAdmin
      .from('personalities')
      .select(`
        id,
        nombre,
        empresa,
        sitio_web,
        posicion,
        category,
        instrucciones,
        saludo,
        time_response,
        avatar_url,
        created_at,
        updated_at
      `)
      .eq('id', personalityId)
      .eq('users_id', userId)
      .single();

    if (personalityError) {
      if (personalityError.code === 'PGRST116') {
        console.error(`❌ Personalidad no encontrada: ID=${personalityId}, UserID=${userId}`);
        throw new Error(`Personalidad no encontrada para ID ${personalityId} y usuario ${userId}`);
      }
      console.error('Error al obtener personalidad desde Supabase:', personalityError);
      throw personalityError;
    }

    const personality = personalityData;
    console.log(`✅ Personalidad básica encontrada:`, {
      id: personality.id,
      nombre: personality.nombre,
      basicInstructionsLength: personality.instrucciones?.length || 0,
      category: personality.category
    });

    // 2. Obtener instrucciones adicionales de personality_instructions - MIGRADO A SUPABASE
    const { data: additionalInstructions, error: instructionsError } = await supabaseAdmin
      .from('personality_instructions')
      .select('id, instruccion, created_at')
      .eq('personality_id', personalityId)
      .eq('users_id', userId)
      .order('created_at', { ascending: true });

    if (instructionsError) {
      console.error('Error al obtener instrucciones adicionales desde Supabase:', instructionsError);
      throw instructionsError;
    }

    console.log(`📚 Instrucciones adicionales encontradas: ${additionalInstructions?.length || 0}`);
    
    if (additionalInstructions && additionalInstructions.length > 0) {
      additionalInstructions.forEach((instr, index) => {
        console.log(`   - Instrucción ${index + 1}: ${instr.instruccion?.length || 0} caracteres (ID: ${instr.id})`);
      });
    }

    // 3. Combinar instrucciones básicas con las adicionales
    let combinedInstructions = personality.instrucciones || '';
    
    if (additionalInstructions && additionalInstructions.length > 0) {
      const additionalText = additionalInstructions
        .map(row => row.instruccion)
        .filter(instruction => instruction && instruction.trim())
        .join('\n\n');
      
      if (additionalText.trim()) {
        if (combinedInstructions.trim()) {
          combinedInstructions = `${combinedInstructions}\n\nInstrucciones adicionales:\n${additionalText}`;
        } else {
          combinedInstructions = `Instrucciones adicionales:\n${additionalText}`;
        }
        console.log(`🔗 Instrucciones combinadas: ${combinedInstructions.length} caracteres totales`);
      } else {
        console.log(`⚠️ Instrucciones adicionales encontradas pero están vacías`);
      }
    }

    // Verificar que tenemos instrucciones válidas
    if (!combinedInstructions || !combinedInstructions.trim()) {
      console.error(`❌ No hay instrucciones válidas para la personalidad ${personalityId}`);
      // Usar instrucciones por defecto basadas en la categoría
      const defaultInstructions = getDefaultInstructionsForCategory(personality.category || 'formal');
      combinedInstructions = defaultInstructions;
      console.log(`⚠️ Usando instrucciones por defecto para categoría: ${personality.category}`);
    }

    // 4. Obtener archivos disponibles para envío (de todas las instrucciones)
    let availableFiles = [];
    try {
      const { data: mediaFiles, error: mediaFilesError } = await supabaseAdmin
        .from('media')
        .select('id, filename, mime_type, image_url, extracted_text, personality_instruction_id')
        .in('personality_instruction_id', additionalInstructions?.map(i => i.id) || [])
        .eq('users_id', userId);

      if (!mediaFilesError && mediaFiles && mediaFiles.length > 0) {
        availableFiles = mediaFiles.map(file => {
          const isImage = file.mime_type?.startsWith('image/');
          const isPdf = file.mime_type === 'application/pdf';
          const isVideo = file.mime_type?.startsWith('video/');
          const fileType = isPdf ? 'PDF' : (isImage ? 'Imagen' : (isVideo ? 'Video' : 'Archivo'));
          
          return {
            id: file.id,
            filename: file.filename || 'archivo',
            type: fileType,
            url: file.image_url,
            description: file.extracted_text?.substring(0, 200) || `${fileType}: ${file.filename}`
          };
        });
        console.log(`📎 Archivos disponibles para envío: ${availableFiles.length}`);
      }
    } catch (mediaError) {
      console.error('⚠️ Error al obtener archivos disponibles:', mediaError);
    }

    // 5. Crear texto de archivos disponibles para el prompt
    let filesPrompt = '';
    if (availableFiles.length > 0) {
      filesPrompt = '\n\n📁 ARCHIVOS DISPONIBLES PARA ENVIAR:\n' + 
        availableFiles.map(f => `- [${f.type}] ${f.filename}: ${f.description.substring(0, 100)}... → Para enviar usa: [[ENVIAR_ARCHIVO:${f.id}]]`).join('\n') +
        '\n\nPuedes enviar estos archivos cuando sea relevante usando el formato [[ENVIAR_ARCHIVO:ID]].';
    }

    const result = {
      id: personality.id,
      nombre: personality.nombre || 'Asistente',
      empresa: personality.empresa || '',
      sitio_web: personality.sitio_web || '',
      posicion: personality.posicion || '',
      category: personality.category || 'formal',
      instrucciones: combinedInstructions + filesPrompt, // Instrucciones combinadas + archivos disponibles
      saludo: personality.saludo || '',
      time_response: personality.time_response || 0,
      avatar_url: personality.avatar_url || '',
      created_at: personality.created_at,
      updated_at: personality.updated_at,
      availableFiles: availableFiles // Lista de archivos para procesar después
    };

    console.log('🎯 fetchPersonalityInstructions completado exitosamente:', {
      personalityId,
      nombre: result.nombre,
      basicInstructions: personality.instrucciones?.length || 0,
      additionalInstructions: additionalInstructions?.length || 0,
      combinedLength: result.instrucciones?.length || 0,
      availableFilesCount: availableFiles.length,
      preview: result.instrucciones?.substring(0, 100) + '...'
    });
    
    return result;
  } catch (error) {
    console.error('❌ Error en fetchPersonalityInstructions:', {
      personalityId,
      userId,
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// Función auxiliar para obtener instrucciones por defecto según la categoría
function getDefaultInstructionsForCategory(category) {
  const defaults = {
    amigable: 'Soy un asistente amigable y cercano. Hablo de manera coloquial y trato de ser útil y comprensivo.',
    familia: 'Soy un familiar cariñoso que siempre está dispuesto a ayudar. Uso un tono familiar y cercano.',
    formal: 'Soy un asistente profesional y formal. Respondo de manera educada y precisa.',
    negocios: 'Soy un profesional de negocios. Mantengo un tono empresarial y me enfoco en ser eficiente y útil.'
  };
  
  return defaults[category?.toLowerCase()] || defaults.formal;
}

// Función de diagnóstico del sistema
export const systemDiagnostic = async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    
    const diagnostic = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      userId: userId,
      envVariables: {
        OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
        DEEPSEEK_API_KEY: !!process.env.DEEPSEEK_API_KEY,
        DATABASE_URL: !!process.env.DATABASE_URL
      },
      database: null,
      personalities: null,
      instructions: null
    };

    // Test de conexión a base de datos - MIGRADO: Usar API de Supabase
    try {
      const { data: personalityCount, error: countError } = await supabaseAdmin
        .from('personalities')
        .select('id', { count: 'exact' })
        .eq('users_id', userId);

      if (countError) {
        throw countError;
      }

      diagnostic.database = {
        connected: true,
        currentTime: new Date().toISOString(),
        personalityCount: personalityCount?.length || 0
      };
    } catch (dbError) {
      diagnostic.database = {
        connected: false,
        error: dbError.message
      };
    }

    // Test de personalidades - MIGRADO: Usar API de Supabase
    try {
      const { data: personalities, error: persError } = await supabaseAdmin
        .from('personalities')
        .select('id, nombre, category, instrucciones')
        .eq('users_id', userId)
        .limit(5);

      if (persError) {
        throw persError;
      }

      diagnostic.personalities = (personalities || []).map(p => ({
        id: p.id,
        nombre: p.nombre,
        category: p.category,
        instructionLength: p.instrucciones?.length || 0
      }));
    } catch (persError) {
      diagnostic.personalities = { error: persError.message };
    }

    // Test de instrucciones adicionales - MIGRADO: Usar API de Supabase
    try {
      const { data: instructions, error: instrError } = await supabaseAdmin
        .from('personality_instructions')
        .select('personality_id, instruccion')
        .eq('users_id', userId)
        .limit(50); // Aumentar el límite para poder agrupar

      if (instrError) {
        throw instrError;
      }

      // Agrupar por personality_id
      const grouped = {};
      (instructions || []).forEach(instr => {
        if (!grouped[instr.personality_id]) {
          grouped[instr.personality_id] = {
            count: 0,
            totalLength: 0
          };
        }
        grouped[instr.personality_id].count++;
        grouped[instr.personality_id].totalLength += instr.instruccion?.length || 0;
      });

      diagnostic.instructions = Object.entries(grouped).slice(0, 5).map(([personalityId, data]) => ({
        personalityId: parseInt(personalityId),
        count: data.count,
        totalLength: data.totalLength
      }));
    } catch (instrError) {
      diagnostic.instructions = { error: instrError.message };
    }

    return res.json({
      success: true,
      diagnostic
    });
  } catch (error) {
    console.error('Error en diagnóstico del sistema:', error);
    return res.status(500).json({
      success: false,
      message: 'Error en diagnóstico del sistema',
      error: error.message
    });
  }
};

// Actualizar instrucción de personalidad
export const updatePersonalityInstruction = async (req, res) => {
  try {
    const userId = getUserIdFromToken(req)
    const { instructionId, personalityId, newText } = req.body
    
    console.log(`📝 Actualizando instrucción ${instructionId} de personalidad ${personalityId} para usuario ${userId}`);
    
    if (!instructionId || !personalityId || !newText) {
      return res.status(400).json({ 
        success: false, 
        message: 'Faltan datos para actualizar instrucción (instructionId, personalityId y newText requeridos)' 
      })
    }

    // Validar longitud del texto
    if (newText.length > 2000) {
      return res.status(400).json({ 
        success: false, 
        message: 'El texto de la instrucción no puede superar los 2000 caracteres' 
      })
    }

    // Verificar que la instrucción existe y pertenece al usuario
    const { data: existingInstruction, error: checkError } = await supabaseAdmin
      .from('personality_instructions')
      .select('id, personality_id, users_id, instruccion')
      .eq('id', instructionId)
      .eq('personality_id', personalityId)
      .eq('users_id', userId)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        console.log(`❌ Instrucción ${instructionId} no encontrada o no pertenece al usuario`);
        return res.status(404).json({ 
          success: false, 
          message: 'Instrucción no encontrada o no tienes permisos para actualizarla' 
        });
      }
      console.error('Error verificando instrucción:', checkError);
      throw checkError;
    }

    console.log(`✅ Instrucción verificada, procediendo a actualizar...`);
    console.log(`   - Texto anterior: ${existingInstruction.instruccion.length} caracteres`);
    console.log(`   - Texto nuevo: ${newText.length} caracteres`);

    // Actualizar la instrucción
    const { data: updatedInstruction, error: updateError } = await supabaseAdmin
      .from('personality_instructions')
      .update({
        instruccion: newText,
        updated_at: new Date().toISOString()
      })
      .eq('id', instructionId)
      .eq('personality_id', personalityId)
      .eq('users_id', userId)
      .select('id, instruccion, updated_at')
      .single();

    if (updateError) {
      console.error('Error actualizando instrucción:', updateError);
      throw updateError;
    }

    console.log(`✅ Instrucción ${instructionId} actualizada exitosamente`);

    return res.json({
      success: true,
      message: 'Instrucción actualizada exitosamente',
      updated: {
        instructionId: updatedInstruction.id,
        newText: updatedInstruction.instruccion,
        updatedAt: updatedInstruction.updated_at,
        characterCount: updatedInstruction.instruccion.length
      }
    })
  } catch (error) {
    console.error('❌ Error al actualizar instrucción:', error)
    return res.status(500).json({
      success: false,
      message: 'Error interno al actualizar instrucción',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
}

// Eliminar instrucción de personalidad
export const deletePersonalityInstruction = async (req, res) => {
  try {
    const userId = getUserIdFromToken(req)
    const { instructionId, personalityId } = req.body
    
    console.log(`🗑️ Eliminando instrucción ${instructionId} de personalidad ${personalityId} para usuario ${userId}`);
    
    if (!instructionId || !personalityId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Faltan datos para eliminar instrucción (instructionId y personalityId requeridos)' 
      })
    }

    // Verificar que la instrucción existe y pertenece al usuario
    const { data: existingInstruction, error: checkError } = await supabaseAdmin
      .from('personality_instructions')
      .select('id, personality_id, users_id')
      .eq('id', instructionId)
      .eq('personality_id', personalityId)
      .eq('users_id', userId)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        console.log(`❌ Instrucción ${instructionId} no encontrada o no pertenece al usuario`);
        return res.status(404).json({ 
          success: false, 
          message: 'Instrucción no encontrada o no tienes permisos para eliminarla' 
        });
      }
      console.error('Error verificando instrucción:', checkError);
      throw checkError;
    }

    console.log(`✅ Instrucción verificada, procediendo a eliminar...`);

    // Eliminar archivos multimedia asociados primero
    const { data: mediaFiles, error: mediaError } = await supabaseAdmin
      .from('media')
      .select('id, image_url')
      .eq('personality_instruction_id', instructionId)
      .eq('users_id', userId);

    if (mediaError) {
      console.error('Error obteniendo archivos multimedia:', mediaError);
    } else if (mediaFiles && mediaFiles.length > 0) {
      console.log(`🗂️ Eliminando ${mediaFiles.length} archivos multimedia asociados...`);
      
      // Eliminar archivos de Supabase Storage si es necesario
      for (const mediaFile of mediaFiles) {
        if (mediaFile.image_url && mediaFile.image_url.includes('supabase.co/storage')) {
          try {
            // Extraer el path del archivo de la URL
            const urlParts = mediaFile.image_url.split('/storage/v1/object/public/personality-files/');
            if (urlParts.length > 1) {
              const filePath = urlParts[1];
              console.log(`🗑️ Eliminando archivo de storage: ${filePath}`);
              
              const { error: storageError } = await supabaseAdmin.storage
                .from('personality-files')
                .remove([filePath]);
              
              if (storageError) {
                console.warn(`⚠️ Error eliminando archivo de storage:`, storageError);
              } else {
                console.log(`✅ Archivo eliminado de storage: ${filePath}`);
              }
            }
          } catch (storageErr) {
            console.warn(`⚠️ Error procesando eliminación de storage:`, storageErr);
          }
        }
      }
      
      // Eliminar registros de la tabla media
      const { error: deleteMediaError } = await supabaseAdmin
        .from('media')
        .delete()
        .eq('personality_instruction_id', instructionId)
        .eq('users_id', userId);

      if (deleteMediaError) {
        console.error('Error eliminando archivos multimedia:', deleteMediaError);
        // Continuar con la eliminación de la instrucción aunque falle esto
      } else {
        console.log(`✅ ${mediaFiles.length} archivos multimedia eliminados`);
      }
    }

    // Eliminar la instrucción principal
    const { error: deleteError } = await supabaseAdmin
      .from('personality_instructions')
      .delete()
      .eq('id', instructionId)
      .eq('personality_id', personalityId)
      .eq('users_id', userId);

    if (deleteError) {
      console.error('Error eliminando instrucción:', deleteError);
      throw deleteError;
    }

    console.log(`✅ Instrucción ${instructionId} eliminada exitosamente`);

    return res.json({
      success: true,
      message: 'Instrucción eliminada exitosamente',
      deleted: instructionId,
      mediaFilesDeleted: mediaFiles ? mediaFiles.length : 0
    })
  } catch (error) {
    console.error('❌ Error al eliminar instrucción:', error)
    return res.status(500).json({
      success: false,
      message: 'Error interno al eliminar instrucción',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
}


// -----------------------------------------------------------------------------
// Probar el contexto de una personalidad con IA (Test Personality)
// POST /api/personalities/test-context
// -----------------------------------------------------------------------------
export const testPersonalityContext = async (req, res) => {
  try {
    const userId = getUserIdFromToken(req)
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuario no autenticado.' })
    }
    const { personalityId, message, conversationId, media } = req.body
    if (!personalityId) {
      return res.status(400).json({ success: false, message: 'Falta ID de personalidad' })
    }
    if (!message && !(Array.isArray(media) && media.length)) {
      return res.status(400).json({ success: false, message: 'Debes enviar texto o archivos' })
    }

    // Cargar la personalidad - MIGRADO: Usar API de Supabase
    const { data: fullPersonality, error: personalityError } = await supabaseAdmin
      .from('personalities')
      .select('*')
      .eq('id', personalityId)
      .eq('users_id', userId)
      .single();

    if (personalityError) {
      if (personalityError.code === 'PGRST116') {
        return res.status(404).json({ success: false, message: 'Personalidad no encontrada' });
      }
      console.error('Error al cargar personalidad:', personalityError);
      throw personalityError;
    }

    const t0b = Date.now();

    let conversation = null;
    
    if (conversationId) {
      // 1. Intentar buscar en la tabla nueva (conversations_new)
      try {
        // Validar si es UUID antes de consultar
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId);
        
        if (isUUID) {
          const { rows } = await pool.query(
            'SELECT * FROM conversations_new WHERE id=$1 AND user_id=$2',
            [conversationId, userId]
          );
          if (rows && rows.length > 0) {
            conversation = rows[0];
            console.log(`✅ Conversación encontrada en conversations_new: ${conversationId}`);
          }
        }
      } catch (e) {
        // Ignorar error si falla por tipo de dato (ej: uuid vs int)
      }

      // 2. Si no se encontró, intentar buscar en la tabla antigua (conversations)
      // Esto es crucial para IDs numéricos (legacy) y mantener el contexto
      if (!conversation) {
        try {
           const { rows } = await pool.query(
            'SELECT * FROM conversations WHERE id=$1 AND user_id=$2',
            [conversationId, userId]
          );
          if (rows && rows.length > 0) {
            conversation = rows[0];
            // Asegurar que el ID esté presente. Si la col 'id' no vino, usamos el que buscamos.
            if (!conversation.id) {
                conversation.id = conversationId;
            }
             console.log(`✅ Conversación encontrada en conversations (legacy): ${conversation.id}`);
          }
        } catch (e) {
           console.warn(`⚠️ No se pudo recuperar conversación legacy: ${e.message}`);
        }
      }
    }

    // Si aún no tenemos conversación, creamos una NUEVA
    if (!conversation || !conversation.id) {
      console.log('✨ No se encontró conversación previa. Creando NUEVA conversación para el usuario...');
      conversation = await createConversation(userId, personalityId, null, 'Test Chat', '');
      
      if (!conversation || !conversation.id) {
          throw new Error('Error crítico: No se pudo crear una nueva conversación válida.');
      }
    }

    // Determinar texto o marcador si solo hay archivos
    let finalText = message || '';

    // Si no hay mensaje y hay archivos, asignamos un texto según el tipo de archivo
    if (!finalText && media?.length) {
      for (const file of media) {
        if (file.type === 'pdf') {
          finalText = 'Analiza el pdf';
          break;
        } else if (file.type === 'image') {
          finalText = 'Analiza la imagen';
          break;
        } else if (file.type === 'audio') {
          finalText = 'Analiza el audio';
          break;
        }
      }
    }

    // 1) Guarda mensaje usuario
    const userMsgId = await saveMessage(userId, conversation.id, 'user', finalText)

    // Validación de longitud de texto
    if (message && message.length > 1000) {
      return res.status(400).json({
        success: false,
        message: 'El texto no puede superar los 1000 caracteres.'
      })
    }

    // 2) Procesa media y extrae texto en array
    const extractedTexts = []
    const MAX_TOTAL_SIZE = 10 * 1024 * 1024  // 10 MB

    if (Array.isArray(media) && media.length) {
      // 2.1) Calcular suma de bytes de todos los ficheros
      let totalBytes = 0
      for (const m of media) {
        let raw = m.data
        if (raw.startsWith('data:')) raw = raw.split(',')[1]
        totalBytes += Buffer.from(raw, 'base64').byteLength
      }
      // 2.2) Rechazar si supera el límite conjunto
      if (totalBytes > MAX_TOTAL_SIZE) {
        return res.status(400).json({
          success: false,
          message: `El tamaño total de los ficheros (${(totalBytes / 1024 / 1024).toFixed(2)} MB) supera el máximo de 10 MB.`
        })
      }

      // 2.3) Procesar cada imagen para extraer texto
      const ocrBlocks = await Promise.all(
        media.map(extractImageText) // devuelve texto o ""
      );
      
      const visionContext = ocrBlocks
        .filter(Boolean)
        .map((t, i) => `### Imagen ${i + 1}\n${t}`)
        .join("\n\n");

      // 2.4) Procesar media (guarda en tabla media y mensajes de sistema)
      await processMediaArray(media, conversation.id, userMsgId, 'chat', userId)

      // 2.5) Recuperar todos los textos extraídos de la tabla media
      const { rows: mediaRows } = await pool.query(
        `SELECT extracted_text
           FROM media
          WHERE message_id = $1
            AND users_id   = $2
          ORDER BY created_at ASC`,
        [userMsgId, userId]
      )

      // 2.6) Acumular y guardar cada uno como mensaje de sistema
      for (const { extracted_text: txt } of mediaRows) {
        if (txt && txt.trim()) {
          extractedTexts.push(txt.trim())
          await saveMessage(userId, conversation.id, 'system', txt.trim())
        }
      }

      // 2.7) Agregar el contexto de visión si existe
      if (visionContext) {
        extractedTexts.push(visionContext)
        await saveMessage(userId, conversation.id, 'system', visionContext)
      }
    }

    // 3) Obtener historial completo de mensajes del chat
    const historyDB = await getConversationHistory(conversation.id, userId)

    // 4) Preparar el history para la llamada a OpenAI
    const preamble = extractedTexts.length
      ? `Archivos adjuntos extraídos:\n${extractedTexts.join("\n\n")}`
      : null

    const historyForAI = [
      ...(preamble ? [{ role: 'system', content: preamble }] : []),
      ...historyDB
    ]

    // 5) Llamada a OpenAI
    const botResp = await generateBotResponse({
      personality: fullPersonality,
      userMessage: finalText,
      userId,
      history: historyForAI,
      time_response: (fullPersonality.time_response * 1000)
    })

    // 6) Procesar respuesta - puede ser string o objeto con archivos
    let botText = '';
    let filesToSend = [];
    
    if (typeof botResp === 'object' && botResp.hasFiles) {
      botText = botResp.text;
      filesToSend = botResp.files || [];
      console.log(`📎 Respuesta incluye ${filesToSend.length} archivos para enviar`);
    } else {
      botText = botResp;
    }

    // 6b) Guarda respuesta IA
    const t1b = Date.now()
    const elapsed = t1b - t0b
    await saveMessage(userId, conversation.id, 'ia', botText, elapsed)

    // 7) Procesar agendamiento automático si la IA confirma uno
    try {
      const { processAppointmentConfirmation } = await import('../services/appointmentProcessor.js');
      // Obtener el nombre del contacto desde la conversación
      const contactName = conversation?.contact_name || 'Test User';
      // Para test-context, no tenemos un número real, usar null
      const clientPhone = conversation?.external_id && conversation.external_id.includes('@') 
        ? conversation.external_id.split('@')[0] 
        : null;
      
      console.log(`📅 Procesando posible agendamiento desde test-context para: ${contactName}`);
      
      const appointmentResult = await processAppointmentConfirmation(
        botText,
        userId,
        clientPhone,
        contactName,
        historyForAI
      );
      
      if (appointmentResult && appointmentResult.success) {
        console.log(`✅ Agendamiento automático ejecutado desde test-context: ${appointmentResult.appointment?.appointmentId || appointmentResult.slotEventId}`);
        
        // Agregar información del agendamiento a la respuesta
        return res.json({
          success: true,
          conversationId: conversation.id,
          message: botText,
          files: filesToSend.length > 0 ? filesToSend : undefined,
          appointmentBooked: true,
          appointmentDetails: {
            appointmentId: appointmentResult.appointment?.appointmentId || appointmentResult.slotEventId,
            clientName: appointmentResult.clientName,
            date: appointmentResult.appointment?.start,
            location: appointmentResult.appointment?.location
          }
        });
      }
    } catch (appointmentError) {
      console.warn('⚠️ Error procesando agendamiento automático en test-context:', appointmentError.message);
      // No fallar la respuesta principal si el agendamiento falla
    }

    return res.json({
      success: true,
      conversationId: conversation.id,
      message: botText,
      files: filesToSend.length > 0 ? filesToSend : undefined
    })
  } catch (err) {
    console.error('Error en testPersonalityContext:', err)
    return res.status(500).json({ success: false, message: 'Error al obtener respuesta de IA.' })
  }
}

export const testPersonalityContextPublic = async (req, res) => {
  try {
    // 1) Obtenemos userId desde la config del proyecto
    const config = req.body.config
    if (!config) {
      return res.status(404).json({ success: false, message: 'Configuración de proyecto no encontrada.' })
    }
    const userId = config.user_id
    const { rows } = await pool.query(
      'SELECT * FROM personalities WHERE id = $1 ',
      [config.personality_id]
    );
    const fullPersonality = rows[0];
    console.log("datos personalidad"+fullPersonality)

    // 2) Extraemos datos de la petición
    const { personalityId, message, conversationId, media } = req.body
    if (!personalityId) {
      return res.status(400).json({ success: false, message: 'Falta ID de personalidad' })
    }
    if (!message && !(Array.isArray(media) && media.length)) {
      return res.status(400).json({ success: false, message: 'Debes enviar texto o archivos' })
    }

    // 3) Obtener o crear conversación
    let conversation
    if (conversationId) {
      const { rows } = await pool.query(
        'SELECT * FROM conversations_new WHERE external_id = $1 AND user_id = $2',
        [conversationId, userId]
      )
      conversation = rows[0]
    }
    if (!conversation) {
      conversation = await createConversation(
        userId,
        personalityId,
        null,
        'Test Chat público',
        ''
      )
    }

    // 4) Determinar finalText
    let finalText = message || ''
    if (!finalText && Array.isArray(media) && media.length) {
      for (const file of media) {
        if (file.type === 'pdf')      { finalText = 'Analiza el PDF'; break }
        else if (file.type === 'image'){ finalText = 'Analiza la imagen'; break }
        else if (file.type === 'audio'){ finalText = 'Analiza el audio'; break }
      }
    }

    // 5) Guardar mensaje del usuario
    const userMsgId = await saveMessage(userId, conversation.id, 'user', finalText)

    // 6) Validar longitud de message
    if (message && message.length > 1000) {
      return res.status(400).json({
        success: false,
        message: 'El texto no puede superar los 1000 caracteres.'
      })
    }

    // 7) Procesar media y extraer textos
    const extractedTexts = []
    if (Array.isArray(media) && media.length) {
      const MAX_TOTAL_SIZE = 10 * 1024 * 1024
      let totalBytes = 0
      for (const m of media) {
        let raw = m.data.startsWith('data:') ? m.data.split(',')[1] : m.data
        totalBytes += Buffer.from(raw, 'base64').byteLength
      }
      if (totalBytes > MAX_TOTAL_SIZE) {
        return res.status(400).json({
          success: false,
          message: `El tamaño total de los archivos (${(totalBytes/1024/1024).toFixed(2)} MB) supera 10 MB.`
        })
      }

      await processMediaArray(media, conversation.id, userMsgId, 'chat', userId)

      const { rows: mediaRows } = await pool.query(
        `SELECT extracted_text
           FROM media
          WHERE message_id = $1
            AND users_id   = $2
          ORDER BY created_at ASC`,
        [userMsgId, userId]
      )
      for (const { extracted_text: txt } of mediaRows) {
        if (txt?.trim()) {
          extractedTexts.push(txt.trim())
          await saveMessage(userId, conversation.id, 'system', txt.trim())
        }
      }
    }

    // 3) Obtener historial completo de mensajes del chat con memoria extendida
    console.log(`🧠 OBTENIENDO HISTORIAL COMPLETO para entrenamiento público con memoria extendida...`);
    const historyDB = await getConversationHistory(conversation.id, userId, 50); // Límite de 50 mensajes para contexto completo

    console.log(`✅ Historial obtenido para entrenamiento público: ${historyDB.length} mensajes con contexto completo`);
    
    // Verificar si hay contenido multimedia en el historial
    const hasMultimedia = historyDB.some(msg => 
      msg.message_type !== 'text' || 
      (msg.content && msg.content.includes('Contenido de imagen:'))
    );
    
    if (hasMultimedia) {
      console.log(`📱 Historial incluye contenido multimedia - Contexto enriquecido`);
    }

    // 9) Construir contexto para IA
    const preamble = extractedTexts.length
      ? `Archivos adjuntos:\n${extractedTexts.join('\n\n')}`
      : null
    const historyForAI = [
      ...(preamble ? [{ role: 'system', content: preamble }] : []),
      ...historyDB
    ]

    // 10) Llamada a OpenAI
    const botReply = await generateBotResponse({
      personality:fullPersonality ,     // tu objeto config ya incluye los datos de la personalidad
      userMessage: finalText,
      userId,
      history: historyForAI
    })

    // 11) Guardar respuesta IA
    await saveMessage(userId, conversation.id, 'ia', botReply)
    // 12) Responder
    return res.json({
      success: true,
      conversationId: conversation.external_id || conversation.id,
      message: botReply
    })
  } catch (err) {
    console.error('Error en testPersonalityContextPublic:', err)
    return res.status(500).json({ success: false, message: 'Error interno al procesar IA.' })
  }
}


// -----------------------------------------------------------------------------
// Obtener datos de personalidad por ID
// GET /api/personalities/getbyid/:id
// -----------------------------------------------------------------------------
export const getPersonalityById = async (req, res) => {
  try {
    const userId = getUserIdFromToken(req)
    const personalityId = req.params.id

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuario no autenticado' })
    }
    if (!personalityId) {
      return res.status(400).json({ success: false, message: 'Falta el ID de la personalidad' })
    }

    // MIGRADO: Usar API de Supabase en lugar de pool.query
    const { data, error } = await supabaseAdmin
      .from('personalities')
      .select('*')
      .eq('id', personalityId)
      .eq('users_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ success: false, message: 'Personalidad no encontrada' })
      }
      console.error('Error al obtener personalidad desde Supabase:', error);
      throw error;
    }

    console.log(`✅ Personalidad cargada: ${data.nombre} (ID: ${personalityId})`);
    return res.json({ success: true, personality: data })
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error al obtener personalidad:', error.message)
      return res.status(500).json({ success: false, message: 'Error al obtener personalidad' })
    }
    console.error('Error desconocido:', error)
    return res.status(500).json({ success: false, message: 'Error desconocido' })
  }
}

// -----------------------------------------------------------------------------
// Obtener el saludo por ID
// GET /api/personalities/:id/saludo
// -----------------------------------------------------------------------------
export const getSaludoById = async (req, res) => {
  try {
    const userId = getUserIdFromToken(req)
    const personalityId = req.params.id

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuario no autenticado' })
    }
    const saludo = await getSaludoFromDB(personalityId, userId)
    return res.json({ success: true, saludo })
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error al obtener el saludo:', error.message)
      return res.status(500).json({ success: false, message: error.message })
    }
    console.error('Error desconocido:', error)
    return res.status(500).json({ success: false, message: 'Error desconocido' })
  }
}

// -----------------------------------------------------------------------------
// Asignar personalidad a la conversación
// POST /api/personalities/set_conversation_personality
// -----------------------------------------------------------------------------
export const setConversationPersonality = async (req, res) => {
  try {
    const userId = getUserIdFromToken(req)
    const { conversationId, personalityId } = req.body

    if (!conversationId || !personalityId) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos (conversationId y personalityId)',
      })
    }

    await pool.query(
      `UPDATE conversations_new
         SET personality_id = $1
       WHERE external_id = $2
         AND user_id    = $3`,
      [personalityId, conversationId, userId]
    )

    io.to(userId).emit('conversation-personality-set', {
      conversationId,
      personalityId,
    })

    return res.json({ success: true })
  } catch (error) {
    console.error('Error en setConversationPersonality:', error)
    return res
      .status(500)
      .json({ success: false, message: 'Error asignando personalidad a la conversación' })
  }
}

// -----------------------------------------------------------------------------
// PERSONALIDAD GLOBAL (user_settings)
// -----------------------------------------------------------------------------
export async function setGlobalPersonality(req, res) {
  const userId = getUserIdFromToken(req)
  if (!userId) {
    return res.status(401).json({ success: false, message: 'No autenticado' })
  }
  const { personalityId, aiActive } = req.body

  try {
    // Actualizar la configuración
    await pool.query(
      `
      INSERT INTO user_settings (user_id, default_personality_id, ai_global_active, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id) DO UPDATE
        SET default_personality_id = EXCLUDED.default_personality_id,
            ai_global_active       = EXCLUDED.ai_global_active,
            updated_at             = NOW()
    `,
      [userId, personalityId, aiActive]
    )

    // Obtener los datos actualizados para devolverlos al frontend
    const { rows } = await pool.query(
      `
      SELECT default_personality_id AS "personalityId",
             ai_global_active       AS "aiActive",
             updated_at             AS "updatedAt"
        FROM user_settings
       WHERE user_id = $1
    `,
      [userId]
    )

    const settings = rows[0] || { personalityId, aiActive, updatedAt: new Date().toISOString() }

    return res.json({
      success: true,
      message: 'Configuración global actualizada correctamente',
      settings: {
        personalityId: settings.personalityId,
        aiActive: settings.aiActive,
        updatedAt: settings.updatedAt
      }
    })
  } catch (error) {
    console.error('Error en setGlobalPersonality:', error)
    return res.status(500).json({
      success: false,
      message: 'Error interno al guardar configuración global',
    })
  }
}

export async function getGlobalPersonality(req, res) {
  const userId = getUserIdFromToken(req)
  if (!userId) {
    return res.status(401).json({ success: false, message: 'No autenticado' })
  }
  try {
    const { rows } = await pool.query(
      `
      SELECT default_personality_id AS "personalityId",
             ai_global_active       AS "aiActive"
        FROM user_settings
       WHERE user_id = $1
    `,
      [userId]
    )

    if (rows.length === 0) {
      return res.json({ success: true, personalityId: null, aiActive: false })
    }
    return res.json({ success: true, ...rows[0] })
  } catch (error) {
    console.error('Error en getGlobalPersonality:', error)
    return res.status(500).json({
      success: false,
      message: 'Error interno al leer configuración global',
    })
  }
}
export const transcribeAudio = async (req, res) => {
  try {
    if (!req.file) {
      console.log('No se ha recibido el archivo'); // Agregado para verificar
      return res.status(400).json({ error: 'No se ha enviado ningún archivo de audio.' });
    }


    // Llamamos a la función de transcripción
    const transcription = await transcribeAudioBuffer(req.file.buffer);

    res.json({ transcription });
  } catch (error) {
    console.error('Error al transcribir el audio:', error);
    res.status(500).json({ error: 'No pude transcribir el audio. Intenta nuevamente más tarde.' });
  }
};

// Endpoint de depuración específico para el problema de tipos
export const debugUserIdType = async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    
    console.log('🔬 DEBUG: Análisis completo del userId');
    
    // 1. Verificar el userId extraído del token
    const userIdAnalysis = {
      value: userId,
      type: typeof userId,
      length: userId?.length,
      isString: typeof userId === 'string',
      isUUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId),
      isNumeric: !isNaN(userId),
      parsed: {
        asString: String(userId),
        asNumber: Number(userId)
      }
    };
    
    console.log('👤 UserID Analysis:', userIdAnalysis);
    
    // 2. Probar consulta simple a personalities
    let personalitiesTest = { success: false, error: null };
    try {
      const { data, error } = await supabaseAdmin
        .from('personalities')
        .select('id, users_id')
        .eq('users_id', userId)
        .limit(1);
      
      if (error) {
        personalitiesTest.error = {
          code: error.code,
          message: error.message,
          hint: error.hint,
          details: error.details
        };
      } else {
        personalitiesTest.success = true;
        personalitiesTest.data = data;
      }
    } catch (e) {
      personalitiesTest.error = { message: e.message };
    }
    
    console.log('🎭 Personalities Query Test:', personalitiesTest);
    
    // 3. Probar consulta a user_settings
    let userSettingsTest = { success: false, error: null };
    try {
      const { data, error } = await supabaseAdmin
        .from('user_settings')
        .select('*')
        .eq('users_id', userId)
        .limit(1);
      
      if (error) {
        userSettingsTest.error = {
          code: error.code,
          message: error.message,
          hint: error.hint,
          details: error.details
        };
      } else {
        userSettingsTest.success = true;
        userSettingsTest.data = data;
      }
    } catch (e) {
      userSettingsTest.error = { message: e.message };
    }
    
    console.log('⚙️ User Settings Query Test:', userSettingsTest);
    
    // 4. Probar inserción simple sin datos reales
    let insertTest = { success: false, error: null };
    try {
      const { data, error } = await supabaseAdmin
        .from('personalities')
        .insert({
          users_id: userId,
          nombre: 'TEST_PERSONALITY_DEBUG',
          empresa: 'TEST',
          sitio_web: '',
          posicion: '',
          instrucciones: 'TEST DEBUG',
          saludo: 'TEST',
          category: 'formal',
          avatar_url: null,
          time_response: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) {
        insertTest.error = {
          code: error.code,
          message: error.message,
          hint: error.hint,
          details: error.details
        };
      } else {
        insertTest.success = true;
        insertTest.data = data;
        
        // Eliminar el registro de prueba inmediatamente
        await supabaseAdmin
          .from('personalities')
          .delete()
          .eq('id', data.id);
      }
    } catch (e) {
      insertTest.error = { message: e.message };
    }
    
    console.log('💾 Insert Test Result:', insertTest);
    
    const diagnosticResult = {
      userId: userIdAnalysis,
      tests: {
        personalitiesQuery: personalitiesTest,
        userSettingsQuery: userSettingsTest,
        insertTest: insertTest
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        supabaseUrl: process.env.SUPABASE_URL ? 'Set' : 'Not set',
        supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Not set'
      }
    };
    
    return res.json({
      success: true,
      message: 'Diagnóstico completado',
      diagnostic: diagnosticResult
    });
    
  } catch (error) {
    console.error('❌ Error en debugUserIdType:', error);
    return res.status(500).json({
      success: false,
      message: 'Error en diagnóstico',
      error: error.message
    });
  }
};

// -----------------------------------------------------------------------------
// Funciones para soporte de URLs de video
// -----------------------------------------------------------------------------

/**
 * Valida si una URL de video es soportada
 * POST /api/personalities/validate-video-url
 * Body: { url: string }
 */
export const validateVideoUrl = async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'URL requerida'
      });
    }

    const videoInfo = detectVideoUrl(url);
    
    if (videoInfo.isValid) {
      // Verificar disponibilidad del servicio
      const ytDlpAvailable = await checkYtDlpAvailability();
      
      return res.json({
        success: true,
        valid: true,
        platform: videoInfo.platform,
        videoId: videoInfo.videoId,
        serviceAvailable: ytDlpAvailable,
        message: ytDlpAvailable 
          ? `URL de ${videoInfo.platform} válida y lista para procesar`
          : `URL de ${videoInfo.platform} válida pero servicio no disponible`
      });
    } else {
      return res.json({
        success: true,
        valid: false,
        message: 'URL no es de una plataforma soportada',
        supportedPlatforms: ['YouTube', 'Instagram Reels', 'TikTok'],
        examples: [
          'https://www.youtube.com/watch?v=VIDEO_ID',
          'https://youtu.be/VIDEO_ID',
          'https://www.instagram.com/reel/REEL_ID/',
          'https://www.tiktok.com/@user/video/VIDEO_ID'
        ]
      });
    }

  } catch (error) {
    console.error('❌ Error validando URL de video:', error);
    return res.status(500).json({
      success: false,
      message: 'Error validando URL de video',
      error: error.message
    });
  }
};

/**
 * Obtiene información de una URL de video sin descargarla
 * POST /api/personalities/video-info
 * Body: { url: string }
 */
export const getVideoInfo = async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'URL requerida'
      });
    }

    const videoInfo = detectVideoUrl(url);
    const serviceAvailable = await checkYtDlpAvailability();
    
    return res.json({
      success: true,
      videoInfo,
      serviceStatus: {
        available: serviceAvailable,
        message: serviceAvailable ? 'Servicio disponible' : 'yt-dlp no está instalado'
      }
    });

  } catch (error) {
    console.error('❌ Error obteniendo info de video:', error);
    return res.status(500).json({
      success: false,
      message: 'Error obteniendo información del video',
      error: error.message
    });
  }
};

// -----------------------------------------------------------------------------
// Export default con TODAS las funciones
// -----------------------------------------------------------------------------
export default {
  transcribeAudio,
  getAllPersonalities,
  createPersonality,
  editPersonality,
  deletePersonalityById,
  sendInstruction,
  testPersonalityContext,
  testPersonalityContextPublic,
  getPersonalityById,
  getSaludoById,
  setConversationPersonality,
  getPersonalityInstructions,  // Importante para openaiService / whatsappController
  setGlobalPersonality,
  getGlobalPersonality,
  deletePersonalityInstruction,
  updatePersonalityInstruction,
  reprocessPersonalityInstructions,
  systemDiagnostic,
  debugUserIdType,
  // Nuevas funciones para URLs de video
  validateVideoUrl,
  getVideoInfo
};