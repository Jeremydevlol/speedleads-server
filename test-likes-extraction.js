import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5001';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsImtpZCI6ImNCZCtEOGgwNDdMdklmS2QiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2xpZnRsdmJ1Z3VtcHhobWp2bXRiLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiIyNjE0ZGE2MS0yOWY3LTRmMmUtOWE5Yi1kY2I4ZTFiYmRhZTciLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzYyOTAzMjkxLCJpYXQiOjE3NjI4OTk2OTEsImVtYWlsIjoianVhbkBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl0sInJvbGUiOiJhZG1pbiJ9LCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsIjoianVhbkBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZnVsbF9uYW1lIjoiSnVhbiIsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwicm9sZSI6ImFkbWluIiwic3ViIjoiMjYxNGRhNjEtMjlmNy00ZjJlLTlhOWItZGNiOGUxYmJkYWU3IiwidXNlcm5hbWUiOiJqdWFuIn0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3NjI4OTk2OTF9XSwic2Vzc2lvbl9pZCI6ImFlZTg0NjdlLTk0NDctNDEzNi05ZmQyLWVjODhlOTQ3NDk3YiIsImlzX2Fub255bW91cyI6ZmFsc2V9.DJP8CTE4hx309cXA6yAUjnry9vK_Ac4pMxWOdcXih8w';

async function testLikesExtraction() {
  try {
    console.log('🔐 1. Haciendo login en Instagram...');
    const loginResponse = await fetch(`${BASE_URL}/api/instagram/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      },
      body: JSON.stringify({
        username: 'dimeroxsd',
        password: 'Dios2025@',
        userId: '2614da61-29f7-4f2e-9a9b-dcb8e1bbdae7'
      })
    });

    const loginData = await loginResponse.json();
    console.log('✅ Login:', loginData.message);
    
    if (!loginData.success) {
      console.error('❌ Error en login:', loginData.error);
      return;
    }

    // Esperar un poco para asegurar que la sesión se guarde
    console.log('\n⏳ Esperando 2 segundos...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('❤️ 2. Extrayendo TODOS los likes del reel...');
    const likesResponse = await fetch(`${BASE_URL}/api/instagram/likes/from-post`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      },
      body: JSON.stringify({
        postUrl: 'https://www.instagram.com/reel/DNBEZKjtbAf/'
      })
    });

    const likesData = await likesResponse.json();
    
    if (likesData.success) {
      console.log('\n🎉 ¡ÉXITO! Likes extraídos:');
      console.log(`   📊 Extraídos: ${likesData.extracted_count}`);
      console.log(`   📈 Total reportado por API: ${likesData.total_reported_by_api}`);
      console.log(`   👤 Autor: @${likesData.post_info.owner.username}`);
      console.log(`   ❤️  Likes en el post: ${likesData.post_info.like_count}`);
      console.log(`   💬 Comentarios: ${likesData.post_info.comment_count}`);
      
      if (likesData.post_info.likes_hidden) {
        console.log('\n   🔒 El autor ocultó el contador de likes');
      }
      
      if (likesData.extracted_count < likesData.total_reported_by_api) {
        console.log(`\n   ⚠️  Instagram truncó la lista (${likesData.extracted_count}/${likesData.total_reported_by_api})`);
        console.log('   💡 Esto es normal en posts con muchos likes');
      } else {
        console.log('\n   ✅ Se obtuvieron todos los likes disponibles');
      }
      
      console.log('\n📝 Primeros 5 usuarios que dieron like:');
      likesData.likes.slice(0, 5).forEach((like, i) => {
        console.log(`\n   ${i + 1}. @${like.username}${like.is_verified ? ' ✓' : ''}`);
        console.log(`      ${like.full_name}`);
        console.log(`      ${like.is_private ? '🔒 Privado' : '🔓 Público'}`);
      });

      // Guardar todos los likes en un archivo
      const fs = await import('fs');
      fs.default.writeFileSync(
        'likes_extraidos.json',
        JSON.stringify(likesData, null, 2)
      );
      console.log('\n💾 Todos los likes guardados en: likes_extraidos.json');
      
    } else {
      console.error('\n❌ Error extrayendo likes:', likesData.error);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testLikesExtraction();
