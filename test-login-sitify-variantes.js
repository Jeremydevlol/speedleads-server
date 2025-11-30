import { IgApiClient } from 'instagram-private-api';
import pino from 'pino';

const P = pino({ name: 'test-ig-login', level: 'info' });

async function testLoginSitifyVariants() {
  const variants = [
    { username: 'sitify.io', password: 'Dios2025' },
    { username: 'sitify', password: 'Dios2025' },
    { username: '@sitify.io', password: 'Dios2025' }
  ];
  
  for (const variant of variants) {
    try {
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`🔐 PRUEBA - Usuario: "${variant.username}"`);
      console.log('═══════════════════════════════════════════════════════════');
      
      const ig = new IgApiClient();
      ig.state.generateDevice(variant.username);
      
      // Simular User-Agent Android
      const userAgent = 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
      
      ig.request.defaults.headers = {
        ...ig.request.defaults.headers,
        'User-Agent': userAgent,
        'Accept-Language': 'es-ES,es;q=0.9'
      };
      
      console.log(`📱 Device: ${ig.state.deviceString?.substring(0, 60)}...`);
      console.log(`🔐 Intentando login...`);
      console.log('');
      
      const startTime = Date.now();
      
      try {
        const loginResult = await ig.account.login(variant.username, variant.password);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log('✅ LOGIN EXITOSO!');
        console.log(`   Usuario: ${loginResult.username}`);
        console.log(`   User ID: ${loginResult.pk}`);
        console.log(`   Tiempo: ${duration} segundos`);
        console.log('');
        
        const user = await ig.account.currentUser();
        console.log(`   Nombre: ${user.full_name || 'N/A'}`);
        console.log(`   Seguidores: ${user.follower_count || 'N/A'}`);
        console.log('');
        
        console.log('✅ Esta variante funciona!');
        process.exit(0);
        
      } catch (loginError) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        const errorBody = loginError.response?.body || {};
        
        console.log('❌ Error:');
        console.log(`   Tiempo: ${duration} segundos`);
        console.log(`   Tipo: ${errorBody.error_type || 'N/A'}`);
        console.log(`   Mensaje: ${loginError.message}`);
        
        if (errorBody.message) {
          console.log(`   Detalle: ${errorBody.message}`);
        }
        console.log('');
      }
      
      // Pequeño delay entre intentos
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`❌ Error general: ${error.message}`);
      console.log('');
    }
  }
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('❌ Ninguna variante funcionó');
  console.log('═══════════════════════════════════════════════════════════');
  process.exit(1);
}

testLoginSitifyVariants();

