#!/usr/bin/env node

/**
 * Test completo: Descarga + Transcripción del YouTube proporcionado
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

console.log('🎬 TEST YOUTUBE - Descarga + Transcripción');
console.log('=========================================\n');

const youtubeUrl = 'https://youtu.be/T_KNzWdzsok?si=5MEDz1VJKMfcHrJ8';

async function transcribeYouTube() {
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

    // 3. Descargar video de YouTube
    console.log('📥 Descargando video de YouTube...');
    console.log(`🔗 URL: ${youtubeUrl}\n`);
    
    const timestamp = Date.now();
    const outputPath = path.join(tempDir, `youtube_${timestamp}.%(ext)s`);
    
    // Comando optimizado para YouTube
    const ytDlpCommand = `yt-dlp --no-playlist --write-info-json --format "best[height<=720]/best" -o "${outputPath}" "${youtubeUrl}"`;
    
    console.log('🔧 Descargando...');
    const { stdout } = await execAsync(ytDlpCommand, {
      timeout: 120000, // 2 minutos para YouTube
      maxBuffer: 1024 * 1024 * 50 // 50MB buffer para videos más grandes
    });

    console.log('✅ Video de YouTube descargado');

    // 4. Encontrar archivo de video
    const files = fs.readdirSync(tempDir).filter(file => 
      file.includes(`youtube_${timestamp}`) && 
      (file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mkv'))
    );

    if (files.length === 0) {
      throw new Error('No se encontró archivo de video');
    }

    videoPath = path.join(tempDir, files[0]);
    const videoStats = fs.statSync(videoPath);
    console.log(`📁 Video: ${files[0]}`);
    console.log(`📊 Tamaño: ${(videoStats.size / 1024 / 1024).toFixed(2)} MB`);

    // 5. Leer metadatos de YouTube
    const infoFile = fs.readdirSync(tempDir).find(f => 
      f.includes(`youtube_${timestamp}`) && f.endsWith('.info.json')
    );

    let metadata = {};
    if (infoFile) {
      const infoPath = path.join(tempDir, infoFile);
      metadata = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
      
      console.log('\n📋 METADATOS DEL VIDEO:');
      console.log('======================');
      console.log(`🎬 Título: "${metadata.title}"`);
      console.log(`📺 Canal: ${metadata.uploader || metadata.channel}`);
      console.log(`⏱️ Duración: ${Math.floor(metadata.duration / 60)}:${String(metadata.duration % 60).padStart(2, '0')}`);
      console.log(`👀 Visualizaciones: ${metadata.view_count?.toLocaleString() || 'N/A'}`);
      console.log(`📅 Subido: ${metadata.upload_date || 'N/A'}`);
      
      if (metadata.description && metadata.description.length > 0) {
        const shortDesc = metadata.description.substring(0, 200);
        console.log(`📝 Descripción: "${shortDesc}${metadata.description.length > 200 ? '...' : ''}"`);
      }
    }

    // 6. Extraer audio
    console.log('\n🎵 Extrayendo audio...');
    audioPath = videoPath.replace(/\.[^/.]+$/, '.wav');
    
    const ffmpegCommand = `ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}" -y`;
    await execAsync(ffmpegCommand, { timeout: 60000 });
    
    const audioStats = fs.statSync(audioPath);
    console.log(`✅ Audio extraído: ${(audioStats.size / 1024).toFixed(2)} KB`);

    // 7. Verificar duración del audio para Whisper (máximo 25MB)
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (audioStats.size > maxSize) {
      console.log('⚠️ Audio muy grande para Whisper, cortando a los primeros 10 minutos...');
      
      const shortAudioPath = audioPath.replace('.wav', '_short.wav');
      const cutCommand = `ffmpeg -i "${audioPath}" -t 600 -acodec pcm_s16le -ar 16000 -ac 1 "${shortAudioPath}" -y`;
      await execAsync(cutCommand, { timeout: 30000 });
      
      // Reemplazar con el audio cortado
      fs.unlinkSync(audioPath);
      fs.renameSync(shortAudioPath, audioPath);
      
      const newAudioStats = fs.statSync(audioPath);
      console.log(`✅ Audio cortado: ${(newAudioStats.size / 1024).toFixed(2)} KB (primeros 10 min)`);
    }

    // 8. Transcribir con OpenAI Whisper
    console.log('\n🎤 Transcribiendo con OpenAI Whisper...');
    console.log('⏳ Enviando audio a OpenAI...');
    
    const audioBuffer = fs.readFileSync(audioPath);
    
    const transcription = await openai.audio.transcriptions.create({
      file: new File([audioBuffer], 'audio.wav', { type: 'audio/wav' }),
      model: 'whisper-1',
      language: 'es', // Cambiar a 'en' si es en inglés
      response_format: 'text'
    });

    console.log('✅ Transcripción completada!\n');

    // 9. Mostrar resultado completo
    console.log('🎯 RESULTADO FINAL:');
    console.log('==================');
    console.log(`🎬 Título: "${metadata.title || 'Sin título'}"`);
    console.log(`📺 Canal: ${metadata.uploader || metadata.channel || 'Desconocido'}`);
    console.log(`⏱️ Duración: ${Math.floor((metadata.duration || 0) / 60)}:${String((metadata.duration || 0) % 60).padStart(2, '0')}`);
    console.log(`👀 Views: ${metadata.view_count?.toLocaleString() || 'N/A'}`);
    console.log(`📅 Fecha: ${metadata.upload_date || 'N/A'}`);

    console.log('\n🎤 TRANSCRIPCIÓN COMPLETA:');
    console.log('==========================');
    
    // Mostrar solo los primeros 500 caracteres para no saturar
    const shortTranscription = transcription.length > 500 
      ? transcription.substring(0, 500) + '...' 
      : transcription;
    
    console.log(`"${shortTranscription}"`);
    
    if (transcription.length > 500) {
      console.log(`\n📊 Transcripción completa: ${transcription.length} caracteres`);
      console.log('💡 (Mostrando solo primeros 500 caracteres)');
    }

    // 10. Generar extracted_text como lo haría el sistema
    console.log('\n📄 EXTRACTED_TEXT GENERADO:');
    console.log('===========================');
    
    const extractedText = `Video de youtube:
Título: ${metadata.title || 'Sin título'}
Descripción: ${metadata.description ? metadata.description.substring(0, 200) + '...' : 'Sin descripción'}
Canal/Usuario: ${metadata.uploader || metadata.channel || 'Desconocido'}
Duración: ${Math.floor((metadata.duration || 0) / 60)}:${String((metadata.duration || 0) % 60).padStart(2, '0')}
Visualizaciones: ${metadata.view_count?.toLocaleString() || 'N/A'}
Fecha de subida: ${metadata.upload_date || 'N/A'}
URL original: ${youtubeUrl}
Plataforma: youtube

--- TRANSCRIPCIÓN DEL AUDIO ---
${transcription}
--- FIN DE TRANSCRIPCIÓN ---`;

    console.log(`Texto generado: ${extractedText.length} caracteres`);

    console.log('\n🤖 PARA LA IA:');
    console.log('==============');
    console.log('✅ La IA ahora conoce TODO el contenido del video');
    console.log('✅ Puede citar frases específicas');
    console.log('✅ Entiende el contexto completo');
    console.log('✅ Conoce metadatos + contenido hablado');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('API key')) {
      console.log('💡 Problema con OpenAI API key');
    } else if (error.message.includes('quota')) {
      console.log('💡 Límite de OpenAI alcanzado');
    } else if (error.message.includes('private') || error.message.includes('unavailable')) {
      console.log('💡 Video privado o no disponible');
    } else if (error.message.includes('timeout')) {
      console.log('💡 Timeout - video muy largo o conexión lenta');
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
          if (file.includes('youtube_')) {
            fs.unlinkSync(path.join(tempDir, file));
          }
        });
      }
      
    } catch (cleanupError) {
      console.warn('⚠️ Error limpiando:', cleanupError.message);
    }
  }
}

console.log('🚀 Iniciando transcripción de YouTube...\n');
transcribeYouTube();
