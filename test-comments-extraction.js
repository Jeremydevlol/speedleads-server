import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5001';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsImtpZCI6ImNCZCtEOGgwNDdMdklmS2QiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2xpZnRsdmJ1Z3VtcHhobWp2bXRiLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiIyNjE0ZGE2MS0yOWY3LTRmMmUtOWE5Yi1kY2I4ZTFiYmRhZTciLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzYyOTAzMjkxLCJpYXQiOjE3NjI4OTk2OTEsImVtYWlsIjoianVhbkBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl0sInJvbGUiOiJhZG1pbiJ9LCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsIjoianVhbkBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZnVsbF9uYW1lIjoiSnVhbiIsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwicm9sZSI6ImFkbWluIiwic3ViIjoiMjYxNGRhNjEtMjlmNy00ZjJlLTlhOWItZGNiOGUxYmJkYWU3IiwidXNlcm5hbWUiOiJqdWFuIn0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3NjI4OTk2OTF9XSwic2Vzc2lvbl9pZCI6ImFlZTg0NjdlLTk0NDctNDEzNi05ZmQyLWVjODhlOTQ3NDk3YiIsImlzX2Fub255bW91cyI6ZmFsc2V9.DJP8CTE4hx309cXA6yAUjnry9vK_Ac4pMxWOdcXih8w';

async function testCommentsExtraction() {
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

    console.log('💬 2. Extrayendo TODOS los comentarios del reel...');
    const commentsResponse = await fetch(`${BASE_URL}/api/instagram/comments/from-post`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      },
      body: JSON.stringify({
        postUrl: 'https://www.instagram.com/reel/DNBEZKjtbAf/'
      })
    });

    const commentsData = await commentsResponse.json();
    
    if (commentsData.success) {
      console.log('\n🎉 ¡ÉXITO! Comentarios extraídos:');
      console.log(`   📊 Total acumulado: ${commentsData.extracted_count}`);
      console.log(`   ✨ Nuevos en esta extracción: ${commentsData.new_comments || 0}`);
      console.log(`   📈 Total en el post: ${commentsData.total_comments}`);
      console.log(`   👤 Autor: @${commentsData.post_info.owner.username}`);
      console.log(`   ❤️  Likes: ${commentsData.post_info.like_count}`);
      console.log(`   💬 Comentarios: ${commentsData.post_info.comment_count}`);
      
      if (commentsData.is_complete) {
        console.log('\n   ✅ ¡COMPLETO! Todos los comentarios han sido extraídos');
      } else {
        const missing = commentsData.total_comments - commentsData.extracted_count;
        console.log(`\n   ⚠️  Faltan ${missing} comentarios`);
        console.log('   💡 Ejecuta de nuevo para obtener más comentarios');
      }
      
      console.log('\n📝 Primeros 5 comentarios:');
      commentsData.comments.slice(0, 5).forEach((comment, i) => {
        console.log(`\n   ${i + 1}. @${comment.username}${comment.is_verified ? ' ✓' : ''}`);
        console.log(`      "${comment.comment_text.substring(0, 100)}${comment.comment_text.length > 100 ? '...' : ''}"`);
        console.log(`      ❤️  ${comment.like_count} likes`);
      });

      // Guardar todos los comentarios en un archivo
      const fs = await import('fs');
      fs.default.writeFileSync(
        'comentarios_extraidos.json',
        JSON.stringify(commentsData, null, 2)
      );
      console.log('\n💾 Todos los comentarios guardados en: comentarios_extraidos.json');
      
    } else {
      console.error('\n❌ Error extrayendo comentarios:', commentsData.error);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testCommentsExtraction();
