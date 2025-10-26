import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { __dirname } from '../app.js';

const execAsync = promisify(exec);

/**
 * Detecta si una URL es de una plataforma de video soportada
 * @param {string} url - URL a verificar
 * @returns {object} - {isValid, platform, originalUrl}
 */
export function detectVideoUrl(url) {
  if (!url || typeof url !== 'string') {
    return { isValid: false, platform: null, originalUrl: url };
  }

  // Limpiar URL de parámetros innecesarios
  const cleanUrl = url.trim();
  
  // Patrones para diferentes plataformas
  const patterns = {
    youtube: [
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|m\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/
    ],
    instagram: [
      /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel)\/([a-zA-Z0-9_-]+)/,
      /(?:https?:\/\/)?(?:www\.)?instagram\.com\/stories\/[^\/]+\/([0-9]+)/
    ],
    tiktok: [
      /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[^\/]+\/video\/([0-9]+)/,
      /(?:https?:\/\/)?(?:vm\.tiktok\.com|vt\.tiktok\.com)\/([a-zA-Z0-9]+)/,
      /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/t\/([a-zA-Z0-9]+)/
    ]
  };

  // Verificar cada plataforma
  for (const [platform, platformPatterns] of Object.entries(patterns)) {
    for (const pattern of platformPatterns) {
      const match = cleanUrl.match(pattern);
      if (match) {
        return {
          isValid: true,
          platform,
          originalUrl: cleanUrl,
          videoId: match[1],
          normalizedUrl: cleanUrl
        };
      }
    }
  }

  return { isValid: false, platform: null, originalUrl: cleanUrl };
}

/**
 * Descarga un video desde una URL usando yt-dlp
 * @param {string} url - URL del video
 * @param {string} outputDir - Directorio de salida
 * @returns {Promise<object>} - Información del archivo descargado
 */
export async function downloadVideoFromUrl(url, outputDir = null) {
  const videoInfo = detectVideoUrl(url);
  
  if (!videoInfo.isValid) {
    throw new Error(`URL no soportada: ${url}`);
  }

  // Crear directorio temporal si no se especifica
  const tempDir = outputDir || path.join(__dirname, '../temp_downloads');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Generar nombre de archivo de salida
  const timestamp = Date.now();
  const outputPath = path.join(tempDir, `video_${timestamp}_%(title)s.%(ext)s`);
  
  try {
    console.log(`📥 Descargando video desde ${videoInfo.platform}: ${url}`);
    
    // Construir comando yt-dlp con formato simple
    const ytDlpCommand = [
      'yt-dlp',
      '--no-playlist',
      '--write-info-json',
      '--write-description',
      '--write-thumbnail',
      '--format', 'best',
      '--output', `"${outputPath}"`,
      `"${url}"`
    ].join(' ');

    console.log(`🔧 Ejecutando: ${ytDlpCommand}`);
    
    const { stdout, stderr } = await execAsync(ytDlpCommand, {
      timeout: 300000, // 5 minutos timeout
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });

    console.log(`✅ Descarga completada para ${videoInfo.platform}`);
    if (stderr) {
      console.warn(`⚠️ Advertencias durante descarga: ${stderr}`);
    }

    // Buscar archivos descargados
    const files = fs.readdirSync(tempDir).filter(file => 
      file.includes(`video_${timestamp}`) && 
      (file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mkv'))
    );

    if (files.length === 0) {
      throw new Error('No se encontró archivo de video descargado');
    }

    const videoFile = files[0];
    const videoPath = path.join(tempDir, videoFile);
    const stats = fs.statSync(videoPath);

    // Buscar archivos de metadatos
    const infoFile = files.find(f => f.endsWith('.info.json'));
    const descFile = files.find(f => f.endsWith('.description'));
    const thumbFile = files.find(f => f.match(/\.(jpg|jpeg|png|webp)$/));

    let metadata = {};
    if (infoFile) {
      try {
        const infoPath = path.join(tempDir, infoFile);
        const infoContent = fs.readFileSync(infoPath, 'utf8');
        metadata = JSON.parse(infoContent);
      } catch (e) {
        console.warn('⚠️ No se pudo leer metadatos del video');
      }
    }

    let description = '';
    if (descFile) {
      try {
        const descPath = path.join(tempDir, descFile);
        description = fs.readFileSync(descPath, 'utf8');
      } catch (e) {
        console.warn('⚠️ No se pudo leer descripción del video');
      }
    }

    return {
      success: true,
      platform: videoInfo.platform,
      originalUrl: url,
      videoPath,
      filename: videoFile,
      size: stats.size,
      mimeType: getVideoMimeType(videoFile),
      metadata: {
        title: metadata.title || 'Video sin título',
        description: description || metadata.description || '',
        duration: metadata.duration || 0,
        uploader: metadata.uploader || metadata.channel || 'Desconocido',
        uploadDate: metadata.upload_date || null,
        viewCount: metadata.view_count || 0,
        likeCount: metadata.like_count || 0,
        thumbnail: thumbFile ? path.join(tempDir, thumbFile) : null
      }
    };

  } catch (error) {
    console.error(`❌ Error descargando video desde ${videoInfo.platform}:`, error.message);
    
    // Limpiar archivos parciales
    try {
      const partialFiles = fs.readdirSync(tempDir).filter(file => 
        file.includes(`video_${timestamp}`)
      );
      partialFiles.forEach(file => {
        fs.unlinkSync(path.join(tempDir, file));
      });
    } catch (cleanupError) {
      console.warn('⚠️ Error limpiando archivos parciales:', cleanupError.message);
    }

    throw new Error(`Error descargando video: ${error.message}`);
  }
}

/**
 * Determina el tipo MIME basado en la extensión del archivo
 * @param {string} filename - Nombre del archivo
 * @returns {string} - Tipo MIME
 */
function getVideoMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv'
  };
  return mimeTypes[ext] || 'video/mp4';
}

/**
 * Limpia archivos temporales antiguos
 * @param {string} tempDir - Directorio temporal
 * @param {number} maxAgeHours - Edad máxima en horas (default: 2)
 */
export function cleanupTempFiles(tempDir = null, maxAgeHours = 2) {
  const targetDir = tempDir || path.join(__dirname, '../temp_downloads');
  
  if (!fs.existsSync(targetDir)) {
    return;
  }

  const maxAge = maxAgeHours * 60 * 60 * 1000; // Convertir a millisegundos
  const now = Date.now();

  try {
    const files = fs.readdirSync(targetDir);
    let cleaned = 0;

    files.forEach(file => {
      const filePath = path.join(targetDir, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtime.getTime() > maxAge) {
        fs.unlinkSync(filePath);
        cleaned++;
      }
    });

    if (cleaned > 0) {
      console.log(`🧹 Limpiados ${cleaned} archivos temporales antiguos`);
    }
  } catch (error) {
    console.warn('⚠️ Error limpiando archivos temporales:', error.message);
  }
}

/**
 * Valida si yt-dlp está instalado y disponible
 * @returns {Promise<boolean>} - true si está disponible
 */
export async function checkYtDlpAvailability() {
  try {
    const { stdout } = await execAsync('yt-dlp --version');
    console.log(`✅ yt-dlp disponible: ${stdout.trim()}`);
    return true;
  } catch (error) {
    console.error('❌ yt-dlp no está instalado o no está en el PATH');
    console.error('💡 Instala con: pip install yt-dlp');
    return false;
  }
}
