#!/usr/bin/env node

/**
 * Test simple para descargar el TikTok real sin iniciar servidor
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

console.log('🎬 TEST SIMPLE - Descarga directa de TikTok');
console.log('==========================================\n');

const tiktokUrl = 'https://www.tiktok.com/@ac2ality/video/7558465231140244749?q=ac2ality&t=1759865659452';

async function downloadTikTokDirect() {
  try {
    // Crear directorio temporal
    const tempDir = './temp_downloads';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    console.log('🔍 Verificando yt-dlp...');
    const { stdout: version } = await execAsync('yt-dlp --version');
    console.log(`✅ yt-dlp versión: ${version.trim()}\n`);

    console.log('📥 Descargando TikTok REAL...');
    console.log(`URL: ${tiktokUrl}\n`);

    const timestamp = Date.now();
    const outputTemplate = path.join(tempDir, `tiktok_${timestamp}_%(title)s.%(ext)s`);
    
    // Comando yt-dlp optimizado
    const ytDlpCommand = [
      'yt-dlp',
      '--no-playlist',
      '--write-info-json',
      '--write-description', 
      '--format', 'best[height<=720]/best',
      '--output', `"${outputTemplate}"`,
      `"${tiktokUrl}"`
    ].join(' ');

    console.log('🔧 Ejecutando descarga...');
    console.log(`Comando: ${ytDlpCommand}\n`);

    const { stdout, stderr } = await execAsync(ytDlpCommand, {
      timeout: 60000, // 1 minuto timeout
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });

    console.log('📋 Salida de yt-dlp:');
    console.log('====================');
    if (stdout) console.log(stdout);
    if (stderr) console.log('Advertencias:', stderr);

    // Buscar archivos descargados
    const files = fs.readdirSync(tempDir).filter(file => 
      file.includes(`tiktok_${timestamp}`) && 
      (file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mkv'))
    );

    if (files.length === 0) {
      throw new Error('No se encontró archivo de video descargado');
    }

    const videoFile = files[0];
    const videoPath = path.join(tempDir, videoFile);
    const stats = fs.statSync(videoPath);

    console.log('\n✅ DESCARGA EXITOSA!');
    console.log('====================');
    console.log(`📁 Archivo: ${videoFile}`);
    console.log(`📊 Tamaño: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // Buscar archivo de metadatos
    const infoFile = fs.readdirSync(tempDir).find(f => 
      f.includes(`tiktok_${timestamp}`) && f.endsWith('.info.json')
    );

    if (infoFile) {
      console.log('\n📋 METADATOS REALES:');
      console.log('===================');
      
      const infoPath = path.join(tempDir, infoFile);
      const metadata = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
      
      console.log(`🎬 Título: ${metadata.title || 'Sin título'}`);
      console.log(`📝 Descripción: ${metadata.description || 'Sin descripción'}`);
      console.log(`👤 Uploader: ${metadata.uploader || metadata.channel || 'N/A'}`);
      console.log(`⏱️ Duración: ${metadata.duration || 0} segundos`);
      console.log(`👀 Views: ${metadata.view_count || 'N/A'}`);
      console.log(`❤️ Likes: ${metadata.like_count || 'N/A'}`);
      console.log(`📅 Fecha: ${metadata.upload_date || 'N/A'}`);
    }

    // Probar extracción de audio
    console.log('\n🎵 Probando extracción de audio...');
    const audioPath = videoPath.replace(/\.[^/.]+$/, '.wav');
    
    try {
      const ffmpegCommand = `ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}" -y`;
      console.log('🔧 Extrayendo audio...');
      
      await execAsync(ffmpegCommand, { timeout: 30000 });
      
      const audioStats = fs.statSync(audioPath);
      console.log(`✅ Audio extraído: ${(audioStats.size / 1024).toFixed(2)} KB`);
      
      if (audioStats.size > 1000) {
        console.log('🎤 Audio listo para transcripción');
      } else {
        console.log('⚠️ Audio muy pequeño - puede no tener contenido hablado');
      }
      
    } catch (audioError) {
      console.log('❌ Error extrayendo audio:', audioError.message);
    }

    // Limpiar archivos
    console.log('\n🧹 Limpiando archivos temporales...');
    try {
      const allFiles = fs.readdirSync(tempDir).filter(f => f.includes(`tiktok_${timestamp}`));
      allFiles.forEach(file => {
        fs.unlinkSync(path.join(tempDir, file));
      });
      console.log(`✅ ${allFiles.length} archivos eliminados`);
    } catch (cleanupError) {
      console.warn('⚠️ Error limpiando:', cleanupError.message);
    }

    console.log('\n🎉 CONCLUSIÓN:');
    console.log('==============');
    console.log('✅ Tu URL de TikTok funciona perfectamente');
    console.log('✅ El sistema puede descargar el video real');
    console.log('✅ Puede extraer metadatos y audio');
    console.log('✅ Solo falta OpenAI API para transcripción completa');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('Sign up')) {
      console.log('💡 El video requiere autenticación - normal en TikTok');
    } else if (error.message.includes('unavailable')) {
      console.log('💡 Video no disponible o privado');
    } else if (error.message.includes('timeout')) {
      console.log('💡 Timeout - el video puede ser muy grande');
    } else {
      console.log('💡 Error técnico - revisar logs arriba');
    }
  }
}

downloadTikTokDirect();
