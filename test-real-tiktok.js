#!/usr/bin/env node

/**
 * Test REAL con la URL de TikTok de @ac2ality
 * Vamos a descargar y ver qué dice realmente
 */

import { downloadVideoFromUrl, checkYtDlpAvailability } from './dist/utils/videoUrlProcessor.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

console.log('🎬 TEST REAL - Descargando TikTok de @ac2ality');
console.log('===============================================\n');

const tiktokUrl = 'https://www.tiktok.com/@ac2ality/video/7558465231140244749?q=ac2ality&t=1759865659452';

async function testRealTikTok() {
  try {
    // 1. Verificar que yt-dlp esté disponible
    console.log('🔍 Verificando yt-dlp...');
    const ytDlpAvailable = await checkYtDlpAvailability();
    if (!ytDlpAvailable) {
      throw new Error('yt-dlp no está disponible');
    }
    console.log('✅ yt-dlp está listo\n');

    // 2. Descargar el video real
    console.log('📥 Descargando video REAL de @ac2ality...');
    console.log(`URL: ${tiktokUrl}\n`);
    
    const downloadResult = await downloadVideoFromUrl(tiktokUrl);
    
    if (!downloadResult.success) {
      throw new Error(`Error descargando: ${downloadResult.error}`);
    }

    console.log('✅ Video descargado exitosamente!');
    console.log(`📁 Archivo: ${downloadResult.filename}`);
    console.log(`📊 Tamaño: ${(downloadResult.size / 1024 / 1024).toFixed(2)} MB`);
    
    // 3. Mostrar metadatos REALES
    console.log('\n📋 METADATOS REALES del video:');
    console.log('=============================');
    console.log(`🎬 Título: ${downloadResult.metadata.title || 'Sin título'}`);
    console.log(`📝 Descripción: ${downloadResult.metadata.description || 'Sin descripción'}`);
    console.log(`👤 Usuario: ${downloadResult.metadata.uploader || '@ac2ality'}`);
    console.log(`⏱️ Duración: ${downloadResult.metadata.duration || 0} segundos`);
    console.log(`👀 Visualizaciones: ${downloadResult.metadata.viewCount || 'N/A'}`);
    console.log(`📅 Fecha: ${downloadResult.metadata.uploadDate || 'N/A'}`);

    // 4. Extraer audio para transcripción
    console.log('\n🎵 Extrayendo audio para transcripción...');
    const audioPath = downloadResult.videoPath.replace(/\.[^/.]+$/, '.wav');
    
    try {
      const ffmpegCommand = `ffmpeg -i "${downloadResult.videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}" -y`;
      console.log(`🔧 Ejecutando: ${ffmpegCommand}`);
      
      await execAsync(ffmpegCommand);
      console.log('✅ Audio extraído exitosamente');
      
      // Verificar que el archivo de audio existe
      const audioStats = fs.statSync(audioPath);
      console.log(`📊 Audio: ${(audioStats.size / 1024).toFixed(2)} KB`);
      
      if (audioStats.size > 1000) {
        console.log('🎤 Audio listo para transcripción con OpenAI Whisper');
        console.log('💡 Para transcribir necesitas configurar OPENAI_API_KEY');
      } else {
        console.log('⚠️ Archivo de audio muy pequeño - puede que no tenga contenido');
      }
      
    } catch (audioError) {
      console.error('❌ Error extrayendo audio:', audioError.message);
    }

    // 5. Limpiar archivos
    console.log('\n🧹 Limpiando archivos temporales...');
    try {
      if (fs.existsSync(downloadResult.videoPath)) {
        fs.unlinkSync(downloadResult.videoPath);
        console.log('✅ Video temporal eliminado');
      }
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
        console.log('✅ Audio temporal eliminado');
      }
    } catch (cleanupError) {
      console.warn('⚠️ Error limpiando:', cleanupError.message);
    }

    console.log('\n🎉 RESULTADO:');
    console.log('=============');
    console.log('✅ El sistema puede descargar tu TikTok');
    console.log('✅ Puede extraer metadatos reales');
    console.log('✅ Puede extraer audio para transcripción');
    console.log('✅ Solo falta configurar OpenAI API para transcribir');

  } catch (error) {
    console.error('❌ Error en el test:', error.message);
    
    if (error.message.includes('Sign up to download this video')) {
      console.log('\n💡 El video requiere autenticación en TikTok');
      console.log('   Esto es normal para algunos videos');
    } else if (error.message.includes('Video unavailable')) {
      console.log('\n💡 El video no está disponible o fue eliminado');
    } else {
      console.log('\n🔧 Error técnico - revisar configuración');
    }
  }
}

// Ejecutar test
testRealTikTok();
