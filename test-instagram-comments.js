#!/usr/bin/env node

/**
 * Script de prueba para extraer comentarios de Instagram
 * Prueba todas las funcionalidades del endpoint de comentarios
 */

const SERVER_URL = 'http://localhost:5001';
const JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsImtpZCI6ImNCZCtEOGgwNDdMdklmS2QiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2xpZnRsdmJ1Z3VtcHhobWp2bXRiLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiIyNjE0ZGE2MS0yOWY3LTRmMmUtOWE5Yi1kY2I4ZTFiYmRhZTciLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzYyODkxMzk5LCJpYXQiOjE3NjI4ODc3OTksImVtYWlsIjoianVhbkBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl0sInJvbGUiOiJhZG1pbiJ9LCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsIjoianVhbkBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZnVsbF9uYW1lIjoiSnVhbiIsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwicm9sZSI6ImFkbWluIiwic3ViIjoiMjYxNGRhNjEtMjlmNy00ZjJlLTlhOWItZGNiOGUxYmJkYWU3IiwidXNlcm5hbWUiOiJqdWFuIn0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3NjI4ODc3OTl9XSwic2Vzc2lvbl9pZCI6IjA0OWYxOGVjLTdmMDktNDAyOC1iNDVhLTQyMWQ4NWNjZjVjNyIsImlzX2Fub255bW91cyI6ZmFsc2V9.bQF_Ja55Cja60SKmofukU5UpQP_74-et7aqvVdIaCac';

// Credenciales de Instagram
const IG_USERNAME = 'dimeroxsd';
const IG_PASSWORD = 'Dios2025@';

// Posts de prueba
const TEST_POSTS = [
  {
    name: 'Post propio',
    url: 'https://www.instagram.com/p/DQ7YnCiAj11/',
    description: 'Post de la cuenta @dimeroxsd'
  },
  {
    name: 'Reel de @tomasgraciaoficial',
    url: 'https://www.instagram.com/reel/DNBEZKjtbAf/',
    description: 'Reel con 124 comentarios'
  },
  {
    name: 'Post de cuenta pública grande',
    url: 'https://www.instagram.com/p/C_ejemplo/',
    description: 'Post de cuenta muy seguida'
  }
];

console.log('🚀 Script de Prueba de Instagram - Extracción de Comentarios\n');
console.log('=' .repeat(70));

async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    return { success: response.ok, status: response.status, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testLogin() {
  console.log('\n📝 PASO 1: Login en Instagram');
  console.log('-'.repeat(70));
  
  const result = await makeRequest(`${SERVER_URL}/api/instagram/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${JWT_TOKEN}`
    },
    body: JSON.stringify({
      username: IG_USERNAME,
      password: IG_PASSWORD
    })
  });
  
  if (result.success) {
    console.log('✅ Login exitoso');
    console.log(`   Usuario: ${IG_USERNAME}`);
    return true;
  } else {
    console.log('❌ Login fallido');
    console.log(`   Error: ${result.data?.error || result.error}`);
    return false;
  }
}

async function testStatus() {
  console.log('\n📊 PASO 2: Verificar estado de sesión');
  console.log('-'.repeat(70));
  
  const result = await makeRequest(`${SERVER_URL}/api/instagram/status`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${JWT_TOKEN}`
    }
  });
  
  if (result.success && result.data?.connected) {
    console.log('✅ Sesión activa');
    console.log(`   Usuario: ${result.data.username || 'N/A'}`);
    console.log(`   Conectado: ${result.data.connected}`);
    return true;
  } else {
    console.log('❌ No hay sesión activa');
    return false;
  }
}

async function testExtractComments(postUrl, postName) {
  console.log(`\n💬 Extrayendo comentarios: ${postName}`);
  console.log('-'.repeat(70));
  console.log(`   URL: ${postUrl}`);
  
  const result = await makeRequest(`${SERVER_URL}/api/instagram/comments/from-post`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${JWT_TOKEN}`
    },
    body: JSON.stringify({
      postUrl: postUrl,
      limit: 50
    })
  });
  
  if (result.success) {
    const { comments, post_info, extracted_count, total_comments } = result.data;
    
    console.log('✅ Extracción exitosa');
    console.log(`   Post de: @${post_info?.owner?.username || 'unknown'}`);
    console.log(`   Caption: ${(post_info?.caption || 'Sin caption').substring(0, 50)}...`);
    console.log(`   Likes: ${post_info?.like_count || 0}`);
    console.log(`   Total comentarios: ${total_comments || 0}`);
    console.log(`   Comentarios extraídos: ${extracted_count || 0}`);
    
    if (comments && comments.length > 0) {
      console.log(`\n   📝 Primeros 3 comentarios:`);
      comments.slice(0, 3).forEach((comment, i) => {
        console.log(`      ${i + 1}. @${comment.username}: ${comment.comment_text.substring(0, 60)}...`);
      });
    } else {
      console.log('   ⚠️  No se extrajeron comentarios');
    }
    
    return { success: true, count: extracted_count };
  } else {
    console.log('❌ Error en extracción');
    console.log(`   Error: ${result.data?.error || result.error}`);
    return { success: false, count: 0 };
  }
}

async function runTests() {
  console.log('\n🔧 Configuración:');
  console.log(`   Servidor: ${SERVER_URL}`);
  console.log(`   Usuario IG: ${IG_USERNAME}`);
  console.log('=' .repeat(70));
  
  // Paso 1: Login
  const loginSuccess = await testLogin();
  if (!loginSuccess) {
    console.log('\n❌ No se pudo hacer login. Abortando pruebas.');
    return;
  }
  
  // Esperar un poco después del login
  console.log('\n⏳ Esperando 3 segundos...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Paso 2: Verificar estado
  const statusOk = await testStatus();
  if (!statusOk) {
    console.log('\n❌ No hay sesión activa. Abortando pruebas.');
    return;
  }
  
  // Paso 3: Probar extracción de comentarios
  console.log('\n\n📋 PASO 3: Probar extracción de comentarios');
  console.log('=' .repeat(70));
  
  const results = [];
  
  for (const post of TEST_POSTS) {
    const result = await testExtractComments(post.url, post.name);
    results.push({ ...post, ...result });
    
    // Esperar entre peticiones
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Resumen final
  console.log('\n\n📊 RESUMEN FINAL');
  console.log('=' .repeat(70));
  
  results.forEach((result, i) => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.name}: ${result.count} comentarios extraídos`);
  });
  
  const totalSuccess = results.filter(r => r.success).length;
  const totalComments = results.reduce((sum, r) => sum + r.count, 0);
  
  console.log('\n' + '=' .repeat(70));
  console.log(`✅ Pruebas exitosas: ${totalSuccess}/${results.length}`);
  console.log(`💬 Total comentarios extraídos: ${totalComments}`);
  console.log('=' .repeat(70));
}

// Ejecutar pruebas
runTests().catch(error => {
  console.error('\n❌ Error fatal:', error);
  process.exit(1);
});
