#!/usr/bin/env node

/**
 * Test completo: Descarga + Transcripción del TikTok de @ac2ality
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const execAsync = promisify(exec);
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

console.log('🎬 TEST COMPLETO - Descarga + Transcripción TikTok');
console.log('=================================================\n');

const tiktokUrl = 'https://www.tiktok.com/@ac2ality/video/7558465231140244749?q=ac2ality&t=1759865659452';

async function transcribeCompleteTikTok() {
  let videoPath = null;
  let audioPath = null;
  
  try {
    // 1. Verificar OpenAI API
    console.log('🔑 Verificando OpenAI API...');
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY no configurada');
    }
    console.log('✅ OpenAI API configurada\n');

    // 2. Crear directorio temporal
    const tempDir = './temp_downloads';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // 3. Descargar video
    console.log('📥 Descargando TikTok...');
    const timestamp = Date.now();
    const outputPath = path.join(tempDir, `tiktok_${timestamp}.%(ext)s`);
    
    const ytDlpCommand = `yt-dlp --no-playlist --write-info-json --format "best[height<=720]/best" -o "${outputPath}" "${tiktokUrl}"`;
    
    const { stdout } = await execAsync(ytDlpCommand, {
      timeout: 60000,
      maxBuffer: 1024 * 1024 * 10
    });

    console.log('✅ Video descargado');

    // 4. Encontrar archivo de video
    const files = fs.readdirSync(tempDir).filter(file => 
      file.includes(`tiktok_${timestamp}`) && 
      (file.endsWith('.mp4') || file.endsWith('.webm'))
    );

    if (files.length === 0) {
      throw new Error('No se encontró archivo de video');
    }

    videoPath = path.join(tempDir, files[0]);
    console.log(`📁 Video: ${files[0]}`);

    // 5. Leer metadatos
    const infoFile = fs.readdirSync(tempDir).find(f => 
      f.includes(`tiktok_${timestamp}`) && f.endsWith('.info.json')
    );

    let metadata = {};
    if (infoFile) {
      const infoPath = path.join(tempDir, infoFile);
      metadata = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
      
      console.log('\n📋 METADATOS:');
      console.log(`🎬 Título: "${metadata.title}"`);
      console.log(`👤 Usuario: ${metadata.uploader}`);
      console.log(`⏱️ Duración: ${metadata.duration} segundos`);
    }

    // 6. Extraer audio
    console.log('\n🎵 Extrayendo audio...');
    audioPath = videoPath.replace(/\.[^/.]+$/, '.wav');
    
    const ffmpegCommand = `ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}" -y`;
    await execAsync(ffmpegCommand, { timeout: 30000 });
    
    const audioStats = fs.statSync(audioPath);
    console.log(`✅ Audio extraído: ${(audioStats.size / 1024).toFixed(2)} KB`);

    // 7. Transcribir con OpenAI Whisper
    console.log('\n🎤 Transcribiendo con OpenAI Whisper...');
    console.log('⏳ Enviando audio a OpenAI...');
    
    const audioBuffer = fs.readFileSync(audioPath);
    
    const transcription = await openai.audio.transcriptions.create({
      file: new File([audioBuffer], 'audio.wav', { type: 'audio/wav' }),
      model: 'whisper-1',
      language: 'es', // Español
      response_format: 'text'
    });

    console.log('✅ Transcripción completada!\n');

    // 8. Mostrar resultado completo
    console.log('🎯 RESULTADO FINAL:');
    console.log('==================');
    console.log(`🎬 Título: "${metadata.title || 'Sin título'}"`);
    console.log(`📝 Descripción: "${metadata.description || 'Sin descripción'}"`);
    console.log(`👤 Usuario: @${metadata.uploader || 'ac2ality'}`);
    console.log(`⏱️ Duración: ${metadata.duration || 0} segundos`);
    console.log(`👀 Views: ${metadata.view_count || 'N/A'}`);
    console.log(`❤️ Likes: ${metadata.like_count || 'N/A'}`);

    console.log('\n🎤 TRANSCRIPCIÓN COMPLETA:');
    console.log('==========================');
    console.log(`"${transcription}"`);

    // 9. Generar extracted_text como lo haría el sistema
    console.log('\n📄 EXTRACTED_TEXT GENERADO:');
    console.log('===========================');
    
    const extractedText = `Video de tiktok:
Título: ${metadata.title || 'Sin título'}
Descripción: ${metadata.description || 'Sin descripción'}
Canal/Usuario: @${metadata.uploader || 'ac2ality'}
Duración: ${Math.floor((metadata.duration || 0) / 60)}:${String((metadata.duration || 0) % 60).padStart(2, '0')}
Visualizaciones: ${metadata.view_count || 'N/A'}
Fecha de subida: ${metadata.upload_date || 'N/A'}
URL original: ${tiktokUrl}
Plataforma: tiktok

--- TRANSCRIPCIÓN DEL AUDIO ---
${transcription}
--- FIN DE TRANSCRIPCIÓN ---`;

    console.log(extractedText);

    console.log('\n🤖 PARA LA IA:');
    console.log('==============');
    console.log('✅ La IA ahora sabría EXACTAMENTE lo que dice @ac2ality');
    console.log('✅ Puede citar frases específicas del video');
    console.log('✅ Entiende el contexto completo');
    console.log('✅ Conoce tanto metadatos como contenido hablado');

    console.log('\n💾 EN LA BASE DE DATOS:');
    console.log('======================');
    console.log('- Tabla: media');
    console.log('- Campo extracted_text: [Texto completo arriba]');
    console.log('- Campo metadata: [JSON con metadatos]');
    console.log('- Campo image_url: [URL del video en Supabase]');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('API key')) {
      console.log('💡 Problema con OpenAI API key');
    } else if (error.message.includes('quota')) {
      console.log('💡 Límite de OpenAI alcanzado');
    } else if (error.message.includes('audio')) {
      console.log('💡 Problema procesando audio');
    } else {
      console.log('💡 Error técnico - revisar logs');
    }
  } finally {
    // Limpiar archivos
    console.log('\n🧹 Limpiando archivos temporales...');
    try {
      if (videoPath && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
        console.log('✅ Video eliminado');
      }
      if (audioPath && fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
        console.log('✅ Audio eliminado');
      }
      
      // Limpiar otros archivos del timestamp
      const tempDir = './temp_downloads';
      if (fs.existsSync(tempDir)) {
        const allFiles = fs.readdirSync(tempDir);
        allFiles.forEach(file => {
          if (file.includes('tiktok_')) {
            fs.unlinkSync(path.join(tempDir, file));
          }
        });
      }
      
    } catch (cleanupError) {
      console.warn('⚠️ Error limpiando:', cleanupError.message);
    }
  }
}

console.log('🚀 Iniciando transcripción completa...\n');
transcribeCompleteTikTok();
