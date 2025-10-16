#!/usr/bin/env node

/**
 * Test completo: Descarga + Transcripción del Instagram Reel proporcionado
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

console.log('🎬 TEST INSTAGRAM REEL - Descarga + Transcripción');
console.log('===============================================\n');

const instagramUrl = 'https://www.instagram.com/reel/DPhQrknkyph/?igsh=djRjaWkxYXdvZGtl';

async function transcribeInstagramReel() {
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

    // 3. Descargar Instagram Reel
    console.log('📥 Descargando Instagram Reel...');
    console.log(`🔗 URL: ${instagramUrl}\n`);
    
    const timestamp = Date.now();
    const outputPath = path.join(tempDir, `instagram_${timestamp}.%(ext)s`);
    
    // Comando optimizado para Instagram
    const ytDlpCommand = `yt-dlp --no-playlist --write-info-json --format "best[height<=720]/best" -o "${outputPath}" "${instagramUrl}"`;
    
    console.log('🔧 Descargando...');
    const { stdout, stderr } = await execAsync(ytDlpCommand, {
      timeout: 120000, // 2 minutos timeout
      maxBuffer: 1024 * 1024 * 50 // 50MB buffer
    });

    console.log('✅ Instagram Reel descargado');
    if (stderr && stderr.includes('WARNING')) {
      console.log('⚠️ Advertencias:', stderr);
    }

    // 4. Encontrar archivo de video
    const files = fs.readdirSync(tempDir).filter(file => 
      file.includes(`instagram_${timestamp}`) && 
      (file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mkv'))
    );

    if (files.length === 0) {
      throw new Error('No se encontró archivo de video');
    }

    videoPath = path.join(tempDir, files[0]);
    const videoStats = fs.statSync(videoPath);
    console.log(`📁 Video: ${files[0]}`);
    console.log(`📊 Tamaño: ${(videoStats.size / 1024 / 1024).toFixed(2)} MB`);

    // 5. Leer metadatos de Instagram
    const infoFile = fs.readdirSync(tempDir).find(f => 
      f.includes(`instagram_${timestamp}`) && f.endsWith('.info.json')
    );

    let metadata = {};
    if (infoFile) {
      const infoPath = path.join(tempDir, infoFile);
      metadata = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
      
      console.log('\n📋 METADATOS DEL REEL:');
      console.log('=====================');
      console.log(`🎬 Título: "${metadata.title || 'Sin título'}"`);
      console.log(`👤 Usuario: @${metadata.uploader || metadata.channel || 'Desconocido'}`);
      console.log(`⏱️ Duración: ${Math.floor((metadata.duration || 0) / 60)}:${String((metadata.duration || 0) % 60).padStart(2, '0')}`);
      console.log(`👀 Visualizaciones: ${metadata.view_count?.toLocaleString() || 'N/A'}`);
      console.log(`❤️ Likes: ${metadata.like_count?.toLocaleString() || 'N/A'}`);
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

    // 7. Verificar si hay contenido de audio significativo
    if (audioStats.size < 5000) {
      console.log('⚠️ Audio muy pequeño - puede ser solo música/efectos sin voz');
      console.log('💡 Continuando con transcripción...');
    }

    // 8. Transcribir con OpenAI Whisper
    console.log('\n🎤 Transcribiendo con OpenAI Whisper...');
    console.log('⏳ Enviando audio a OpenAI...');
    
    const audioBuffer = fs.readFileSync(audioPath);
    
    const transcription = await openai.audio.transcriptions.create({
      file: new File([audioBuffer], 'audio.wav', { type: 'audio/wav' }),
      model: 'whisper-1',
      language: 'es', // Cambiar según el idioma detectado
      response_format: 'text'
    });

    console.log('✅ Transcripción completada!\n');

    // 9. Mostrar resultado completo
    console.log('🎯 RESULTADO FINAL:');
    console.log('==================');
    console.log(`🎬 Título: "${metadata.title || 'Sin título'}"`);
    console.log(`👤 Usuario: @${metadata.uploader || metadata.channel || 'Desconocido'}`);
    console.log(`⏱️ Duración: ${Math.floor((metadata.duration || 0) / 60)}:${String((metadata.duration || 0) % 60).padStart(2, '0')}`);
    console.log(`👀 Views: ${metadata.view_count?.toLocaleString() || 'N/A'}`);
    console.log(`❤️ Likes: ${metadata.like_count?.toLocaleString() || 'N/A'}`);
    console.log(`📅 Fecha: ${metadata.upload_date || 'N/A'}`);

    console.log('\n🎤 TRANSCRIPCIÓN COMPLETA:');
    console.log('==========================');
    
    if (transcription && transcription.trim().length > 0) {
      // Mostrar transcripción completa si no es muy larga
      if (transcription.length <= 500) {
        console.log(`"${transcription}"`);
      } else {
        console.log(`"${transcription.substring(0, 500)}..."`);
        console.log(`\n📊 Transcripción completa: ${transcription.length} caracteres`);
        console.log('💡 (Mostrando solo primeros 500 caracteres)');
      }
    } else {
      console.log('[Sin contenido de voz detectado - puede ser solo música/efectos]');
    }

    // 10. Generar extracted_text como lo haría el sistema
    console.log('\n📄 EXTRACTED_TEXT GENERADO:');
    console.log('===========================');
    
    const extractedText = `Video de instagram:
Título: ${metadata.title || 'Sin título'}
Descripción: ${metadata.description ? metadata.description.substring(0, 200) + (metadata.description.length > 200 ? '...' : '') : 'Sin descripción'}
Canal/Usuario: @${metadata.uploader || metadata.channel || 'Desconocido'}
Duración: ${Math.floor((metadata.duration || 0) / 60)}:${String((metadata.duration || 0) % 60).padStart(2, '0')}
Visualizaciones: ${metadata.view_count?.toLocaleString() || 'N/A'}
Likes: ${metadata.like_count?.toLocaleString() || 'N/A'}
Fecha de subida: ${metadata.upload_date || 'N/A'}
URL original: ${instagramUrl}
Plataforma: instagram

--- TRANSCRIPCIÓN DEL AUDIO ---
${transcription || '[Sin contenido de voz detectado]'}
--- FIN DE TRANSCRIPCIÓN ---`;

    console.log(`Texto generado: ${extractedText.length} caracteres`);

    console.log('\n🤖 PARA LA IA:');
    console.log('==============');
    if (transcription && transcription.trim().length > 0) {
      console.log('✅ La IA conoce TODO el contenido hablado del Reel');
      console.log('✅ Puede citar frases específicas');
      console.log('✅ Entiende el contexto completo');
    } else {
      console.log('✅ La IA conoce los metadatos del Reel');
      console.log('✅ Sabe que es contenido visual/musical sin voz');
      console.log('✅ Puede describir el tipo de contenido');
    }
    console.log('✅ Conoce metadatos + cualquier contenido hablado');

    console.log('\n🎉 RESULTADO INSTAGRAM:');
    console.log('======================');
    console.log('✅ Sistema funciona con Instagram Reels');
    console.log('✅ Descarga exitosa');
    console.log('✅ Extracción de audio funcional');
    console.log('✅ Transcripción procesada');
    console.log('✅ Metadatos completos obtenidos');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('API key')) {
      console.log('💡 Problema con OpenAI API key');
    } else if (error.message.includes('quota')) {
      console.log('💡 Límite de OpenAI alcanzado');
    } else if (error.message.includes('private') || error.message.includes('unavailable')) {
      console.log('💡 Reel privado o no disponible públicamente');
    } else if (error.message.includes('login') || error.message.includes('Sign up')) {
      console.log('💡 Instagram requiere autenticación para este contenido');
    } else if (error.message.includes('timeout')) {
      console.log('💡 Timeout - conexión lenta o contenido muy grande');
    } else {
      console.log('💡 Error técnico - revisar logs arriba');
    }
    
    console.log('\n📋 NOTA: Instagram puede requerir autenticación para algunos Reels');
    console.log('El sistema funcionaría perfectamente con contenido público accesible');
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
          if (file.includes('instagram_')) {
            fs.unlinkSync(path.join(tempDir, file));
          }
        });
      }
      
    } catch (cleanupError) {
      console.warn('⚠️ Error limpiando:', cleanupError.message);
    }
  }
}

console.log('🚀 Iniciando transcripción de Instagram Reel...\n');
transcribeInstagramReel();
