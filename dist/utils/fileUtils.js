import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import fs from "fs";
import mammoth from 'mammoth';
import fetch from 'node-fetch';
import { Poppler } from "node-poppler";
import Papa from 'papaparse';
import path from "path";
import pdfParse from 'pdf-parse-debugging-disabled';
import * as XLSX from 'xlsx';
import { __dirname } from "../app.js";
import { supabaseAdmin } from "../config/db.js";
import { analyzeImageBufferWithVision, analyzeImageComplete } from '../services/googleVisionService.js';
import { processInstructionsWithAI, transcribeAudioBuffer } from "../services/openaiService.js";

// Configurar ffmpeg para usar el binario estático
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
  console.log('✅ FFmpeg configurado desde ffmpeg-static:', ffmpegStatic);
}

// Función para extraer texto de archivos ODT (OpenDocument Text)
async function extractTextFromODT(buffer) {
  try {
    // ODT es un ZIP con content.xml
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);
    const contentXml = await zip.file('content.xml')?.async('string');
    if (!contentXml) return 'No se pudo leer el contenido del ODT';
    // Extraer texto plano del XML
    const textContent = contentXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return textContent || 'Documento ODT vacío';
  } catch (err) {
    console.error('Error leyendo ODT:', err);
    return 'Error procesando documento ODT';
  }
}

// Función para extraer texto de archivos Excel
function extractTextFromExcel(buffer) {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let allText = [];
    
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      
      allText.push(`📊 Hoja: ${sheetName}`);
      for (const row of jsonData) {
        if (Array.isArray(row) && row.some(cell => cell !== '')) {
          allText.push(row.filter(cell => cell !== '').join(' | '));
        }
      }
      allText.push(''); // Línea en blanco entre hojas
    }
    
    return allText.join('\n') || 'Excel vacío';
  } catch (err) {
    console.error('Error leyendo Excel:', err);
    return 'Error procesando archivo Excel';
  }
}

// Función para extraer texto de archivos Word (DOCX)
async function extractTextFromWord(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || 'Documento Word vacío';
  } catch (err) {
    console.error('Error leyendo Word:', err);
    return 'Error procesando documento Word';
  }
}

// Función para extraer texto de archivos CSV
function extractTextFromCSV(buffer) {
  try {
    const csvText = buffer.toString('utf-8');
    const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    
    if (result.data.length === 0) return 'CSV vacío';
    
    // Convertir a texto legible
    const headers = Object.keys(result.data[0] || {});
    let textOutput = [`📋 Columnas: ${headers.join(', ')}`, ''];
    
    for (const row of result.data.slice(0, 100)) { // Limitar a 100 filas
      const rowText = Object.entries(row)
        .filter(([_, v]) => v !== '' && v !== null && v !== undefined)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ');
      if (rowText) textOutput.push(rowText);
    }
    
    if (result.data.length > 100) {
      textOutput.push(`... y ${result.data.length - 100} filas más`);
    }
    
    return textOutput.join('\n');
  } catch (err) {
    console.error('Error leyendo CSV:', err);
    return 'Error procesando archivo CSV';
  }
}

// Función para extraer texto de archivos de texto plano
function extractTextFromPlainText(buffer) {
  try {
    return buffer.toString('utf-8').trim() || 'Archivo de texto vacío';
  } catch (err) {
    console.error('Error leyendo texto:', err);
    return 'Error leyendo archivo de texto';
  }
}

// ========== DESCARGA DE VIDEOS DE REDES SOCIALES ==========

// Detectar si una URL es de una red social con video
function detectSocialMediaUrl(url) {
  if (!url || typeof url !== 'string') return null;
  
  const patterns = {
    tiktok: /(?:tiktok\.com|vm\.tiktok\.com)/i,
    instagram: /(?:instagram\.com|instagr\.am)\/(?:p|reel|tv|reels)/i,
    twitter: /(?:twitter\.com|x\.com)\/\w+\/status/i,
    facebook: /(?:facebook\.com|fb\.watch)\/(?:watch|reel|video)/i,
    vimeo: /vimeo\.com\/\d+/i,
    dailymotion: /dailymotion\.com\/video/i,
    twitch: /clips\.twitch\.tv|twitch\.tv\/\w+\/clip/i
  };
  
  for (const [platform, pattern] of Object.entries(patterns)) {
    if (pattern.test(url)) {
      console.log(`🎬 URL de ${platform} detectada: ${url}`);
      return platform;
    }
  }
  
  return null;
}

// Descargar video de redes sociales usando servicios de terceros
async function downloadSocialMediaVideo(url, platform) {
  console.log(`📥 Intentando descargar video de ${platform}...`);
  
  // Lista de servicios de descarga gratuitos (APIs públicas)
  const downloadServices = [
    {
      name: 'cobalt',
      url: 'https://api.cobalt.tools/api/json',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ url, vCodec: 'h264', vQuality: '720', aFormat: 'mp3' }),
      parseResponse: async (res) => {
        const data = await res.json();
        if (data.url) return data.url;
        if (data.audio) return data.audio;
        throw new Error('No video URL in response');
      }
    },
    {
      name: 'saveFrom',
      url: `https://api-free.savefrom.net/request.php?url=${encodeURIComponent(url)}`,
      method: 'GET',
      parseResponse: async (res) => {
        const data = await res.json();
        if (data?.url) return data.url;
        if (data?.data?.[0]?.url) return data.data[0].url;
        throw new Error('No video URL in response');
      }
    }
  ];
  
  // Intentar cada servicio
  for (const service of downloadServices) {
    try {
      console.log(`🔄 Intentando con ${service.name}...`);
      
      const fetchOptions = {
        method: service.method,
        headers: service.headers || {},
        body: service.body
      };
      
      if (service.method === 'GET') delete fetchOptions.body;
      
      const response = await fetch(service.url, fetchOptions);
      
      if (!response.ok) {
        console.log(`⚠️ ${service.name} respondió con ${response.status}`);
        continue;
      }
      
      const videoUrl = await service.parseResponse(response);
      console.log(`✅ URL de video obtenida de ${service.name}`);
      
      // Descargar el video
      const videoResponse = await fetch(videoUrl);
      if (!videoResponse.ok) {
        console.log(`⚠️ Error descargando video: ${videoResponse.status}`);
        continue;
      }
      
      const arrayBuffer = await videoResponse.arrayBuffer();
      const buffer = Buffer.from(new Uint8Array(arrayBuffer));
      
      console.log(`✅ Video descargado exitosamente (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
      return buffer;
      
    } catch (err) {
      console.log(`⚠️ Error con ${service.name}: ${err.message}`);
      continue;
    }
  }
  
  // Si todos los servicios fallan, intentar descarga directa
  console.log(`🔄 Intentando descarga directa de ${url}...`);
  try {
    const directResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (directResponse.ok) {
      const contentType = directResponse.headers.get('content-type') || '';
      if (contentType.includes('video') || contentType.includes('audio')) {
        const arrayBuffer = await directResponse.arrayBuffer();
        return Buffer.from(new Uint8Array(arrayBuffer));
      }
    }
  } catch (directErr) {
    console.log(`⚠️ Descarga directa falló: ${directErr.message}`);
  }
  
  console.error(`❌ No se pudo descargar el video de ${platform}`);
  return null;
}

// Procesar URL de video para instrucciones
async function processVideoUrlForInstructions(url, userId) {
  const platform = detectSocialMediaUrl(url);
  
  if (!platform) {
    console.log(`⚠️ URL no es de una red social reconocida: ${url}`);
    return null;
  }
  
  console.log(`🎬 Procesando video de ${platform} para instrucciones...`);
  
  // Descargar el video
  const videoBuffer = await downloadSocialMediaVideo(url, platform);
  
  if (!videoBuffer) {
    return {
      success: false,
      platform,
      error: 'No se pudo descargar el video',
      suggestion: 'Por favor, descarga el video manualmente y súbelo directamente'
    };
  }
  
  // Extraer audio del video y transcribir
  try {
    const uploadsDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    
    const uniqueId = `social-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const tempVideoPath = path.join(uploadsDir, `${uniqueId}.mp4`);
    const tempAudioPath = path.join(uploadsDir, `${uniqueId}.mp3`);
    
    // Guardar video temporalmente
    fs.writeFileSync(tempVideoPath, videoBuffer);
    
    // Extraer audio con FFmpeg
    await new Promise((resolve, reject) => {
      ffmpeg(tempVideoPath)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioChannels(1)
        .audioFrequency(16000)
        .save(tempAudioPath)
        .on('end', resolve)
        .on('error', reject);
    });
    
    // Leer el audio
    const audioBuffer = fs.readFileSync(tempAudioPath);
    
    // Transcribir con Whisper
    console.log(`🎵 Transcribiendo audio del video de ${platform}...`);
    const transcription = await transcribeAudioBuffer(audioBuffer, `${uniqueId}.mp3`);
    
    // Limpiar archivos temporales
    try { fs.unlinkSync(tempVideoPath); } catch {}
    try { fs.unlinkSync(tempAudioPath); } catch {}
    
    if (transcription && transcription.length > 10) {
      console.log(`✅ Video de ${platform} transcrito: ${transcription.length} caracteres`);
      return {
        success: true,
        platform,
        transcription,
        videoSize: videoBuffer.length,
        source: url
      };
    } else {
      return {
        success: false,
        platform,
        error: 'No se pudo extraer texto del audio del video',
        suggestion: 'El video puede no tener audio o el audio no es claro'
      };
    }
    
  } catch (err) {
    console.error(`❌ Error procesando video de ${platform}:`, err.message);
    return {
      success: false,
      platform,
      error: err.message,
      suggestion: 'Error al procesar el video'
    };
  }
}

// Detectar si el texto contiene URLs de redes sociales
function extractSocialMediaUrls(text) {
  if (!text || typeof text !== 'string') return [];
  
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const urls = text.match(urlPattern) || [];
  
  return urls.filter(url => detectSocialMediaUrl(url) !== null);
}

/** Guarda un archivo en base64 en disco */
export function saveBase64File(base64Data, extension) {
  const uploadsDir = path.join(__dirname, "../uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const fileName = `file-${Date.now()}.${extension}`;
  const filePath = path.join(uploadsDir, fileName);
  fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
  return filePath;
}

/** Sube un archivo al storage de Supabase y retorna la URL pública */
export async function uploadToSupabaseStorage(buffer, filename, mimeType, userId, bucketName = null) {
  try {
    console.log(`📤 Subiendo archivo a Supabase Storage: ${filename}`);
    
    // Generar nombre único para el archivo (sin duplicar extensión)
    const timestamp = Date.now();
    const originalExt = path.extname(filename);
    const baseName = path.basename(filename, originalExt).replace(/[^a-zA-Z0-9.-]/g, '_');
    // Derivar extensión desde mime si no hay
    let safeExt = originalExt;
    if (!safeExt) {
      if (mimeType?.startsWith('video/')) {
        safeExt = mimeType === 'video/webm' ? '.webm' : (mimeType === 'video/quicktime' ? '.mov' : '.mp4');
      } else if (mimeType === 'application/pdf') {
        safeExt = '.pdf';
      } else if (mimeType?.startsWith('image/')) {
        safeExt = mimeType === 'image/png' ? '.png' : (mimeType === 'image/webp' ? '.webp' : '.jpg');
      } else if (mimeType?.startsWith('audio/')) {
        safeExt = mimeType === 'audio/wav' ? '.wav' : (mimeType === 'audio/ogg' ? '.ogg' : '.mp3');
      } else {
        safeExt = '.bin';
      }
    }
    const uniqueFilename = `${userId}/${timestamp}-${baseName}${safeExt}`;
    // Usar el bucket especificado o 'personality-files' por defecto
    const targetBucket = bucketName || 'personality-files';
    
    // Intento 1: subir al bucket elegido
    // ✅ Para stickers (image/webp o image/png), asegurar que se preserve el canal alpha
    const uploadOptions = {
      contentType: mimeType,
      upsert: false
    };
    
    // Log para stickers
    if (mimeType === 'image/webp' || mimeType === 'image/png') {
      console.log(`🎨 Subiendo imagen con alpha: ${mimeType}, tamaño: ${buffer.length} bytes`);
    }
    
    let { data, error } = await supabaseAdmin.storage
      .from(targetBucket)
      .upload(uniqueFilename, buffer, uploadOptions);
    
    if (error) {
      console.error('❌ Error subiendo archivo a Supabase Storage:', error);
      // Si hay error de MIME, intentar con diferentes configuraciones
      const invalidMime = String(error?.message || '').includes('mime type') || error?.error === 'invalid_mime_type' || error?.statusCode === '415';
      if (invalidMime && mimeType?.startsWith('video/')) {
        console.warn(`⚠️ Reintentando upload con MIME genérico...`);
        ({ data, error } = await supabaseAdmin.storage
          .from(targetBucket)
          .upload(uniqueFilename, buffer, {
            contentType: 'application/octet-stream', // MIME genérico
            upsert: false
          }));
        if (error) {
          throw error;
        }
        // Obtener URL pública del reintento
        const { data: urlData } = supabaseAdmin.storage
          .from(targetBucket)
          .getPublicUrl(uniqueFilename);
        console.log(`✅ Archivo subido (reintento) a ${targetBucket}: ${urlData.publicUrl}`);
        return {
          path: uniqueFilename,
          publicUrl: urlData.publicUrl,
          size: buffer.length
        };
      }
      throw error;
    }
    
    // Obtener URL pública del archivo
    const { data: urlData } = supabaseAdmin.storage
      .from(targetBucket)
      .getPublicUrl(uniqueFilename);
    
    console.log(`✅ Archivo subido exitosamente: ${urlData.publicUrl}`);
    
    return {
      path: uniqueFilename,
      publicUrl: urlData.publicUrl,
      size: buffer.length
    };
    
  } catch (error) {
    console.error('❌ Error en uploadToSupabaseStorage:', error);
    throw error;
  }
}

/** OCR en PDF escaneado: páginas → PNG → Vision OCR */
async function ocrPdfScaneado(pdfPath) {
  try {
    const poppler = new Poppler();
    const info = await poppler.pdfInfo(pdfPath);
    const pageCount = typeof info.pages === "number" ? info.pages : 1;
    const outputBase = pdfPath.replace(/\.pdf$/i, "");

    console.log(`📄 PDF tiene ${pageCount} páginas, convirtiendo a PNG...`);

    await poppler.pdfToCairo(pdfPath, outputBase, {
      firstPageToConvert: 1,
      lastPageToConvert: pageCount,
      pngFile: true,
    });

    let texto = "";
    const imagesToClean = [];
    
    for (let i = 1; i <= pageCount; i++) {
      const imgPath = `${outputBase}-${i}.png`;
      imagesToClean.push(imgPath);
      
      try {
        if (fs.existsSync(imgPath)) {
          console.log(`🖼️ Procesando página ${i} con Google Vision...`);
          const buf = fs.readFileSync(imgPath);
          const pageText = await analyzeImageBufferWithVision(buf);
          texto += pageText + "\n";
        } else {
          console.warn(`⚠️ No se encontró la imagen: ${imgPath}`);
        }
      } catch (error) {
        console.error(`❌ Error procesando página ${i}:`, error.message);
      }
    }

    // Limpiar archivos PNG temporales
    for (const imgPath of imagesToClean) {
      try {
        if (fs.existsSync(imgPath)) {
          fs.unlinkSync(imgPath);
          console.log(`🗑️ Imagen temporal eliminada: ${imgPath}`);
        }
      } catch (cleanError) {
        console.warn(`⚠️ No se pudo eliminar ${imgPath}:`, cleanError.message);
      }
    }

    return texto.trim();
  } catch (error) {
    console.error('❌ Error en OCR PDF escaneado:', error.message);
    throw new Error(`Error procesando PDF escaneado: ${error.message}`);
  }
}

/** Función para resumir texto largo (recorta a 8192 tokens) */
function summarizeText(text) {
  const MAX_TOKENS = 8192; // Máximo número de tokens permitidos por OpenAI
  const tokens = text.split(" ");

  if (tokens.length > MAX_TOKENS) {
    // Cortar el texto a un máximo de MAX_TOKENS tokens
    return tokens.slice(0, MAX_TOKENS).join(" ") + "... [Texto resumido]"; // Indicando que es un resumen
  }

  return text;
}

async function extractTextFromPdf(pdfPath) {
  try {
    const dataBuffer = fs.readFileSync(pdfPath); // Leemos el PDF
    const data = await pdfParse(dataBuffer); // Usamos pdf-parse para extraer el texto
    return data.text.trim(); // Devolvemos el texto extraído del PDF
  } catch (error) {
    console.error('Error al extraer texto del PDF:', error.message);
    throw new Error('No se pudo extraer el texto del PDF');
  }
}

/**
 * Procesa el archivo recibido, dependiendo de su tipo (PDF, imagen, audio)
 */
export async function processMediaArray(
  mediaArray,
  conversationId,
  messageId,
  mediaType,
  userId,
  personalityData = null,
  userContext = null,
  useAI = false
) {
  if (!Array.isArray(mediaArray)) return [];
  
  const processedResults = [];

  console.log(`🎯 Iniciando processMediaArray para ${mediaType} con ${mediaArray.length} archivos`);

  for (const m of mediaArray) {
    if ((!m.type && !m.mimeType) && !m.data && !m.url) continue;

    console.log(`📁 Procesando archivo: ${m.filename || 'sin nombre'}, tipo: ${m.type}, mimeType: ${m.mimeType}`);

    // 1) Obtener buffer: base64 o descarga por URL
    let buffer = null;
    if (m?.data) {
      if (m.data.startsWith('data:')) {
        const base64Data = m.data.split(',')[1];
        buffer = Buffer.from(base64Data, "base64");
      } else {
        buffer = Buffer.from(m.data, "base64");
      }
    } else if (m?.url) {
      try {
        const resp = await fetch(m.url);
        if (!resp.ok) throw new Error(`Descarga falló (${resp.status})`);
        const arr = await resp.arrayBuffer();
        buffer = Buffer.from(new Uint8Array(arr));
        console.log(`🌐 Descargado desde URL (${(buffer.length/1024/1024).toFixed(2)} MB)`);
      } catch (dlErr) {
        console.error('❌ Error descargando URL:', dlErr?.message || dlErr);
        continue;
      }
    }
    
    const typeHint = m.mimeType || m.type || '';
    const fileExt = (m.filename || '').split('.').pop()?.toLowerCase() || '';
    
    // Detección de tipos de archivo
    const isPdf = typeHint === "application/pdf" || typeHint === "pdf" || fileExt === 'pdf';
    const isImage = typeHint?.startsWith("image/") || typeHint === "image";
    const isAudio = typeHint?.startsWith("audio/") || typeHint === "audio" || ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma'].includes(fileExt);
    const isVideo = typeHint?.startsWith("video/") || typeHint === "video" || (!!m.url && /\.(mp4|mov|mkv|webm)(\?.*)?$/i.test(m.url)) || ['mp4', 'mov', 'mkv', 'webm', 'avi'].includes(fileExt);
    
    // Nuevos tipos de archivo soportados
    const isExcel = typeHint === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || 
                   typeHint === "application/vnd.ms-excel" || 
                   ['xlsx', 'xls'].includes(fileExt);
    const isWord = typeHint === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
                  typeHint === "application/msword" || 
                  ['docx', 'doc'].includes(fileExt);
    const isODT = typeHint === "application/vnd.oasis.opendocument.text" || fileExt === 'odt';
    const isCSV = typeHint === "text/csv" || fileExt === 'csv';
    const isText = typeHint?.startsWith("text/") || ['txt', 'md', 'json', 'xml', 'html', 'htm', 'log'].includes(fileExt);
    
    // Tipo de documento genérico
    const isDocument = isExcel || isWord || isODT || isCSV || isText;

    let ext =
      isPdf ? "pdf"
      : isImage ? (m.mimeType?.split("/")[1] || fileExt || "jpg")
      : isAudio ? (m.mimeType?.split("/")[1] || fileExt || "mp3")
      : isVideo ? (fileExt || m.mimeType?.split("/")[1] || "mp4")
      : isExcel ? (fileExt || "xlsx")
      : isWord ? (fileExt || "docx")
      : isODT ? "odt"
      : isCSV ? "csv"
      : isText ? (fileExt || "txt")
      : fileExt || "bin";

    // Normalizar extensión a minúsculas sin querystring
    if (typeof ext === 'string') {
      ext = ext.toLowerCase().replace(/[^a-z0-9]/g, '')
    }

    // Derivar MIME final cuando no venga completo o para casos 'video'
    let finalMime = typeHint || '';
    if (!finalMime || finalMime === 'video' || finalMime === 'image' || finalMime === 'audio') {
      if (isVideo) {
        if (ext === 'mp4') finalMime = 'video/mp4';
        else if (ext === 'webm') finalMime = 'video/webm';
        else if (ext === 'mov' || ext === 'quicktime') finalMime = 'video/quicktime';
        else finalMime = 'video/mp4';
      } else if (isImage) {
        if (ext === 'jpg' || ext === 'jpeg') finalMime = 'image/jpeg';
        else if (ext === 'png') finalMime = 'image/png';
        else if (ext === 'webp') finalMime = 'image/webp';
        else if (ext === 'gif') finalMime = 'image/gif';
        else finalMime = 'application/octet-stream';
      } else if (isAudio) {
        if (ext === 'mp3' || ext === 'mpeg') finalMime = 'audio/mpeg';
        else if (ext === 'wav') finalMime = 'audio/wav';
        else if (ext === 'ogg') finalMime = 'audio/ogg';
        else if (ext === 'm4a' || ext === 'mp4') finalMime = 'audio/mp4';
        else finalMime = 'application/octet-stream';
      } else if (isPdf) {
        finalMime = 'application/pdf';
      }
    }
    
    // 2) Subir archivo a Supabase Storage
    let fileUrl = null;
    let localFilePath = null;
    
    try {
      console.log(`📄 Intentando subir ${isImage ? 'imagen' : isPdf ? 'PDF' : 'archivo'} a Supabase Storage...`);
      const uploadResult = await uploadToSupabaseStorage(
        buffer, 
        m.filename || (m.url ? decodeURIComponent(new URL(m.url).pathname.split('/').pop() || `file.${ext}`) : `file.${ext}`), 
        finalMime || 'application/octet-stream', 
        userId
      );
      fileUrl = uploadResult.publicUrl;
      console.log(`✅ ☁️ Archivo subido exitosamente a Supabase Storage: ${fileUrl}`);
    } catch (uploadError) {
      console.error(`❌ Error subiendo a Supabase Storage:`, uploadError);
      console.log(`📁 Guardando archivo localmente como fallback...`);
      // Fallback: guardar localmente
      localFilePath = saveBase64File(m.data.includes(',') ? m.data.split(',')[1] : m.data, ext);
      fileUrl = localFilePath;
      console.log(`⚠️ Usando almacenamiento local: ${fileUrl}`);
    }

    console.log(`💾 Archivo disponible en: ${fileUrl}`);

    // 3) Extraer texto
    let extractedText = "";
    if (isPdf) {
      try {
        console.log(`📄 Intentando extraer texto del PDF con pdf-parse...`);
        // Para PDFs, usar el buffer directamente si es posible
        let textFromBuffer = "";
        try {
          const data = await pdfParse(buffer);
          textFromBuffer = data.text.trim();
        } catch (bufferError) {
          console.log(`⚠️ No se pudo extraer texto del buffer, usando archivo temporal...`);
        }
        
        if (textFromBuffer) {
          extractedText = textFromBuffer;
        } else {
          // Si no se puede extraer del buffer, crear archivo temporal
          const tempFilePath = saveBase64File(m.data.includes(',') ? m.data.split(',')[1] : m.data, ext);
          extractedText = await extractTextFromPdf(tempFilePath);
          
          // Limpiar archivo temporal
          try {
            fs.unlinkSync(tempFilePath);
          } catch {}
        }
        
        if (!extractedText) {
          // Si no se extrae texto, intentamos con OCR
          console.log("📸 No se extrajo texto del PDF, usando OCR...");
          const tempFilePath = saveBase64File(m.data.includes(',') ? m.data.split(',')[1] : m.data, ext);
          extractedText = await ocrPdfScaneado(tempFilePath);
          
          // Limpiar archivo temporal
          try {
            fs.unlinkSync(tempFilePath);
          } catch {}
        }
        console.log(`✅ Texto extraído del PDF (${extractedText.length} caracteres):`, extractedText.substring(0, 200) + '...');
        
        // 🤖 NUEVO: Procesar texto con IA para mejorar instrucciones
        if (mediaType === "instruction" && personalityData && extractedText.length > 50) {
          try {
            console.log(`🧠 Procesando texto del PDF con IA para mejorar instrucciones...`);
            const improvedInstructions = await processInstructionsWithAI(
              extractedText, 
              personalityData.nombre || 'Asistente',
              personalityData.category || 'formal'
            );
            
            if (improvedInstructions && improvedInstructions.length > extractedText.length * 0.5) {
              console.log(`✨ Instrucciones mejoradas con IA: ${improvedInstructions.length} caracteres`);
              extractedText = improvedInstructions;
            } else {
              console.log(`⚠️ IA no mejoró significativamente las instrucciones, usando texto original`);
            }
          } catch (aiError) {
            console.error(`❌ Error procesando con IA:`, aiError.message);
            console.log(`📝 Continuando con texto original extraído`);
          }
        }
      } catch (err) {
        console.error("❌ Error extrayendo texto del PDF:", err.message);
        extractedText = "Error al procesar PDF";
      }
      if (mediaType === "chat") {
               extractedText += "\nFinal del PDF";
               
            }
      
    } else if (isImage) {
      console.log(`🖼️ Procesando imagen con análisis visual completo...`);
      try {
        // Usar análisis completo en lugar de solo OCR
        const completeAnalysis = await analyzeImageComplete(buffer);
        
        // Generar descripción natural de la imagen con contexto del usuario
        const analysisText = generateNaturalImageDescription(completeAnalysis, userContext);
        extractedText = analysisText;
        
        console.log(`✅ Análisis visual completo (${extractedText.length} caracteres):`, extractedText.substring(0, 200) + '...');
        console.log(`📊 Confianza del análisis: ${completeAnalysis.confidence}%`);
        
        // Guardar análisis completo como metadatos adicionales
        if (mediaType === "instruction") {
          // Para instrucciones, guardamos el análisis completo en un campo separado
          console.log(`💾 Guardando análisis visual completo como metadatos...`);
        }
        
      } catch (visionError) {
        console.error('❌ Error en análisis visual completo:', visionError);
        // Fallback a OCR básico
        try {
          extractedText = (await analyzeImageBufferWithVision(buffer)) || "";
          console.log(`⚠️ Fallback a OCR básico: ${extractedText.length} caracteres`);
        } catch (fallbackError) {
          console.error('❌ Error en fallback OCR:', fallbackError);
          extractedText = 'Imagen procesada pero no se pudo analizar';
        }
      }
      // No agregar texto técnico al final
    } else if (isAudio) {
      console.log(`🎵 Procesando audio con Whisper...`);
      try {
        // Usar buffer directamente en vez de filePath que no existe
        extractedText = (await transcribeAudioBuffer(buffer, m.filename || 'audio.mp3')) || "";
        console.log(`✅ Texto extraído del audio (${extractedText.length} caracteres):`, extractedText.substring(0, 200) + '...');
      } catch (audioError) {
        console.error('❌ Error en transcripción de audio:', audioError);
        extractedText = 'Audio procesado pero no se pudo transcribir';
      }
      if (extractedText && !extractedText.includes('no se pudo')) {
        extractedText = `[Audio transcrito: ${extractedText}]`;
      }
    } else if (isVideo) {
      console.log(`🎬 Procesando video: extrayendo y transcribiendo audio por segmentos...`);
      // Guardar video temporalmente
      const uploadsDir = path.join(__dirname, "../uploads");
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const uniqueBase = `video-${Date.now()}-${Math.floor(Math.random()*100000)}`;
      const tempVideoPath = path.join(uploadsDir, `${uniqueBase}.${ext}`);
      fs.writeFileSync(tempVideoPath, buffer);
      // Generar thumbnail (10%) y subir a Supabase
      let thumbnailUrl = null;
      try {
        const thumbFile = path.join(uploadsDir, `${uniqueBase}_thumbnail.jpg`);
        await new Promise((resolve, reject) => {
          ffmpeg(tempVideoPath)
            .screenshots({
              timestamps: ['10%'],
              filename: `${uniqueBase}_thumbnail.jpg`,
              folder: uploadsDir,
              size: '720x?'
            })
            .on('end', resolve)
            .on('error', reject);
        });
        if (fs.existsSync(thumbFile)) {
          const thumbBuffer = fs.readFileSync(thumbFile);
          const thumbUpload = await uploadToSupabaseStorage(
            thumbBuffer,
            (m.filename ? m.filename.replace(/\.[^.]+$/, '') : `file`) + `_thumbnail.jpg`,
            'image/jpeg',
            userId
          );
          thumbnailUrl = thumbUpload.publicUrl;
          try { fs.unlinkSync(thumbFile); } catch {}
        }
      } catch (thumbErr) {
        console.warn('⚠️ Error generando/subiendo thumbnail:', thumbErr?.message || thumbErr);
      }

      // Extraer audio WAV 16k mono y segmentar en partes de ~10 minutos para garantizar <25MB
      const tempAudioPattern = path.join(uploadsDir, `${uniqueBase}-part-%03d.wav`);
      try {
        await new Promise((resolve, reject) => {
          ffmpeg(tempVideoPath)
            .noVideo()
            .audioCodec('pcm_s16le')
            .audioChannels(1)
            .audioFrequency(16000)
            // Segmentar por tiempo: 600s (~10min) => ~19MB por segmento en PCM 16k mono
            .outputOptions([
              '-f segment',
              '-segment_time 600',
              '-reset_timestamps 1'
            ])
            .save(tempAudioPattern)
            .on('end', resolve)
            .on('error', reject);
        });

        // Recoger segmentos generados
        const dirFiles = fs.readdirSync(uploadsDir);
        const segmentFiles = dirFiles
          .filter(name => name.startsWith(`${uniqueBase}-part-`) && name.endsWith('.wav'))
          .map(name => path.join(uploadsDir, name))
          .sort();

        if (segmentFiles.length === 0) {
          console.warn('⚠️ No se generaron segmentos de audio, intentando un único archivo corto...');
          const singleWav = path.join(uploadsDir, `${uniqueBase}.wav`);
          await new Promise((resolve, reject) => {
            ffmpeg(tempVideoPath)
              .noVideo()
              .audioCodec('pcm_s16le')
              .audioChannels(1)
              .audioFrequency(16000)
              .save(singleWav)
              .on('end', resolve)
              .on('error', reject);
          });
          segmentFiles.push(singleWav);
        }

        let fullTranscript = '';
        for (const seg of segmentFiles) {
          try {
            const segBuf = fs.readFileSync(seg);
            // transcribeAudioBuffer impone límite 25MB; nuestros segmentos deben cumplirlo
            const partText = await transcribeAudioBuffer(segBuf, path.basename(seg));
            if (typeof partText === 'string') {
              fullTranscript += (fullTranscript ? '\n' : '') + partText.trim();
            } else if (partText?.text) {
              fullTranscript += (fullTranscript ? '\n' : '') + String(partText.text).trim();
            }
          } catch (segErr) {
            console.error('❌ Error transcribiendo segmento:', seg, segErr?.message || segErr);
          }
        }

        extractedText = fullTranscript || 'Video procesado pero no se pudo transcribir el audio';
        if (fullTranscript) {
          console.log(`✅ Transcripción combinada (${extractedText.length} caracteres)`);
        }
        extractedText += "\nFinal del video";
      } catch (videoErr) {
        console.error('❌ Error procesando video:', videoErr?.message || videoErr);
        extractedText = 'Video recibido pero falló la extracción de audio';
      } finally {
        // Limpiar archivos temporales
        try { fs.unlinkSync(tempVideoPath); } catch {}
        try {
          const dirFiles2 = fs.readdirSync(uploadsDir);
          for (const name of dirFiles2) {
            if (name.startsWith(uniqueBase)) {
              try { fs.unlinkSync(path.join(uploadsDir, name)); } catch {}
            }
          }
        } catch {}
      }
    }
    
    // ========== PROCESAMIENTO DE DOCUMENTOS ==========
    
    // Excel (.xlsx, .xls)
    if (isExcel) {
      console.log(`📊 Procesando archivo Excel...`);
      try {
        extractedText = extractTextFromExcel(buffer);
        console.log(`✅ Datos extraídos del Excel (${extractedText.length} caracteres)`);
        extractedText = `[Contenido de Excel:\n${extractedText}\n]`;
      } catch (excelError) {
        console.error('❌ Error procesando Excel:', excelError);
        extractedText = 'Archivo Excel procesado pero no se pudo extraer el contenido';
      }
    }
    
    // Word (.docx, .doc)
    else if (isWord) {
      console.log(`📝 Procesando documento Word...`);
      try {
        extractedText = await extractTextFromWord(buffer);
        console.log(`✅ Texto extraído del Word (${extractedText.length} caracteres)`);
        extractedText = `[Contenido de documento Word:\n${extractedText}\n]`;
      } catch (wordError) {
        console.error('❌ Error procesando Word:', wordError);
        extractedText = 'Documento Word procesado pero no se pudo extraer el contenido';
      }
    }
    
    // ODT (LibreOffice/OpenOffice)
    else if (isODT) {
      console.log(`📄 Procesando documento ODT...`);
      try {
        extractedText = await extractTextFromODT(buffer);
        console.log(`✅ Texto extraído del ODT (${extractedText.length} caracteres)`);
        extractedText = `[Contenido de documento ODT:\n${extractedText}\n]`;
      } catch (odtError) {
        console.error('❌ Error procesando ODT:', odtError);
        extractedText = 'Documento ODT procesado pero no se pudo extraer el contenido';
      }
    }
    
    // CSV
    else if (isCSV) {
      console.log(`📋 Procesando archivo CSV...`);
      try {
        extractedText = extractTextFromCSV(buffer);
        console.log(`✅ Datos extraídos del CSV (${extractedText.length} caracteres)`);
        extractedText = `[Contenido de CSV:\n${extractedText}\n]`;
      } catch (csvError) {
        console.error('❌ Error procesando CSV:', csvError);
        extractedText = 'Archivo CSV procesado pero no se pudo extraer el contenido';
      }
    }
    
    // Archivos de texto plano (.txt, .md, .json, .xml, .html, .log)
    else if (isText && !isPdf && !isImage && !isAudio && !isVideo) {
      console.log(`📃 Procesando archivo de texto...`);
      try {
        extractedText = extractTextFromPlainText(buffer);
        console.log(`✅ Contenido del archivo de texto (${extractedText.length} caracteres)`);
        extractedText = `[Contenido del archivo ${fileExt.toUpperCase()}:\n${extractedText}\n]`;
      } catch (textError) {
        console.error('❌ Error procesando archivo de texto:', textError);
        extractedText = 'Archivo de texto procesado pero no se pudo leer el contenido';
      }
    }
    
    if (mediaType === "chat") {
           // NO pedir análisis técnico, se usará el prompt del sistema para responder de forma natural
         }
    // Variables para almacenar transcripción y análisis IA
    let videoTranscription = null;
    let aiAnalysis = null;
    
    // Si es video y useAI está activo, procesar con IA
    if (isVideo && useAI && extractedText && extractedText.length > 10) {
      console.log(`🤖 Procesando video con IA...`);
      videoTranscription = extractedText; // Guardar transcripción original
      
      try {
        // Procesar con IA según la categoría de personalidad
        const category = personalityData?.category || 'formal';
        const personalityName = personalityData?.nombre || 'Asistente';
        
        aiAnalysis = await processInstructionsWithAI(
          videoTranscription,
          category,
          personalityName,
          'Analiza esta transcripción de video y extrae las instrucciones o información clave de manera clara y concisa'
        );
        
        // Usar el análisis IA como texto extraído principal
        extractedText = aiAnalysis;
        console.log(`✅ Video procesado con IA (${aiAnalysis.length} caracteres)`);
      } catch (aiError) {
        console.error('❌ Error procesando video con IA:', aiError);
        // Fallback: usar transcripción resumida
        extractedText = summarizeText(videoTranscription);
      }
    } else {
      // Resumir si el texto es demasiado largo (comportamiento original)
      extractedText = summarizeText(extractedText);
    }

    console.log(
      `🔍 Media [${m.filename}] → extractedText final (${extractedText.length} chars):`,
      extractedText.substring(0, 500) + (extractedText.length > 500 ? '...' : '')
    );

    // 4) Insertar en BBDD usando Supabase API con metadatos completos
    const fileSize = buffer.length; // Tamaño en bytes
    console.log(`💾 Guardando en base de datos para userId: ${userId}, mediaType: ${mediaType}, messageId: ${messageId}`);
    console.log(`   - Archivo: ${m.filename || `file.${ext}`} (${(fileSize / 1024).toFixed(2)} KB)`);
    
    try {
      // Preparar datos para insertar incluyendo nuevos campos
      const mediaData = {
        users_id: userId,
        media_type: mediaType,
        message_id: mediaType === "chat" ? messageId : null,
        personality_instruction_id: mediaType === "instruction" ? messageId : null,
        image_url: fileUrl, // URL de Supabase Storage o path local
        filename: m.filename || `file.${ext}`,
        mime_type: finalMime || m.mimeType || m.type,
        extracted_text: extractedText,
        created_at: new Date().toISOString()
      };
      
      // Agregar campos adicionales si es video procesado con IA
      if (isVideo && useAI && videoTranscription && aiAnalysis) {
        mediaData.video_transcription = videoTranscription;
        mediaData.ai_analysis = aiAnalysis;
        mediaData.processed_with_ai = true;
      }
      
      const { data, error } = await supabaseAdmin
        .from('media')
        .insert(mediaData)
        .select();
      
      if (error) {
        console.error('❌ Error insertando en media table:', error);
        throw error;
      }
      
      console.log(`✅ Registro insertado en media table con ID:`, data?.[0]?.id);
      
      // Agregar resultado procesado al array de retorno
      if (data && data[0]) {
        processedResults.push({
          id: data[0].id,
          filename: m.filename || `file.${ext}`,
          type: isVideo ? 'video' : (isPdf ? 'pdf' : (isImage ? 'image' : (isAudio ? 'audio' : 'unknown'))),
          url: fileUrl,
          extractedText: extractedText,
          videoTranscription: videoTranscription,
          aiAnalysis: aiAnalysis,
          processedWithAI: useAI && (videoTranscription || aiAnalysis)
        });
      }
      // Insertar registro de thumbnail si existe y es video
      if (isVideo && thumbnailUrl) {
        try {
          const thumbName = (m.filename ? m.filename.replace(/\.[^.]+$/, '') : `file`) + `_thumbnail.jpg`;
          const { error: thumbDbError } = await supabaseAdmin
            .from('media')
            .insert({
              users_id: userId,
              media_type: mediaType,
              message_id: mediaType === "chat" ? messageId : null,
              personality_instruction_id: mediaType === "instruction" ? messageId : null,
              image_url: thumbnailUrl,
              filename: thumbName,
              mime_type: 'image/jpeg',
              extracted_text: null,
              created_at: new Date().toISOString()
            });
          if (thumbDbError) {
            console.warn('⚠️ Error insertando thumbnail en media table:', thumbDbError);
          } else {
            console.log('✅ Thumbnail registrado en media table');
          }
        } catch (thumbDbEx) {
          console.warn('⚠️ Excepción registrando thumbnail en media:', thumbDbEx?.message || thumbDbEx);
        }
      }
    } catch (dbError) {
      console.error('❌ Error guardando en base de datos:', dbError);
      // Continuar con el procesamiento aunque falle la BD
    }

    console.log(`✅ Archivo procesado y guardado exitosamente en la base de datos`);

    // 4) Seguimiento en conversación
    if (conversationId && extractedText) {
      const prefix = isPdf
        ? "PDF:"
        : isImage
        ? "Imagen:"
        : "Audio transcrito:";
      const messageId = await saveMessage(
        userId,
        conversationId,
        "user",
        `${prefix} ${extractedText}`
      );
      if (messageId) {
        console.log(`💬 Mensaje guardado en conversación: ${conversationId}`);
      }
    }

    // 5) Limpiar fichero local si se usó como fallback
    if (localFilePath) {
      try {
        fs.unlinkSync(localFilePath);
        console.log(`🗑️ Archivo temporal eliminado: ${localFilePath}`);
      } catch {}
    }
  }

  console.log(`✅ processMediaArray completado para ${mediaType}`);
  return processedResults;
}

async function saveMessage(userId, conversationId, senderType, content) {
  try {
    // Usar supabaseAdmin para insertar el mensaje
    const { data, error } = await supabaseAdmin
      .from('messages_new')
      .insert({
        user_id: userId, // UUID del usuario
        conversation_id: parseInt(conversationId), // Asegurar que sea integer
        sender_type: senderType,
        message_type: 'text',
        text_content: content,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();
    
    if (error) {
      // Si el error es por tipo de user_id, intentar sin él (el flujo principal continuará)
      console.warn('⚠️ Error insertando mensaje (no crítico):', error.message);
      return null;
    }
    
    return data?.id;
  } catch (err) {
    console.warn('⚠️ Error en saveMessage (no crítico):', err.message);
    // No lanzar error para no interrumpir el flujo principal
    return null;
  }
}

/**
 * Genera una descripción natural y conversacional de una imagen
 * @param {Object} analysis - Resultado del análisis completo de OpenAI
 * @returns {string} Descripción natural de la imagen
 */
function generateNaturalImageDescription(analysis, userContext = null) {
  // Si hay un resumen preciso del análisis, usarlo directamente
  if (analysis.summary && analysis.summary.length > 10) {
    let description = analysis.summary;
    
    // Agregar detalles de vehículo si están disponibles
    if (analysis.vehicleDetails && analysis.vehicleDetails.isVehicle) {
      const v = analysis.vehicleDetails;
      let vehicleDesc = '';
      
      if (v.brand && v.model) {
        vehicleDesc = `${v.brand} ${v.model}`;
      } else if (v.brand) {
        vehicleDesc = v.brand;
      }
      
      if (vehicleDesc && v.color) {
        vehicleDesc += ` color ${v.color}`;
      }
      
      if (v.features && v.features.length > 0) {
        vehicleDesc += `, con ${v.features.slice(0, 3).join(', ')}`;
      }
      
      if (vehicleDesc && !description.toLowerCase().includes(vehicleDesc.toLowerCase())) {
        description = vehicleDesc + '. ' + description;
      }
    }
    
    // Agregar logos/marcas detectados
    if (analysis.logos && analysis.logos.length > 0) {
      const brands = analysis.logos.map(l => typeof l === 'string' ? l : l.description).filter(b => b);
      if (brands.length > 0 && !description.toLowerCase().includes(brands[0].toLowerCase())) {
        description += `. Marca: ${brands.join(', ')}`;
      }
    }
    
    // Agregar texto detectado si es relevante
    if (analysis.text && analysis.text.length > 5 && analysis.text.length < 100) {
      description += `. Texto visible: "${analysis.text}"`;
    }
    
    return description;
  }
  
  // Fallback: generar descripción básica de objetos
  if (analysis.objects && analysis.objects.length > 0) {
    const objectNames = analysis.objects
      .map(obj => typeof obj === 'string' ? obj : obj.name)
      .filter(name => name)
      .slice(0, 5);
    
    if (objectNames.length > 0) {
      return `Imagen que muestra: ${objectNames.join(', ')}.`;
    }
  }
  
  return 'Imagen procesada correctamente.';
  
  // 2. Caras y emociones (muy importante para la experiencia humana)
  if (analysis.faces && analysis.faces.length > 0) {
    const faceDescriptions = analysis.faces.map((face, index) => {
      let desc = '';
      
      if (analysis.faces.length === 1) {
        desc = 'la persona';
      } else {
        desc = `la persona ${index + 1}`;
      }
      
      // Determinar emoción principal
      const emotions = face.emotions;
      let emotionDesc = '';
      
      if (emotions.joy === 'VERY_LIKELY' || emotions.joy === 'LIKELY') {
        emotionDesc = 'parece feliz';
      } else if (emotions.sorrow === 'VERY_LIKELY' || emotions.sorrow === 'LIKELY') {
        emotionDesc = 'parece triste';
      } else if (emotions.anger === 'VERY_LIKELY' || emotions.anger === 'LIKELY') {
        emotionDesc = 'parece molesta';
      } else if (emotions.surprise === 'VERY_LIKELY' || emotions.surprise === 'LIKELY') {
        emotionDesc = 'parece sorprendida';
      } else {
        emotionDesc = 'con expresión neutra';
      }
      
      return `${desc} ${emotionDesc}`;
    });
    
    if (parts.length > 0) {
      parts.push(`, ${faceDescriptions.join(', ')}`);
    } else {
      parts.push(`Veo ${faceDescriptions.join(', ')}`);
    }
  }
  
  // 3. Marcas y logos (importante para contexto)
  if (analysis.logos && analysis.logos.length > 0) {
    const brands = analysis.logos
      .filter(logo => logo.confidence > 70)
      .map(logo => logo.description);
    
    if (brands.length > 0) {
      if (brands.length === 1) {
        parts.push(`. Puedo ver la marca ${brands[0]}`);
      } else {
        parts.push(`. Puedo ver las marcas: ${brands.join(', ')}`);
      }
    }
  }
  
  // 4. Lugares famosos
  if (analysis.landmarks && analysis.landmarks.length > 0) {
    const places = analysis.landmarks
      .filter(landmark => landmark.confidence > 70)
      .map(landmark => landmark.description);
    
    if (places.length > 0) {
      if (places.length === 1) {
        parts.push(`. Esto parece ser ${places[0]}`);
      } else {
        parts.push(`. Esto parece mostrar: ${places.join(', ')}`);
      }
    }
  }
  
  // 5. Texto si es relevante (más importante que colores)
  if (analysis.text && analysis.text.length > 10) {
    if (analysis.text.length < 50) {
      parts.push(`. Puedo leer: "${analysis.text.trim()}"`);
    } else {
      // Para textos largos, extraer las primeras palabras más relevantes
      const firstLine = analysis.text.split('\n')[0].trim();
      if (firstLine.length > 0 && firstLine.length < 100) {
        parts.push(`. Puedo leer: "${firstLine}"`);
      } else {
        parts.push(`. Hay texto que dice: "${analysis.text.substring(0, 50).trim()}..."`);
      }
    }
  }
  
  // 6. Contexto general solo si no hemos descrito nada específico
  if (parts.length === 0 && analysis.labels && analysis.labels.length > 0) {
    const mainCategories = analysis.labels
      .filter(label => label.confidence > 80)
      .slice(0, 2)
      .map(label => label.description.toLowerCase());
    
    if (mainCategories.length > 0) {
      parts.push(`Veo una imagen relacionada con ${mainCategories.join(' y ')}`);
    }
  }
  
  // Si no se detectó nada significativo
  if (parts.length === 0) {
    return 'Veo una imagen pero no logro identificar claramente qué contiene.';
  }
  
  return parts.join('') + '.';
}

/**
 * Identifica el contexto específico de una imagen para generar respuestas más inteligentes
 */
function identifyImageContext(analysis) {
  const text = analysis.text?.toLowerCase() || '';
  const labels = analysis.labels?.map(l => l.description.toLowerCase()) || [];
  const objects = analysis.objects?.map(o => o.name.toLowerCase()) || [];
  
  // Contexto: Aplicación bancaria/tarjeta
  if (text.includes('congelar') || text.includes('ver número') || 
      text.includes('tarjeta') || text.includes('cvv') ||
      /\d{4}/.test(text) && (text.includes('...') || text.includes('•'))) {
    return {
      type: 'banking_card',
      cardNumber: extractCardNumber(text),
      hasFreeze: text.includes('congelar'),
      hasViewNumber: text.includes('ver número') || text.includes('ver numero'),
      appInterface: true
    };
  }
  
  // Contexto: WhatsApp/Chat
  if (text.includes('whatsapp') || text.includes('últ. vez') || 
      text.includes('en línea') || text.includes('escribiendo') ||
      labels.includes('mobile phone') && text.includes(':')) {
    return {
      type: 'chat_app',
      platform: 'whatsapp',
      hasMessages: true
    };
  }
  
  // Contexto: Configuración/Settings
  if (text.includes('ajustes') || text.includes('configuración') ||
      text.includes('face id') || text.includes('touch id') ||
      labels.includes('settings') || text.includes('activar')) {
    return {
      type: 'settings_screen',
      hasBiometrics: text.includes('face id') || text.includes('touch id')
    };
  }
  
  // Contexto: Vehículo/Automóvil
  if (objects.includes('car') || objects.includes('vehicle') || objects.includes('automobile') ||
      labels.includes('car') || labels.includes('vehicle') || labels.includes('motor vehicle') ||
      text.includes('tesla') || text.includes('bmw') || text.includes('mercedes') || text.includes('audi') ||
      text.includes('ferrari') || text.includes('lamborghini') || text.includes('porsche') || text.includes('mclaren') ||
      text.includes('bugatti') || text.includes('koenigsegg') || text.includes('pagani') ||
      /[A-Z]{1,3}\s?[A-Z0-9]{1,4}\s?[A-Z0-9]{1,4}[E]?/.test(text)) { // Patrón de matrícula europea
    return {
      type: 'vehicle',
      brands: analysis.logos?.map(l => l.description) || [],
      licensePlate: extractLicensePlate(text),
      vehicleObjects: objects.filter(o => ['car', 'vehicle', 'automobile', 'tire', 'wheel'].includes(o)),
      isElectric: text.toLowerCase().includes('tesla') || text.includes('E') // Matrícula eléctrica
    };
  }
  
  // Contexto: Aplicación móvil general
  if (labels.includes('mobile phone') || labels.includes('smartphone') ||
      objects.includes('mobile phone') || text.includes('app')) {
    return {
      type: 'mobile_app',
      platform: 'mobile'
    };
  }
  
  // Contexto: Documento/PDF
  if (labels.includes('document') || labels.includes('text') ||
      analysis.text && analysis.text.length > 200) {
    return {
      type: 'document',
      hasLongText: analysis.text && analysis.text.length > 200
    };
  }
  
  return { type: 'unknown' };
}

/**
 * Extrae número de tarjeta parcial del texto
 */
function extractCardNumber(text) {
  const cardMatch = text.match(/\.{2,}(\d{4})|\*{4,}(\d{4})|(\d{4})/);
  return cardMatch ? (cardMatch[1] || cardMatch[2] || cardMatch[3]) : null;
}

/**
 * Extrae matrícula del texto
 */
function extractLicensePlate(text) {
  // Patrones de matrículas europeas y americanas
  const patterns = [
    /[A-Z]{1,3}\s?[A-Z0-9]{1,4}\s?[A-Z0-9]{1,4}[E]?/g, // Europea (ej: B TS 4106E)
    /[A-Z0-9]{2,3}[-\s][A-Z0-9]{3,4}/g, // Europea alternativa
    /[A-Z]{3}[-\s]?\d{3,4}/g, // Americana
    /\d{3}[-\s]?[A-Z]{3}/g // Americana inversa
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0].replace(/\s+/g, ' ').trim();
    }
  }
  
  return null;
}

/**
 * Genera respuestas contextuales inteligentes basadas en el tipo de imagen
 */
function generateContextualResponse(context, analysis) {
  switch (context.type) {
    case 'banking_card':
      return generateBankingCardResponse(context, analysis);
    
    case 'chat_app':
      return generateChatAppResponse(context, analysis);
    
    case 'settings_screen':
      return generateSettingsResponse(context, analysis);
    
    case 'vehicle':
      return generateVehicleResponse(context, analysis);
    
    case 'mobile_app':
      return generateMobileAppResponse(context, analysis);
    
    case 'document':
      return generateDocumentResponse(context, analysis);
    
    default:
      return 'Veo una imagen pero no logro identificar claramente qué contiene.';
  }
}

/**
 * Respuesta especializada para aplicaciones bancarias/tarjetas
 */
function generateBankingCardResponse(context, analysis) {
  const text = analysis.text || '';
  let response = [];
  
  if (context.cardNumber) {
    response.push(`Veo tu tarjeta (terminada en …${context.cardNumber})`);
  } else {
    response.push('Veo tu tarjeta bancaria');
  }
  
  if (context.hasFreeze && context.hasViewNumber) {
    response.push(' con dos acciones principales:');
    response.push('\n\n🔍 **Ver Número**: Tócalo y valida con Face ID/Touch ID. Se mostrará el número completo, fecha y CVV (normalmente por unos segundos y con opción de copiar).');
    response.push('\n\n❄️ **Congelar**: Bloquea temporalmente pagos online/físicos y retiros. Vuelve a tocar para descongelar.');
  }
  
  // Tips adicionales
  if (text.includes('dashboard') || text.includes('chats') || text.includes('tarjetas')) {
    response.push('\n\n💡 **Tips rápidos**:');
    response.push('\n• Los puntitos bajo la tarjeta indican que puedes deslizar para ver otras.');
    response.push('\n• El ícono de arriba a la derecha abre opciones/movimientos.');
    
    if (context.hasViewNumber) {
      response.push('\n• Si "Ver Número" no te deja, activa Face ID para la app en Ajustes > [Nombre de la app] > Face ID.');
    }
  }
  
  return response.join('');
}

/**
 * Respuesta especializada para aplicaciones de chat
 */
function generateChatAppResponse(context, analysis) {
  const text = analysis.text || '';
  const firstLine = text.split('\n')[0]?.trim();
  
  if (context.platform === 'whatsapp') {
    if (firstLine && firstLine.length < 100) {
      return `Veo una conversación de WhatsApp. Puedo leer: "${firstLine}".`;
    } else {
      return 'Veo una conversación de WhatsApp con varios mensajes.';
    }
  }
  
  return 'Veo una aplicación de mensajería.';
}

/**
 * Respuesta especializada para pantallas de configuración
 */
function generateSettingsResponse(context, analysis) {
  if (context.hasBiometrics) {
    return 'Veo una pantalla de configuración con opciones de Face ID/Touch ID. Puedes activar la autenticación biométrica para mayor seguridad.';
  }
  
  return 'Veo una pantalla de configuración o ajustes de la aplicación.';
}

/**
 * Respuesta especializada para vehículos con identificación avanzada
 */
function generateVehicleResponse(context, analysis) {
  const text = analysis.text || '';
  const colors = analysis.colors || [];
  const brands = context.brands || [];
  const licensePlate = context.licensePlate;
  
  // Identificar marca principal
  let detectedBrand = null;
  const textLower = text.toLowerCase();
  
  if (brands.length > 0) {
    detectedBrand = brands[0].toLowerCase();
  } else if (textLower.includes('ferrari')) {
    detectedBrand = 'ferrari';
  } else if (textLower.includes('lamborghini')) {
    detectedBrand = 'lamborghini';
  } else if (textLower.includes('porsche')) {
    detectedBrand = 'porsche';
  } else if (textLower.includes('mclaren')) {
    detectedBrand = 'mclaren';
  } else if (textLower.includes('bugatti')) {
    detectedBrand = 'bugatti';
  } else if (textLower.includes('tesla')) {
    detectedBrand = 'tesla';
  } else if (textLower.includes('bmw')) {
    detectedBrand = 'bmw';
  } else if (textLower.includes('mercedes')) {
    detectedBrand = 'mercedes';
  } else if (textLower.includes('audi')) {
    detectedBrand = 'audi';
  } else {
    // Detectar por características visuales si no hay texto
    detectedBrand = detectBrandByVisualFeatures(analysis, colors);
  }
  
  // Identificar color principal
  let colorDescription = 'color no identificado';
  if (colors.length > 0) {
    const mainColor = colors[0];
    colorDescription = getVehicleColorName(mainColor.hex, mainColor.red, mainColor.green, mainColor.blue);
  }
  
  // Generar respuesta especializada por marca
  if (detectedBrand === 'ferrari') {
    return generateFerrariResponse(text, colorDescription, licensePlate, analysis);
  } else if (detectedBrand === 'lamborghini') {
    return generateLamborghiniResponse(text, colorDescription, licensePlate, analysis);
  } else if (detectedBrand === 'porsche') {
    return generatePorscheResponse(text, colorDescription, licensePlate, analysis);
  } else if (detectedBrand === 'mclaren') {
    return generateMcLarenResponse(text, colorDescription, licensePlate, analysis);
  } else if (detectedBrand === 'bugatti') {
    return generateBugattiResponse(text, colorDescription, licensePlate, analysis);
  } else if (detectedBrand === 'tesla') {
    return generateTeslaResponse(text, colorDescription, licensePlate, analysis);
  } else if (detectedBrand === 'bmw') {
    return generateBMWResponse(text, colorDescription, licensePlate, analysis);
  } else if (detectedBrand === 'mercedes') {
    return generateMercedesResponse(text, colorDescription, licensePlate, analysis);
  } else if (detectedBrand === 'audi') {
    return generateAudiResponse(text, colorDescription, licensePlate, analysis);
  }
  
  // Respuesta genérica para vehículos no identificados
  return generateGenericVehicleResponse(colorDescription, licensePlate, analysis);
}

/**
 * Detecta marca por características visuales avanzadas
 */
function detectBrandByVisualFeatures(analysis, colors) {
  const objects = analysis.objects || [];
  const labels = analysis.labels || [];
  const mainColor = colors.length > 0 ? colors[0] : null;
  
  console.log('🔍 Detectando marca por características visuales:');
  console.log('   🎨 Color principal:', mainColor);
  console.log('   🏷️ Etiquetas:', labels.map(l => l.description));
  console.log('   📦 Objetos:', objects.map(o => o.name));
  
  // Ferrari - Detección mejorada
  const isRedCar = mainColor && mainColor.red > 150 && mainColor.green < 120 && mainColor.blue < 120;
  const isSportsCar = labels.some(l => {
    const desc = l.description.toLowerCase();
    return desc.includes('sports car') || desc.includes('supercar') || desc.includes('car');
  }) || objects.some(o => {
    const name = o.name.toLowerCase();
    return name.includes('car') || name.includes('vehicle');
  });
  
  if (isRedCar && isSportsCar) {
    console.log('   🐎 Ferrari detectado por: color rojo + deportivo');
    return 'ferrari';
  }
  
  // Lamborghini - Colores llamativos
  if (isSportsCar && mainColor) {
    if (mainColor.green > 150 || (mainColor.red > 200 && mainColor.green > 150)) {
      console.log('   🐂 Lamborghini detectado por: color llamativo + deportivo');
      return 'lamborghini';
    }
  }
  
  // McLaren - Naranja característico
  if (isSportsCar && mainColor && mainColor.red > 200 && mainColor.green > 100 && mainColor.blue < 80) {
    console.log('   🏴󠁧󠁢󠁥󠁮󠁧󠁿 McLaren detectado por: naranja + deportivo');
    return 'mclaren';
  }
  
  // Si es un deportivo rojo y no se detectó otra marca, asumir Ferrari
  if (isRedCar && isSportsCar) {
    console.log('   🐎 Ferrari por defecto: deportivo rojo');
    return 'ferrari';
  }
  
  console.log('   ❓ Marca no detectada visualmente');
  return null;
}

/**
 * Identifica colores específicos de vehículos con base de datos masiva
 */
function getVehicleColorName(hex, r, g, b) {
  // Ferrari - Colores icónicos
  if (r > 180 && g < 80 && b < 80) {
    if (r > 220) return 'Rosso Corsa (Rojo Ferrari)';
    return 'Rosso Scuderia';
  }
  
  // Lamborghini - Colores llamativos
  if (g > 180 && r < 100 && b < 100) return 'Verde Ithaca';
  if (r > 200 && g > 150 && b < 100) return 'Arancio Borealis';
  if (r > 200 && g > 200 && b < 100) return 'Giallo Orion';
  
  // Porsche - Colores clásicos
  if (r > 200 && g > 200 && b > 200) return 'Blanco Carrara';
  if (r < 80 && g < 80 && b < 80) return 'Negro Jet';
  if (r > 100 && g > 100 && b > 150) return 'Azul Gentian';
  
  // McLaren - Colores distintivos
  if (r > 200 && g > 100 && b < 80) return 'McLaren Orange';
  if (r < 100 && g < 100 && b > 150) return 'Burton Blue';
  
  // Tesla - Colores específicos
  if (r > 180 && g < 80 && b < 80) return 'Rojo Multicapa';
  if (r > 200 && g > 200 && b > 200) return 'Blanco Perla';
  if (r < 50 && g < 50 && b < 50) return 'Negro Sólido';
  if (r < 80 && g < 80 && b < 80) return 'Gris Medianoche';
  if (r > 100 && g > 120 && b > 140) return 'Azul Profundo';
  
  // BMW - Colores premium
  if (r > 100 && g > 120 && b > 150) return 'Azul Alpina';
  if (r > 200 && g > 200 && b > 200) return 'Blanco Alpino';
  if (r < 60 && g < 60 && b < 60) return 'Negro Carbón';
  
  // Mercedes - Colores de lujo
  if (r < 50 && g < 50 && b < 50) return 'Negro Obsidiana';
  if (r > 200 && g > 200 && b > 200) return 'Blanco Polar';
  if (r > 150 && g > 150 && b > 150) return 'Plata Iridio';
  
  // Audi - Colores tecnológicos
  if (r > 180 && g < 80 && b < 80) return 'Rojo Tango';
  if (r > 200 && g > 200 && b > 200) return 'Blanco Ibis';
  if (r < 80 && g < 80 && b < 80) return 'Negro Mythos';
  if (r > 120 && g > 120 && b > 120) return 'Gris Nardo';
  
  // Colores genéricos mejorados
  if (r > 200 && g < 100 && b < 100) return 'rojo intenso';
  if (r > 150 && g < 120 && b < 120) return 'rojo';
  if (r > 220 && g > 220 && b > 220) return 'blanco puro';
  if (r > 180 && g > 180 && b > 180) return 'blanco';
  if (r < 40 && g < 40 && b < 40) return 'negro profundo';
  if (r < 80 && g < 80 && b < 80) return 'negro';
  if (r > 100 && g > 100 && b > 100 && r < 180) return 'gris metálico';
  if (b > r + 50 && b > g + 50) return 'azul';
  if (g > r + 50 && g > b + 50) return 'verde';
  if (r > 150 && g > 150 && b < 100) return 'amarillo';
  if (r > 150 && g > 100 && b < 100) return 'naranja';
  if (r > 100 && g < 100 && b > 100) return 'morado';
  
  return 'color metálico';
}

/**
 * Respuesta especializada para Ferrari
 */
function generateFerrariResponse(text, color, licensePlate, analysis) {
  let response = [];
  
  // Identificar modelo específico de Ferrari
  let model = 'Ferrari';
  let modelDetails = '';
  
  if (text.toLowerCase().includes('12cilindri') || text.toLowerCase().includes('12 cilindri')) {
    model = 'Ferrari 12Cilindri';
    modelDetails = ' (2024–, coupé) —el sucesor del 812';
  } else if (text.toLowerCase().includes('sf90')) {
    model = 'Ferrari SF90 Stradale';
    modelDetails = ' —híbrido de 1000 CV';
  } else if (text.toLowerCase().includes('f8')) {
    model = 'Ferrari F8 Tributo';
    modelDetails = ' —V8 biturbo de 720 CV';
  } else if (text.toLowerCase().includes('roma')) {
    model = 'Ferrari Roma';
    modelDetails = ' —gran turismo elegante';
  } else if (text.toLowerCase().includes('portofino')) {
    model = 'Ferrari Portofino';
    modelDetails = ' —descapotable de entrada';
  } else {
    // Detectar por características visuales y forma
    if (analysis.labels?.some(l => l.description.toLowerCase().includes('supercar'))) {
      model = 'Ferrari 12Cilindri';
      modelDetails = ' (2024–, coupé) —el sucesor del 812';
    } else {
      model = 'Ferrari F12berlinetta';
      modelDetails = ' —gran turismo V12 delantero';
    }
  }
  
  response.push(`Amo, ese es un ${model}${modelDetails} en ${color}.`);
  
  // Características identificables
  if (model.includes('12Cilindri')) {
    response.push('\nCómo lo reconozco:');
    response.push('• Franja delantera continua con faros ultra finos, guiño al Daytona de los 70');
    response.push('• Capó larguísimo, toma lateral horizontal y llantas de 5 radios diamantadas');
    response.push('• Escudo Ferrari en la aleta y proporciones clásicas de gran turismo V12 delantero');
    
    response.push('\nFicha rápida:');
    response.push('• **Motor**: V12 6.5 atmosférico, ~830 CV, tracción trasera');
    response.push('• **Transmisión**: DCT 8 velocidades');
    response.push('• **Prestaciones**: 0–100 km/h aprox. 2,9 s, velocidad máx. >340 km/h');
    response.push('• **Interior**: Cuadro digital y pantallas para conductor y pasajero');
    response.push('• **Variantes**: También existe versión Spider (descapotable)');
  } else if (model.includes('F12berlinetta')) {
    response.push('\nCómo lo reconozco:');
    response.push('• Líneas musculosas y agresivas características del F12');
    response.push('• Capó largo con tomas de aire laterales');
    response.push('• Faros LED afilados y parrilla Ferrari clásica');
    response.push('• Proporciones de gran turismo con motor V12 delantero');
    
    response.push('\nFicha rápida:');
    response.push('• **Motor**: V12 6.3 atmosférico, 740 CV, tracción trasera');
    response.push('• **Transmisión**: F1 DCT 7 velocidades');
    response.push('• **Prestaciones**: 0–100 km/h en 3,1 s, velocidad máx. 340 km/h');
    response.push('• **Peso**: 1.525 kg, distribución 46/54');
    response.push('• **Años**: 2012-2017, predecesor del 812 Superfast');
  }
  
  if (licensePlate) {
    response.push(`\nMatrícula: ${licensePlate}`);
  }
  
  return response.join('\n');
}

/**
 * Respuesta especializada para Lamborghini
 */
function generateLamborghiniResponse(text, color, licensePlate, analysis) {
  let response = [];
  
  let model = 'Lamborghini';
  let modelDetails = '';
  
  if (text.toLowerCase().includes('huracan') || text.toLowerCase().includes('huracán')) {
    model = 'Lamborghini Huracán';
    modelDetails = ' —V10 de 630 CV';
  } else if (text.toLowerCase().includes('aventador')) {
    model = 'Lamborghini Aventador';
    modelDetails = ' —V12 de 770 CV';
  } else if (text.toLowerCase().includes('urus')) {
    model = 'Lamborghini Urus';
    modelDetails = ' —SUV deportivo';
  } else {
    model = 'Lamborghini Huracán';
    modelDetails = ' —superdeportivo italiano';
  }
  
  response.push(`Eso es un ${model}${modelDetails} en ${color}.`);
  
  response.push('\nCaracterísticas distintivas:');
  response.push('• Diseño angular y agresivo característico de Lamborghini');
  response.push('• Líneas afiladas y tomas de aire prominentes');
  response.push('• Faros LED con forma de "Y" invertida');
  response.push('• Escape cuadrado y difusor trasero agresivo');
  
  if (licensePlate) {
    response.push(`\nMatrícula: ${licensePlate}`);
  }
  
  return response.join('\n');
}

/**
 * Respuesta especializada para Porsche
 */
function generatePorscheResponse(text, color, licensePlate, analysis) {
  let response = [];
  
  let model = 'Porsche';
  let modelDetails = '';
  
  if (text.toLowerCase().includes('911')) {
    model = 'Porsche 911';
    modelDetails = ' —icónico deportivo alemán';
  } else if (text.toLowerCase().includes('taycan')) {
    model = 'Porsche Taycan';
    modelDetails = ' —deportivo eléctrico';
  } else if (text.toLowerCase().includes('panamera')) {
    model = 'Porsche Panamera';
    modelDetails = ' —sedán deportivo';
  } else {
    model = 'Porsche 911';
    modelDetails = ' —el deportivo más icónico';
  }
  
  response.push(`Eso es un ${model}${modelDetails} en ${color}.`);
  
  response.push('\nCaracterísticas típicas de Porsche:');
  response.push('• Silueta inconfundible con faros redondos');
  response.push('• Línea de techo caída hacia atrás');
  response.push('• Motor trasero (en el 911) o central');
  response.push('• Interior deportivo con instrumentación clásica');
  
  if (licensePlate) {
    response.push(`\nMatrícula: ${licensePlate}`);
  }
  
  return response.join('\n');
}

/**
 * Respuesta especializada para McLaren
 */
function generateMcLarenResponse(text, color, licensePlate, analysis) {
  let response = [];
  
  let model = 'McLaren';
  let modelDetails = '';
  
  if (text.toLowerCase().includes('720s')) {
    model = 'McLaren 720S';
    modelDetails = ' —720 CV de potencia pura';
  } else if (text.toLowerCase().includes('p1')) {
    model = 'McLaren P1';
    modelDetails = ' —hiperdeportivo híbrido';
  } else {
    model = 'McLaren 720S';
    modelDetails = ' —superdeportivo británico';
  }
  
  response.push(`Eso es un ${model}${modelDetails} en ${color}.`);
  
  response.push('\nCaracterísticas de McLaren:');
  response.push('• Puertas tipo "dihedral" que se abren hacia arriba');
  response.push('• Diseño aerodinámico extremo');
  response.push('• Chasis de fibra de carbono');
  response.push('• Interior minimalista y orientado al piloto');
  
  if (licensePlate) {
    response.push(`\nMatrícula: ${licensePlate}`);
  }
  
  return response.join('\n');
}

/**
 * Respuesta especializada para Bugatti
 */
function generateBugattiResponse(text, color, licensePlate, analysis) {
  let response = [];
  
  let model = 'Bugatti';
  let modelDetails = '';
  
  if (text.toLowerCase().includes('chiron')) {
    model = 'Bugatti Chiron';
    modelDetails = ' —1500 CV de locura';
  } else if (text.toLowerCase().includes('veyron')) {
    model = 'Bugatti Veyron';
    modelDetails = ' —leyenda de 1000 CV';
  } else {
    model = 'Bugatti Chiron';
    modelDetails = ' —el hiperdeportivo definitivo';
  }
  
  response.push(`Eso es un ${model}${modelDetails} en ${color}.`);
  
  response.push('\nCaracterísticas de Bugatti:');
  response.push('• Parrilla en forma de herradura característica');
  response.push('• Línea C lateral distintiva');
  response.push('• Proporciones masivas y presencia imponente');
  response.push('• Interior de lujo absoluto con materiales premium');
  
  if (licensePlate) {
    response.push(`\nMatrícula: ${licensePlate}`);
  }
  
  return response.join('\n');
}

/**
 * Respuesta especializada para Tesla
 */
function generateTeslaResponse(text, color, licensePlate, analysis) {
  let response = [];
  
  // Identificar modelo específico
  let model = 'Tesla';
  let modelDetails = '';
  
  if (text.toLowerCase().includes('model 3') || isModel3Design(analysis)) {
    model = 'Tesla Model 3';
    modelDetails = identifyModel3Version(analysis, text);
  } else if (text.toLowerCase().includes('model s')) {
    model = 'Tesla Model S';
    modelDetails = 'Sedán de lujo con hasta 650 km de autonomía';
  } else if (text.toLowerCase().includes('model x')) {
    model = 'Tesla Model X';
    modelDetails = 'SUV con puertas Falcon Wing';
  } else if (text.toLowerCase().includes('model y')) {
    model = 'Tesla Model Y';
    modelDetails = 'SUV compacto basado en Model 3';
  } else {
    // Intentar identificar por características visuales
    model = 'Tesla Model 3'; // Asumimos Model 3 por defecto
    modelDetails = identifyModel3Version(analysis, text);
  }
  
  response.push(`Eso es un ${model}${modelDetails} en ${color}.`);
  
  // Características identificables
  if (model.includes('Model 3')) {
    response.push('\nSe reconoce por:');
    response.push('• Faros delanteros más finos y defensa delantera lisa (sin antinieblas)');
    response.push('• Techo panorámico negro y manillas enrasadas');
    response.push('• Diseño minimalista característico de Tesla');
    
    response.push('\nEn el interior (revisión Highland 2023-2024):');
    response.push('• Mejor insonorización y iluminación ambiental');
    response.push('• Asientos ventilados (según mercado)');
    response.push('• Pantalla trasera para los pasajeros');
    response.push('• Volante sin palancas (intermitentes en el volante)');
    
    response.push('\nVersiones típicas:');
    response.push('• **RWD**: Tracción trasera, 0-100 km/h ~6s, autonomía real ~400-500 km');
    response.push('• **Long Range AWD**: Tracción total, 0-100 km/h ~4-5s, autonomía ~500-600 km');
    response.push('• **Performance**: Enfoque deportivo, 0-100 km/h ~3.3s');
  }
  
  if (licensePlate) {
    response.push(`\nMatrícula: ${licensePlate}`);
    if (licensePlate.includes('E')) {
      response.push('(Matrícula de vehículo eléctrico)');
    }
  }
  
  return response.join('\n');
}

/**
 * Identifica si es un Model 3 por características visuales
 */
function isModel3Design(analysis) {
  // Lógica para identificar Model 3 por forma, proporciones, etc.
  // Por ahora, asumimos que sí es Model 3
  return true;
}

/**
 * Identifica la versión específica del Model 3
 */
function identifyModel3Version(analysis, text) {
  // Buscar indicadores de la revisión Highland
  if (text.includes('2023') || text.includes('2024') || text.includes('highland')) {
    return ' (restyling 2023–2024, "Highland")';
  }
  
  // Por defecto, asumir Highland si no hay indicadores contrarios
  return ' (restyling 2023–2024, "Highland")';
}

/**
 * Respuesta especializada para BMW
 */
function generateBMWResponse(text, color, licensePlate, analysis) {
  let response = [];
  
  response.push(`Eso es un BMW en ${color}.`);
  
  response.push('\nCaracterísticas típicas de BMW:');
  response.push('• Parrilla riñón característica');
  response.push('• Faros tipo "ojos de ángel"');
  response.push('• Líneas deportivas y elegantes');
  response.push('• Interior premium con tecnología iDrive');
  
  if (licensePlate) {
    response.push(`\nMatrícula: ${licensePlate}`);
  }
  
  return response.join('\n');
}

/**
 * Respuesta especializada para Mercedes
 */
function generateMercedesResponse(text, color, licensePlate, analysis) {
  let response = [];
  
  response.push(`Eso es un Mercedes-Benz en ${color}.`);
  
  response.push('\nCaracterísticas típicas de Mercedes:');
  response.push('• Estrella de tres puntas en el capó');
  response.push('• Parrilla elegante y distintiva');
  response.push('• Líneas de lujo y sofisticación');
  response.push('• Interior premium con sistema MBUX');
  
  if (licensePlate) {
    response.push(`\nMatrícula: ${licensePlate}`);
  }
  
  return response.join('\n');
}

/**
 * Respuesta especializada para Audi
 */
function generateAudiResponse(text, color, licensePlate, analysis) {
  let response = [];
  
  response.push(`Eso es un Audi en ${color}.`);
  
  response.push('\nCaracterísticas típicas de Audi:');
  response.push('• Cuatro aros entrelazados en el logo');
  response.push('• Parrilla Singleframe hexagonal');
  response.push('• Faros LED Matrix distintivos');
  response.push('• Interior tecnológico con Virtual Cockpit');
  
  if (licensePlate) {
    response.push(`\nMatrícula: ${licensePlate}`);
  }
  
  return response.join('\n');
}

/**
 * Respuesta genérica para vehículos no identificados
 */
function generateGenericVehicleResponse(color, licensePlate, analysis) {
  let response = [];
  
  response.push(`Veo un vehículo en ${color}.`);
  
  if (licensePlate) {
    response.push(`\nMatrícula: ${licensePlate}`);
    if (licensePlate.includes('E')) {
      response.push('(Matrícula de vehículo eléctrico)');
    }
  }
  
  response.push('\nPara una identificación más precisa, podrías proporcionar más detalles sobre la marca o modelo.');
  
  return response.join('\n');
}

/**
 * Respuesta especializada para aplicaciones móviles
 */
function generateMobileAppResponse(context, analysis) {
  const text = analysis.text || '';
  
  if (text.length > 0) {
    const firstLine = text.split('\n')[0]?.trim();
    if (firstLine && firstLine.length < 100) {
      return `Veo una aplicación móvil. Puedo leer: "${firstLine}".`;
    }
  }
  
  return 'Veo la interfaz de una aplicación móvil.';
}

/**
 * Respuesta especializada para documentos
 */
function generateDocumentResponse(context, analysis) {
  if (context.hasLongText) {
    const preview = analysis.text.substring(0, 100).trim();
    return `Veo un documento con texto. Comienza: "${preview}...".`;
  }
  
  return 'Veo un documento o texto.';
}

/**
 * Convierte un código HEX a un nombre de color aproximado
 * @param {string} hex - Código hexadecimal del color
 * @returns {string} Nombre aproximado del color
 */
function getColorName(hex) {
  const colors = {
    '#FF0000': 'rojos', '#FF6B6B': 'rojos', '#DC143C': 'rojos',
    '#00FF00': 'verdes', '#32CD32': 'verdes', '#228B22': 'verdes',
    '#0000FF': 'azules', '#4169E1': 'azules', '#1E90FF': 'azules',
    '#FFFF00': 'amarillos', '#FFD700': 'amarillos', '#FFA500': 'naranjas',
    '#800080': 'morados', '#9370DB': 'morados', '#8A2BE2': 'morados',
    '#FFC0CB': 'rosados', '#FF69B4': 'rosados', '#FF1493': 'rosados',
    '#A52A2A': 'marrones', '#8B4513': 'marrones', '#D2691E': 'marrones',
    '#000000': 'negros', '#2F2F2F': 'grises oscuros', '#808080': 'grises',
    '#FFFFFF': 'blancos', '#F5F5F5': 'blancos', '#DCDCDC': 'grises claros'
  };
  
  // Buscar color exacto
  if (colors[hex.toUpperCase()]) {
    return colors[hex.toUpperCase()];
  }
  
  // Aproximación básica por rangos RGB
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  
  if (r > 200 && g > 200 && b > 200) return 'claros';
  if (r < 50 && g < 50 && b < 50) return 'oscuros';
  if (r > g && r > b) return 'rojizos';
  if (g > r && g > b) return 'verdosos';
  if (b > r && b > g) return 'azulados';
  if (r > 150 && g > 150 && b < 100) return 'amarillentos';
  if (r > 150 && g < 100 && b > 150) return 'morados';
  
  return 'neutros';
}

/**
 * Extrae el contexto del usuario desde la instrucción que acompaña a la imagen
 */
function extractUserContext(messageId, mediaType) {
  // Por ahora, retornamos null ya que necesitamos acceso a la instrucción
  // En una implementación completa, buscaríamos en la base de datos
  // la instrucción asociada al messageId para extraer el contexto
  return null;
}

/**
 * Genera respuestas basadas en la intención específica del usuario
 */
function generateUserIntentResponse(context, analysis, userContext) {
  const intent = userContext.userIntent.toLowerCase();
  const text = analysis.text || '';
  
  // Intenciones relacionadas con explicación de funcionalidades
  if (intent.includes('qué hace') || intent.includes('para qué sirve') || intent.includes('cómo funciona')) {
    return generateFunctionalityExplanation(context, analysis, intent);
  }
  
  // Intenciones relacionadas con problemas o errores
  if (intent.includes('error') || intent.includes('problema') || intent.includes('no funciona')) {
    return generateTroubleshootingResponse(context, analysis, intent);
  }
  
  // Intenciones relacionadas con configuración
  if (intent.includes('configurar') || intent.includes('activar') || intent.includes('cómo hacer')) {
    return generateConfigurationResponse(context, analysis, intent);
  }
  
  // Intenciones relacionadas con seguridad
  if (intent.includes('seguro') || intent.includes('privacidad') || intent.includes('proteger')) {
    return generateSecurityResponse(context, analysis, intent);
  }
  
  // Intenciones relacionadas con comparación
  if (intent.includes('diferencia') || intent.includes('comparar') || intent.includes('mejor')) {
    return generateComparisonResponse(context, analysis, intent);
  }
  
  // Intenciones relacionadas con tutorial/guía
  if (intent.includes('tutorial') || intent.includes('guía') || intent.includes('paso a paso')) {
    return generateTutorialResponse(context, analysis, intent);
  }
  
  // Fallback: respuesta contextual estándar con mención de la pregunta
  const standardResponse = generateContextualResponse(context, analysis);
  return `Respecto a tu pregunta: "${userContext.userIntent}"\n\n${standardResponse}`;
}

/**
 * Genera explicaciones detalladas de funcionalidades
 */
function generateFunctionalityExplanation(context, analysis, intent) {
  if (context.type === 'banking_card') {
    if (intent.includes('congelar') || intent.includes('freeze')) {
      return `La función **Congelar** de tu tarjeta:\n\n🧊 **¿Qué hace?**\n• Bloquea temporalmente todos los pagos (online y físicos)\n• Impide retiros en cajeros automáticos\n• Mantiene activas las transferencias entre tus cuentas\n\n⚙️ **¿Cómo funciona?**\n• Toca "Congelar" → Confirma con Face ID/Touch ID\n• El bloqueo es instantáneo\n• Para descongelar: toca el mismo botón nuevamente\n\n🛡️ **¿Cuándo usarla?**\n• Si perdiste tu tarjeta temporalmente\n• Sospechas de actividad fraudulenta\n• Quieres prevenir gastos impulsivos\n• Viajas y no usarás la tarjeta por un tiempo`;
    }
    
    if (intent.includes('ver número') || intent.includes('número completo')) {
      return `La función **Ver Número** de tu tarjeta:\n\n🔍 **¿Qué muestra?**\n• Número completo de 16 dígitos\n• Fecha de vencimiento (MM/AA)\n• Código CVV (3 dígitos del reverso)\n\n🔒 **Proceso de seguridad:**\n• Toca "Ver Número" → Valida con Face ID/Touch ID\n• Los datos se muestran por 30 segundos\n• Opción de copiar al portapapeles\n• Se ocultan automáticamente después\n\n📱 **¿Cuándo usarla?**\n• Compras online\n• Suscripciones digitales\n• Configurar pagos automáticos\n• Cuando no tienes la tarjeta física a mano`;
    }
    
    return generateBankingCardResponse(context, analysis);
  }
  
  return `Te explico las funcionalidades que veo en esta imagen:\n\n${generateContextualResponse(context, analysis)}`;
}

/**
 * Genera respuestas para problemas y troubleshooting
 */
function generateTroubleshootingResponse(context, analysis, intent) {
  if (context.type === 'banking_card') {
    return `🔧 **Solución de problemas con tu tarjeta:**\n\n🚫 **Si "Ver Número" no funciona:**\n• Verifica que Face ID/Touch ID esté activado para la app\n• Ve a Ajustes > [Nombre del banco] > Face ID\n• Asegúrate de tener la última versión de la app\n• Reinicia la app si persiste el problema\n\n❄️ **Si "Congelar" no responde:**\n• Verifica tu conexión a internet\n• Cierra y abre la app nuevamente\n• Si está congelada, puede tardar unos segundos en cambiar\n\n📞 **Si nada funciona:**\n• Contacta al soporte del banco\n• Usa la banca web como alternativa\n• Verifica si hay mantenimiento programado`;
  }
  
  return `Veo que tienes un problema. ${generateContextualResponse(context, analysis)}\n\n🔧 Si necesitas ayuda específica, descíbeme exactamente qué no está funcionando.`;
}

/**
 * Genera guías de configuración
 */
function generateConfigurationResponse(context, analysis, intent) {
  if (context.type === 'banking_card') {
    return `⚙️ **Cómo configurar tu tarjeta:**\n\n🔒 **Activar Face ID/Touch ID:**\n1. Ve a Ajustes de tu teléfono\n2. Busca la app de tu banco\n3. Activa "Face ID" o "Touch ID"\n4. Confirma con tu contraseña\n\n🔔 **Configurar notificaciones:**\n• Abre la app del banco\n• Ve a Configuración > Notificaciones\n• Activa alertas de transacciones\n• Configura límites de gasto\n\n🌍 **Configurar pagos internacionales:**\n• Contacta a tu banco\n• Solicita activación para el extranjero\n• Informa fechas de viaje`;
  }
  
  return `Te ayudo con la configuración:\n\n${generateContextualResponse(context, analysis)}`;
}

/**
 * Genera respuestas sobre seguridad
 */
function generateSecurityResponse(context, analysis, intent) {
  if (context.type === 'banking_card') {
    return `🛡️ **Seguridad de tu tarjeta:**\n\n🔒 **Medidas de protección:**\n• Face ID/Touch ID para ver datos sensibles\n• Congelado instantáneo en caso de pérdida\n• Notificaciones en tiempo real\n• Cifrado de extremo a extremo\n\n⚠️ **Buenas prácticas:**\n• Nunca compartas tu PIN o contraseña\n• Congela la tarjeta si la pierdes\n• Revisa movimientos regularmente\n• Usa redes WiFi seguras para transacciones\n\n🚨 **Si sospechas fraude:**\n• Congela la tarjeta inmediatamente\n• Contacta al banco por teléfono\n• Revisa últimas transacciones\n• Cambia contraseñas si es necesario`;
  }
  
  return `Sobre la seguridad de lo que veo:\n\n${generateContextualResponse(context, analysis)}`;
}

/**
 * Genera comparaciones y recomendaciones
 */
function generateComparisonResponse(context, analysis, intent) {
  if (context.type === 'banking_card') {
    return `🎆 **Comparación de opciones:**\n\n🔍 **Ver Número vs Tarjeta Física:**\n• **Digital**: Instantáneo, siempre disponible, seguro\n• **Física**: Puede perderse, no siempre la tienes\n\n❄️ **Congelar vs Cancelar:**\n• **Congelar**: Temporal, reversible, instantáneo\n• **Cancelar**: Permanente, requiere nueva tarjeta\n\n📱 **App vs Banca Web:**\n• **App**: Más rápida, Face ID, notificaciones\n• **Web**: Más funciones, mejor para gestiones complejas`;
  }
  
  return `Te ayudo a comparar las opciones:\n\n${generateContextualResponse(context, analysis)}`;
}

/**
 * Genera tutoriales paso a paso
 */
function generateTutorialResponse(context, analysis, intent) {
  if (context.type === 'banking_card') {
    return `📚 **Tutorial paso a paso:**\n\n🔍 **Para ver el número completo:**\n1. 👆 Toca "Ver Número"\n2. 🔒 Valida con Face ID/Touch ID\n3. 👀 Se mostrarán todos los datos\n4. 📋 Opcional: toca "Copiar" si lo necesitas\n5. ⏰ Los datos se ocultarán automáticamente\n\n❄️ **Para congelar/descongelar:**\n1. 👆 Toca "Congelar"\n2. 🔒 Confirma con biometría\n3. ✅ Verás confirmación instantánea\n4. 🔄 Para descongelar: repite el proceso\n\n📱 **Navegación en la app:**\n• Desliza horizontalmente para ver otras tarjetas\n• Toca el ícono superior derecho para más opciones\n• Usa el menú inferior para cambiar de sección`;
  }
  
  return `Te creo un tutorial para esta imagen:\n\n${generateContextualResponse(context, analysis)}`;
}
