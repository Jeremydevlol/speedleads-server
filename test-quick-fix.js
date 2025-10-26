#!/usr/bin/env node

/**
 * Test rápido para verificar que el comando yt-dlp funciona
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

console.log('🧪 TEST RÁPIDO - Comando yt-dlp corregido');
console.log('========================================\n');

const testUrl = 'https://youtu.be/T_KNzWdzsok';

async function testYtDlpCommand() {
  try {
    const outputPath = './temp_downloads/test_%(title)s.%(ext)s';
    
    // Comando corregido (sin formato problemático)
    const ytDlpCommand = [
      'yt-dlp',
      '--no-playlist',
      '--extract-flat', 'false',
      '--write-info-json',
      '--format', 'best',
      '--output', `"${outputPath}"`,
      `"${testUrl}"`
    ].join(' ');

    console.log('🔧 Comando a ejecutar:');
    console.log(ytDlpCommand);
    console.log('');

    console.log('📥 Ejecutando descarga de prueba...');
    const { stdout, stderr } = await execAsync(ytDlpCommand, {
      timeout: 60000,
      maxBuffer: 1024 * 1024 * 10
    });

    console.log('✅ ¡Comando ejecutado exitosamente!');
    if (stdout) {
      console.log('📋 Salida:', stdout.substring(0, 200) + '...');
    }
    if (stderr) {
      console.log('⚠️ Advertencias:', stderr.substring(0, 200) + '...');
    }

    console.log('\n🎉 RESULTADO: El comando yt-dlp ahora funciona correctamente');
    console.log('✅ El servidor puede procesar URLs de video');

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.message.includes('=720]/best')) {
      console.log('💡 Aún hay problema con el formato - necesita más ajustes');
    } else {
      console.log('💡 Error diferente - revisar logs');
    }
  }
}

testYtDlpCommand();
