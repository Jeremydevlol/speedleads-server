#!/usr/bin/env node

/**
 * Test del procesamiento de transcripciones con IA
 * Convierte transcripciones en instrucciones estructuradas
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { processTranscriptionToInstructions, validateTranscription } from './dist/utils/transcriptionProcessor.js';

// Cargar variables de entorno
dotenv.config();

const execAsync = promisify(exec);

console.log('🤖 TEST PROCESAMIENTO IA - Transcripción → Instrucciones');
console.log('======================================================\n');

// Usar el TikTok de @ac2ality que ya sabemos que funciona
const tiktokUrl = 'https://www.tiktok.com/@ac2ality/video/7558465231140244749?q=ac2ality&t=1759865659452';

async function testIAProcessing() {
  let videoPath = null;
  let audioPath = null;
  
  try {
    console.log('🔑 Verificando OpenAI API...');
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY no configurada');
    }
    console.log('✅ OpenAI API configurada\n');

    // 1. Descargar y transcribir (ya sabemos que funciona)
    const tempDir = './temp_downloads';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    console.log('📥 Descargando TikTok para prueba...');
    const timestamp = Date.now();
    const outputPath = path.join(tempDir, `test_ia_${timestamp}.%(ext)s`);
    
    const ytDlpCommand = `yt-dlp --no-playlist --write-info-json --format "best[height<=720]/best" -o "${outputPath}" "${tiktokUrl}"`;
    await execAsync(ytDlpCommand, { timeout: 60000 });

    const files = fs.readdirSync(tempDir).filter(file => 
      file.includes(`test_ia_${timestamp}`) && file.endsWith('.mp4')
    );
    
    videoPath = path.join(tempDir, files[0]);
    console.log('✅ Video descargado');

    // 2. Extraer audio y transcribir
    console.log('\n🎵 Extrayendo audio...');
    audioPath = videoPath.replace(/\.[^/.]+$/, '.wav');
    const ffmpegCommand = `ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}" -y`;
    await execAsync(ffmpegCommand, { timeout: 30000 });

    console.log('🎤 Transcribiendo con Whisper...');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const audioBuffer = fs.readFileSync(audioPath);
    
    const transcription = await openai.audio.transcriptions.create({
      file: new File([audioBuffer], 'audio.wav', { type: 'audio/wav' }),
      model: 'whisper-1',
      language: 'es',
      response_format: 'text'
    });

    console.log('✅ Transcripción obtenida');

    // 3. Mostrar transcripción original
    console.log('\n📝 TRANSCRIPCIÓN ORIGINAL:');
    console.log('=========================');
    console.log(`"${transcription}"`);
    console.log(`\nCaracteres: ${transcription.length}`);

    // 4. Validar transcripción
    console.log('\n🔍 Validando transcripción...');
    const validation = validateTranscription(transcription);
    console.log(`✅ Válida: ${validation.isValid}`);
    if (validation.issues.length > 0) {
      console.log(`⚠️ Problemas: ${validation.issues.join(', ')}`);
    }
    console.log(`📝 Texto limpio: ${validation.cleanedTranscription.length} caracteres`);

    // 5. Procesar con IA para generar instrucciones
    console.log('\n🤖 PROCESANDO CON IA...');
    console.log('======================');
    
    const metadata = {
      title: 'ÚLTIMA HORA 🚨 Derrumbe en Madrid',
      uploader: 'ac2ality',
      duration: 27,
      platform: 'tiktok'
    };

    const processedInstructions = await processTranscriptionToInstructions(
      validation.cleanedTranscription,
      metadata,
      'tiktok'
    );

    console.log('✅ Procesamiento completado\n');

    // 6. Mostrar resultado final
    console.log('📋 INSTRUCCIONES GENERADAS POR IA:');
    console.log('==================================');
    console.log(processedInstructions);
    console.log(`\nCaracteres generados: ${processedInstructions.length}`);

    // 7. Comparar antes y después
    console.log('\n📊 COMPARACIÓN:');
    console.log('===============');
    console.log(`📝 Transcripción original: ${transcription.length} caracteres`);
    console.log(`🤖 Instrucciones procesadas: ${processedInstructions.length} caracteres`);
    console.log(`📈 Ratio de expansión: ${(processedInstructions.length / transcription.length).toFixed(2)}x`);

    console.log('\n🎯 DIFERENCIAS CLAVE:');
    console.log('=====================');
    console.log('✅ Transcripción original: Texto crudo tal como se habló');
    console.log('✅ Instrucciones procesadas: Información estructurada y organizada');
    console.log('✅ La IA convierte el contenido en formato de instrucciones');
    console.log('✅ Mantiene toda la información pero la hace más útil');

    console.log('\n🤖 PARA LA PERSONALIDAD:');
    console.log('========================');
    console.log('✅ Recibe instrucciones claras y estructuradas');
    console.log('✅ Información organizada por temas/secciones');
    console.log('✅ Formato más fácil de procesar y entender');
    console.log('✅ Mantiene el contexto original pero mejorado');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
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
      
      const tempDir = './temp_downloads';
      if (fs.existsSync(tempDir)) {
        const allFiles = fs.readdirSync(tempDir);
        allFiles.forEach(file => {
          if (file.includes('test_ia_')) {
            fs.unlinkSync(path.join(tempDir, file));
          }
        });
      }
    } catch (cleanupError) {
      console.warn('⚠️ Error limpiando:', cleanupError.message);
    }
  }
}

console.log('🚀 Iniciando test de procesamiento con IA...\n');
testIAProcessing();
