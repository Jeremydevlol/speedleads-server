#!/usr/bin/env node

/**
 * Script de prueba para login de Instagram - yokipijamas
 */

import { IgApiClient } from 'instagram-private-api';

async function testLogin() {
  const username = 'yokipijamas';
  const password = 'Yoki2024';
  
  console.log('═'.repeat(80));
  console.log('🔐 PRUEBA DE LOGIN DIRECTA - yokipijamas');
  console.log('═'.repeat(80));
  console.log(`📧 Usuario: ${username}`);
  console.log(`🔑 Password: ${'*'.repeat(password.length)}`);
  console.log(`🕐 Hora: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
  console.log('');
  
  const ig = new IgApiClient();
  
  // Generar dispositivo
  ig.state.generateDevice(username);
  console.log(`📱 Dispositivo generado: ${ig.state.deviceString?.substring(0, 60)}...`);
  console.log('');
  
  // Simular delay humano
  console.log('⏳ Esperando 2-3 segundos (simular comportamiento humano)...');
  await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
  
  console.log('🔐 Intentando login...');
  console.log('');
  
  const startTime = Date.now();
  
  try {
    const loginResult = await ig.account.login(username, password);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('═'.repeat(80));
    console.log('✅ LOGIN EXITOSO');
    console.log('═'.repeat(80));
    console.log(`Usuario ID: ${loginResult.pk}`);
    console.log(`Username: ${loginResult.username}`);
    console.log(`Tiempo: ${duration} segundos`);
    
    // Obtener info del usuario
    const user = await ig.account.currentUser();
    console.log('');
    console.log('👤 Información del usuario:');
    console.log(`   Nombre: ${user.full_name || 'N/A'}`);
    console.log(`   Usuario: ${user.username}`);
    console.log(`   Seguidores: ${user.follower_count || 'N/A'}`);
    console.log(`   Siguiendo: ${user.following_count || 'N/A'}`);
    
    return true;
    
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('═'.repeat(80));
    console.log('❌ ERROR EN LOGIN');
    console.log('═'.repeat(80));
    console.log(`Tiempo hasta error: ${duration} segundos`);
    console.log(`Mensaje: ${error.message}`);
    console.log('');
    
    if (error.response) {
      const body = error.response.body || {};
      console.log('📋 Detalles del error de Instagram:');
      console.log(`   Error Type: ${body.error_type || 'N/A'}`);
      console.log(`   Status: ${body.status || 'N/A'}`);
      console.log(`   Invalid Credentials: ${body.invalid_credentials || false}`);
      console.log(`   Message: ${body.message || 'N/A'}`);
      console.log('');
      console.log('📦 Body completo:');
      console.log(JSON.stringify(body, null, 2));
    }
    
    // Detectar tipo de error
    if (error.name === 'IgLoginRequiredError') {
      console.log('⚠️ Tipo: Login requerido');
    } else if (error.name === 'IgCheckpointError') {
      console.log('⚠️ Tipo: Checkpoint/Challenge requerido');
      console.log('   URL:', error.url || 'N/A');
    } else if (error.name === 'IgLoginBadPasswordError') {
      console.log('⚠️ Tipo: Contraseña incorrecta');
    } else if (error.name === 'IgLoginInvalidUserError') {
      console.log('⚠️ Tipo: Usuario inválido');
    } else if (error.name === 'IgLoginTwoFactorRequiredError') {
      console.log('⚠️ Tipo: 2FA requerido');
    }
    
    return false;
  }
}

// Ejecutar
testLogin().then(success => {
  console.log('');
  console.log(success ? '✅ Test completado exitosamente' : '❌ Test fallido');
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Error fatal:', error);
  process.exit(1);
});

