#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5001';
const WEBSITES_ENDPOINT = `${BASE_URL}/api/websites`;

// Token de administrador o usuario (configurar en .env)
const AUTH_TOKEN = process.env.ADMIN_TOKEN || process.env.TEST_TOKEN;

console.log('🌍 Script de Traducción de Websites Existentes');
console.log('============================================\n');

/**
 * Obtiene todos los websites de un usuario
 */
async function getAllWebsites() {
  try {
    const response = await axios.get(WEBSITES_ENDPOINT, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });

    return response.data.websites || [];
  } catch (error) {
    console.error('❌ Error obteniendo websites:', error.response?.data || error.message);
    return [];
  }
}

/**
 * Traduce un website específico
 */
async function translateWebsite(websiteId, targetLanguage, options = {}) {
  const { sourceLanguage = 'es', createNew = true, websiteName = 'Website' } = options;
  
  console.log(`🌍 Traduciendo ${websiteName} (ID: ${websiteId}) a ${targetLanguage}...`);
  
  try {
    const response = await axios.post(`${WEBSITES_ENDPOINT}/${websiteId}/translate`, {
      targetLanguage,
      sourceLanguage,
      createNew
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      timeout: 60000 // 60 segundos para websites complejos
    });

    if (response.data.success) {
      if (createNew) {
        console.log(`✅ Nueva copia traducida creada:`);
        console.log(`   - ID original: ${response.data.originalId}`);
        console.log(`   - ID nuevo: ${response.data.newId}`);
        console.log(`   - Nuevo slug: ${response.data.newSlug}`);
      } else {
        console.log(`✅ Website actualizado con traducción:`);
        console.log(`   - ID: ${response.data.websiteId}`);
        console.log(`   - Actualizado: ${response.data.updated_at}`);
      }
      console.log(`   - Idioma: ${response.data.sourceLanguage} → ${response.data.targetLanguage}\n`);
      
      return response.data;
    } else {
      console.log(`❌ Error: ${response.data.error}\n`);
      return null;
    }
  } catch (error) {
    console.log(`❌ Error traduciendo ${websiteName}:`, error.response?.data || error.message);
    console.log();
    return null;
  }
}

/**
 * Traduce múltiples websites a un idioma específico
 */
async function translateMultipleWebsites(websites, targetLanguage, options = {}) {
  const results = {
    successful: [],
    failed: [],
    total: websites.length
  };

  console.log(`🚀 Iniciando traducción de ${websites.length} websites a ${targetLanguage}...\n`);

  for (let i = 0; i < websites.length; i++) {
    const website = websites[i];
    console.log(`[${i + 1}/${websites.length}] ▶️  Procesando "${website.businessName}"...`);
    
    const result = await translateWebsite(website.id, targetLanguage, {
      ...options,
      websiteName: website.businessName
    });

    if (result) {
      results.successful.push({
        original: website,
        translation: result
      });
    } else {
      results.failed.push(website);
    }

    // Pausa entre traducciones para no sobrecargar la API
    if (i < websites.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return results;
}

/**
 * Crear versiones multilingües de todos los websites
 */
async function createMultilingualVersions(websites, languages, options = {}) {
  const allResults = {};

  for (const language of languages) {
    console.log(`\n🌍 === TRADUCIENDO A ${language.toUpperCase()} ===`);
    
    const results = await translateMultipleWebsites(websites, language, {
      ...options,
      createNew: true // Siempre crear copias para multilingüe
    });

    allResults[language] = results;

    console.log(`\n📊 Resultados para ${language}:`);
    console.log(`   ✅ Exitosos: ${results.successful.length}`);
    console.log(`   ❌ Fallidos: ${results.failed.length}`);
    console.log(`   📈 Tasa de éxito: ${((results.successful.length / results.total) * 100).toFixed(1)}%`);

    // Pausa entre idiomas
    if (languages.indexOf(language) < languages.length - 1) {
      console.log('\n⏳ Pausa entre idiomas...');
      await new Promise(resolve => setTimeout(resolve, 5001));
    }
  }

  return allResults;
}

/**
 * Mostrar resumen final
 */
function showFinalSummary(allResults) {
  console.log('\n🎉 ==========================================');
  console.log('📊 RESUMEN FINAL DE TRADUCCIONES');
  console.log('==========================================');

  let totalTranslations = 0;
  let totalSuccessful = 0;
  let totalFailed = 0;

  for (const [language, results] of Object.entries(allResults)) {
    console.log(`\n🌍 ${language.toUpperCase()}:`);
    console.log(`   ✅ Exitosos: ${results.successful.length}`);
    console.log(`   ❌ Fallidos: ${results.failed.length}`);
    
    totalTranslations += results.total;
    totalSuccessful += results.successful.length;
    totalFailed += results.failed.length;

    if (results.successful.length > 0) {
      console.log('   📝 Nuevos websites creados:');
      results.successful.slice(0, 3).forEach(item => {
        console.log(`      - ${item.translation.newSlug} (${item.original.businessName})`);
      });
      if (results.successful.length > 3) {
        console.log(`      ... y ${results.successful.length - 3} más`);
      }
    }
  }

  console.log(`\n🎯 TOTALES:`);
  console.log(`   📊 Total de traducciones intentadas: ${totalTranslations}`);
  console.log(`   ✅ Total exitosas: ${totalSuccessful}`);
  console.log(`   ❌ Total fallidas: ${totalFailed}`);
  console.log(`   📈 Tasa de éxito global: ${((totalSuccessful / totalTranslations) * 100).toFixed(1)}%`);
  
  console.log('\n🚀 ¡Proceso de traducción masiva completado!');
}

/**
 * Función principal
 */
async function main() {
  console.log(`🎯 Servidor: ${BASE_URL}`);
  console.log(`🔑 Token configurado: ${AUTH_TOKEN ? '✅ SÍ' : '❌ NO'}\n`);

  if (!AUTH_TOKEN || AUTH_TOKEN === 'your_test_jwt_token_here') {
    console.log('❌ ERROR: No hay token de autenticación configurado');
    console.log('   Configura ADMIN_TOKEN o TEST_TOKEN en tu archivo .env');
    console.log('   Ejemplo: ADMIN_TOKEN=tu_jwt_token_aqui');
    return;
  }

  // Obtener todos los websites existentes
  console.log('📋 Obteniendo websites existentes...');
  const websites = await getAllWebsites();

  if (websites.length === 0) {
    console.log('⚠️  No se encontraron websites para traducir');
    return;
  }

  console.log(`✅ Encontrados ${websites.length} websites:`);
  websites.forEach((site, index) => {
    console.log(`   ${index + 1}. ${site.businessName} (${site.slug})`);
  });

  console.log('\n🤔 ¿Qué quieres hacer?');
  console.log('1. Traducir todos a UN idioma específico');
  console.log('2. Crear versiones multilingües (varios idiomas)');
  console.log('3. Traducir UN website específico');
  
  // Para este script, vamos a crear versiones multilingües por defecto
  // Puedes modificar esto según tus necesidades

  const targetLanguages = ['en', 'fr', 'de']; // Inglés, Francés, Alemán
  console.log(`\n🎯 Creando versiones multilingües en: ${targetLanguages.join(', ')}`);
  
  const allResults = await createMultilingualVersions(websites, targetLanguages, {
    sourceLanguage: 'es',
    createNew: true // Crear copias, no actualizar originales
  });

  showFinalSummary(allResults);
}

// Configuración para diferentes modos de uso
const MODES = {
  single: async (websiteId, targetLanguage) => {
    const websites = await getAllWebsites();
    const website = websites.find(w => w.id === websiteId);
    
    if (!website) {
      console.log(`❌ Website con ID ${websiteId} no encontrado`);
      return;
    }

    await translateWebsite(websiteId, targetLanguage, {
      websiteName: website.businessName,
      createNew: true
    });
  },

  bulk: async (targetLanguage) => {
    const websites = await getAllWebsites();
    await translateMultipleWebsites(websites, targetLanguage, {
      createNew: true
    });
  },

  multilingual: main
};

// Detectar argumentos de línea de comandos
const args = process.argv.slice(2);

if (args.length > 0) {
  const mode = args[0];
  
  if (mode === 'single' && args.length >= 3) {
    // node translate-existing-websites.js single WEBSITE_ID LANGUAGE
    MODES.single(args[1], args[2]);
  } else if (mode === 'bulk' && args.length >= 2) {
    // node translate-existing-websites.js bulk LANGUAGE
    MODES.bulk(args[1]);
  } else {
    console.log('📖 Uso del script:');
    console.log('  node translate-existing-websites.js                    # Modo multilingüe interactivo');
    console.log('  node translate-existing-websites.js single ID LANG     # Traducir website específico');
    console.log('  node translate-existing-websites.js bulk LANG          # Traducir todos a un idioma');
    console.log('\nEjemplos:');
    console.log('  node translate-existing-websites.js single abc123 en');
    console.log('  node translate-existing-websites.js bulk fr');
  }
} else {
  // Modo interactivo por defecto
  main().catch(console.error);
}

// Manejar interrupciones
process.on('SIGINT', () => {
  console.log('\n\n👋 Script interrumpido por el usuario');
  console.log('🔄 Las traducciones ya completadas se mantienen en la base de datos');
  process.exit(0);
});

export { createMultilingualVersions, translateMultipleWebsites, translateWebsite };
