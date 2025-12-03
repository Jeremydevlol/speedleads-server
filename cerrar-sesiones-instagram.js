#!/usr/bin/env node

/**
 * Script para cerrar las sesiones de Instagram
 * Cierra las sesiones de sitify.io y Yokiespana757@gmail.com
 */

import { getOrCreateIGSession, removeIGSession, igSessions } from './dist/services/instagramService.js';
import fs from 'fs';
import path from 'path';

const TEST_USER_ID = '68eec7b4-8e52-462b-bb46-76d69985f09a';
const STATE_DIR = path.join(process.cwd(), 'storage', 'ig_state');

async function cerrarSesiones() {
  try {
    console.log('🔐 Cerrando sesiones de Instagram');
    console.log('═'.repeat(80));
    console.log(`👤 User ID: ${TEST_USER_ID}`);
    console.log(`🕐 Hora: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
    console.log('');
    
    // 1. Cerrar sesión desde el servicio si está activa
    if (igSessions.has(TEST_USER_ID)) {
      const session = igSessions.get(TEST_USER_ID);
      console.log(`📱 Sesión encontrada en memoria para usuario ${TEST_USER_ID}`);
      console.log(`   Username: ${session.username || 'N/A'}`);
      console.log(`   Logged: ${session.logged}`);
      console.log('');
      
      if (session.logged) {
        try {
          console.log('🔄 Cerrando sesión desde Instagram...');
          await session.logout();
          console.log('✅ Sesión cerrada exitosamente');
        } catch (logoutError) {
          console.log(`⚠️ Error cerrando sesión: ${logoutError.message}`);
          console.log('   Continuando con eliminación de archivos...');
        }
      }
      
      // Eliminar del Map
      removeIGSession(TEST_USER_ID);
      console.log('✅ Sesión eliminada del Map');
    } else {
      console.log('ℹ️ No hay sesión activa en memoria');
    }
    
    console.log('');
    
    // 2. Eliminar archivo de sesión si existe
    const sessionFile = path.join(STATE_DIR, `${TEST_USER_ID}.json`);
    if (fs.existsSync(sessionFile)) {
      try {
        fs.unlinkSync(sessionFile);
        console.log('✅ Archivo de sesión eliminado:', sessionFile);
      } catch (unlinkError) {
        console.log(`⚠️ Error eliminando archivo: ${unlinkError.message}`);
      }
    } else {
      console.log('ℹ️ No hay archivo de sesión guardado');
    }
    
    // 3. Eliminar archivo de challenge si existe
    const challengeFile = path.join(STATE_DIR, `${TEST_USER_ID}_challenge.json`);
    if (fs.existsSync(challengeFile)) {
      try {
        fs.unlinkSync(challengeFile);
        console.log('✅ Archivo de challenge eliminado:', challengeFile);
      } catch (unlinkError) {
        // Ignorar si no existe
      }
    }
    
    console.log('');
    console.log('═'.repeat(80));
    console.log('✅ PROCESO COMPLETADO');
    console.log('═'.repeat(80));
    console.log('');
    console.log('📊 Estado final:');
    console.log(`   Sesión en memoria: ${igSessions.has(TEST_USER_ID) ? 'SÍ' : 'NO'}`);
    console.log(`   Archivo de sesión: ${fs.existsSync(sessionFile) ? 'SÍ' : 'NO'}`);
    console.log('');
    
  } catch (error) {
    console.error('❌ Error cerrando sesiones:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Ejecutar
cerrarSesiones().then(() => {
  console.log('✨ Sesiones cerradas correctamente');
  process.exit(0);
}).catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});



