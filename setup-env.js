#!/usr/bin/env node

/**
 * Script para configurar variables de entorno para Instagram
 * Uso: node setup-env.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function setupEnvironment() {
  console.log('🔧 Configurando variables de entorno para Instagram...\n');
  
  // Verificar si existe .env
  const envPath = path.join(__dirname, '.env');
  const envExamplePath = path.join(__dirname, '.env.example');
  
  if (!fs.existsSync(envPath)) {
    console.log('❌ No se encontró archivo .env');
    
    if (fs.existsSync(envExamplePath)) {
      console.log('📋 Copiando .env.example a .env...');
      fs.copyFileSync(envExamplePath, envPath);
      console.log('✅ Archivo .env creado desde .env.example');
    } else {
      console.log('📝 Creando archivo .env básico...');
      
      const basicEnv = `# Variables de entorno básicas
NODE_ENV=development
PORT=5001

# Base de datos (configurar en Render Dashboard)
DATABASE_URL=postgresql://username:password@localhost:5432/database_name

# JWT (configurar en Render Dashboard)
JWT_SECRET=tu_jwt_secret_muy_seguro_aqui

# OpenAI (configurar en Render Dashboard)
OPENAI_API_KEY=sk-tu_openai_api_key_aqui

# Supabase (configurar en Render Dashboard)
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...

# Google Calendar
GOOGLE_CLIENT_ID=tu_google_client_id
GOOGLE_CLIENT_SECRET=tu_google_client_secret

# URLs
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:5001

# Sesiones
SESSION_SECRET=tu_session_secret_muy_seguro
`;
      
      fs.writeFileSync(envPath, basicEnv);
      console.log('✅ Archivo .env básico creado');
    }
  } else {
    console.log('✅ Archivo .env ya existe');
  }
  
  // Verificar variables críticas
  console.log('\n🔍 Verificando variables de entorno críticas...');
  
  const requiredVars = [
    'DATABASE_URL',
    'JWT_SECRET', 
    'OPENAI_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  
  let missingVars = [];
  
  for (const varName of requiredVars) {
    if (!process.env[varName] || process.env[varName].includes('tu_') || process.env[varName].includes('configurar')) {
      missingVars.push(varName);
      console.log(`❌ ${varName}: No configurada o valor por defecto`);
    } else {
      console.log(`✅ ${varName}: Configurada`);
    }
  }
  
  if (missingVars.length > 0) {
    console.log('\n⚠️ Variables faltantes:');
    missingVars.forEach(varName => {
      console.log(`   - ${varName}`);
    });
    
    console.log('\n📋 Para configurar en Render Dashboard:');
    console.log('1. Ve a tu proyecto en Render');
    console.log('2. Ve a "Environment"');
    console.log('3. Agrega las variables faltantes');
    console.log('4. Redespliega el servicio');
    
    console.log('\n📋 Para desarrollo local:');
    console.log('1. Edita el archivo .env');
    console.log('2. Configura las variables con valores reales');
    console.log('3. Reinicia el servidor');
  } else {
    console.log('\n🎉 Todas las variables críticas están configuradas');
  }
  
  console.log('\n📚 Documentación:');
  console.log('- Supabase: https://supabase.com/dashboard');
  console.log('- OpenAI: https://platform.openai.com/api-keys');
  console.log('- Render: https://dashboard.render.com');
  
  return missingVars.length === 0;
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  setupEnvironment();
}

export default setupEnvironment;
