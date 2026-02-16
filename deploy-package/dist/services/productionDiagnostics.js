import { transcribeAudioBuffer } from './openaiService.js';
import fs from 'fs';
import path from 'path';

/**
 * Diagnóstico completo para problemas de audio en producción
 */
export async function diagnoseAudioIssues() {
    console.log('\n🔍 === DIAGNÓSTICO DE AUDIO EN PRODUCCIÓN ===\n');
    
    const issues = [];
    const warnings = [];
    
    // 1. Verificar variables de entorno
    console.log('1️⃣ Verificando variables de entorno...');
    
    const requiredEnvVars = {
        'OPENAI_API_KEY': process.env.OPENAI_API_KEY,
        'DEEPSEEK_API_KEY': process.env.DEEPSEEK_API_KEY
    };
    
    for (const [varName, value] of Object.entries(requiredEnvVars)) {
        if (!value) {
            issues.push(`❌ Variable ${varName} no está configurada`);
        } else if (value.length < 10) {
            issues.push(`❌ Variable ${varName} parece inválida (muy corta)`);
        } else {
            console.log(`✅ ${varName}: ${value.substring(0, 8)}...${value.slice(-4)}`);
        }
    }
    
    // 2. Verificar conectividad con OpenAI
    console.log('\n2️⃣ Verificando conectividad con OpenAI...');
    
    try {
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            timeout: 10000
        });
        
        const testResponse = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'Test' }],
            max_tokens: 5
        });
        
        if (testResponse.choices?.[0]?.message?.content) {
            console.log('✅ Conectividad con OpenAI OK');
        } else {
            issues.push('❌ Respuesta inválida de OpenAI');
        }
        
    } catch (error) {
        issues.push(`❌ Error conectando con OpenAI: ${error.message}`);
        console.error('Detalles del error OpenAI:', {
            code: error.code,
            status: error.status,
            type: error.type
        });
    }
    
    // 3. Test específico de Whisper
    console.log('\n3️⃣ Verificando Whisper API...');
    
    try {
        // Crear un buffer de audio de prueba (silencio de 1 segundo)
        const testAudioBuffer = createTestAudioBuffer();
        
        console.log('🎵 Creando audio de prueba para test...');
        console.log(`📊 Tamaño del buffer de prueba: ${testAudioBuffer.length} bytes`);
        
        const transcription = await transcribeAudioBuffer(testAudioBuffer, 'test-audio.wav');
        
        if (transcription !== null && transcription !== undefined) {
            console.log('✅ Whisper API responde correctamente');
            console.log(`📝 Transcripción de prueba: "${transcription}"`);
        } else {
            warnings.push('⚠️ Whisper responde pero con resultado vacío');
        }
        
    } catch (error) {
        issues.push(`❌ Error en Whisper API: ${error.message}`);
        console.error('Detalles del error Whisper:', error);
    }
    
    // 4. Verificar límites y cuotas
    console.log('\n4️⃣ Verificando límites de OpenAI...');
    
    try {
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        
        // Intentar obtener información de la cuenta (si está disponible)
        console.log('💳 Verificando estado de la cuenta...');
        // Nota: OpenAI no siempre expone esta información directamente
        
    } catch (error) {
        warnings.push(`⚠️ No se pudo verificar el estado de la cuenta: ${error.message}`);
    }
    
    // 5. Verificar formato de archivo soportado
    console.log('\n5️⃣ Verificando formatos de audio soportados...');
    
    const supportedFormats = ['ogg', 'mp3', 'wav', 'm4a', 'flac', 'webm'];
    console.log(`✅ Formatos soportados por Whisper: ${supportedFormats.join(', ')}`);
    
    // 6. Verificar memoria y recursos
    console.log('\n6️⃣ Verificando recursos del sistema...');
    
    const memoryUsage = process.memoryUsage();
    console.log('💾 Uso de memoria:');
    console.log(`   RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Heap Used: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Heap Total: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    
    if (memoryUsage.heapUsed / 1024 / 1024 > 500) {
        warnings.push('⚠️ Alto uso de memoria detectado');
    }
    
    // 7. Resumen del diagnóstico
    console.log('\n📋 === RESUMEN DEL DIAGNÓSTICO ===\n');
    
    if (issues.length === 0) {
        console.log('🎉 ¡No se encontraron problemas críticos!');
    } else {
        console.log('🚨 PROBLEMAS ENCONTRADOS:');
        issues.forEach(issue => console.log(`   ${issue}`));
    }
    
    if (warnings.length > 0) {
        console.log('\n⚠️ ADVERTENCIAS:');
        warnings.forEach(warning => console.log(`   ${warning}`));
    }
    
    // 8. Recomendaciones
    console.log('\n💡 RECOMENDACIONES PARA PRODUCCIÓN:');
    
    if (issues.some(i => i.includes('OPENAI_API_KEY'))) {
        console.log('   🔑 Verificar que OPENAI_API_KEY esté correctamente configurada');
        console.log('   🔑 Verificar que la API key tenga permisos para Whisper');
    }
    
    if (issues.some(i => i.includes('Whisper'))) {
        console.log('   🎵 Verificar que la cuenta de OpenAI tenga acceso a Whisper API');
        console.log('   🎵 Verificar que no se haya excedido la cuota mensual');
    }
    
    if (issues.some(i => i.includes('conexión'))) {
        console.log('   🌐 Verificar conectividad de red desde el servidor');
        console.log('   🌐 Verificar que no haya firewalls bloqueando OpenAI');
    }
    
    console.log('\n🔍 === FIN DEL DIAGNÓSTICO ===\n');
    
    return {
        issues,
        warnings,
        hasIssues: issues.length > 0,
        canProcessAudio: issues.length === 0
    };
}

/**
 * Crear un buffer de audio de prueba (WAV simple)
 */
function createTestAudioBuffer() {
    // Crear un WAV file header simple con 1 segundo de silencio
    const sampleRate = 16000;
    const duration = 1; // 1 segundo
    const numSamples = sampleRate * duration;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = numSamples * blockAlign;
    const fileSize = 44 + dataSize;
    
    const buffer = Buffer.alloc(fileSize);
    let offset = 0;
    
    // WAV Header
    buffer.write('RIFF', offset); offset += 4;
    buffer.writeUInt32LE(fileSize - 8, offset); offset += 4;
    buffer.write('WAVE', offset); offset += 4;
    buffer.write('fmt ', offset); offset += 4;
    buffer.writeUInt32LE(16, offset); offset += 4; // PCM format
    buffer.writeUInt16LE(1, offset); offset += 2; // Audio format
    buffer.writeUInt16LE(numChannels, offset); offset += 2;
    buffer.writeUInt32LE(sampleRate, offset); offset += 4;
    buffer.writeUInt32LE(byteRate, offset); offset += 4;
    buffer.writeUInt16LE(blockAlign, offset); offset += 2;
    buffer.writeUInt16LE(bitsPerSample, offset); offset += 2;
    buffer.write('data', offset); offset += 4;
    buffer.writeUInt32LE(dataSize, offset); offset += 4;
    
    // Audio data (silencio)
    for (let i = 0; i < numSamples; i++) {
        buffer.writeInt16LE(0, offset);
        offset += 2;
    }
    
    return buffer;
}

/**
 * Test específico de audio con un archivo real
 */
export async function testAudioFile(audioBuffer) {
    console.log('\n🎵 === TEST DE ARCHIVO DE AUDIO REAL ===\n');
    
    try {
        console.log(`📊 Tamaño del archivo: ${(audioBuffer.length / 1024).toFixed(2)} KB`);
        
        // Verificar que el buffer no esté vacío
        if (audioBuffer.length === 0) {
            throw new Error('Buffer de audio vacío');
        }
        
        // Verificar tamaño máximo
        if (audioBuffer.length > 25 * 1024 * 1024) {
            throw new Error('Archivo demasiado grande para Whisper (>25MB)');
        }
        
        // Intentar transcripción
        const startTime = Date.now();
        const transcription = await transcribeAudioBuffer(audioBuffer, 'real-audio.ogg');
        const endTime = Date.now();
        
        console.log(`⏱️ Tiempo de transcripción: ${endTime - startTime}ms`);
        console.log(`📝 Resultado: "${transcription}"`);
        console.log(`📏 Longitud de transcripción: ${transcription?.length || 0} caracteres`);
        
        return {
            success: true,
            transcription,
            duration: endTime - startTime
        };
        
    } catch (error) {
        console.error('❌ Error en test de audio:', error);
        return {
            success: false,
            error: error.message
        };
    }
} 