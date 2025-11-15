import { IgApiClient } from 'instagram-private-api';
import fs from 'fs';

const ig = new IgApiClient();
ig.state.generateDevice('dimeroxsd');

async function checkFollowing() {
  try {
    console.log('🔐 Iniciando sesión en Instagram...');
    
    // Login directo
    await ig.account.login('dimeroxsd', 'Dios2025@');
    console.log('✅ Login exitoso');
    
    // Obtener información del usuario actual
    const currentUser = await ig.account.currentUser();
    const userId = currentUser.pk;
    console.log(`\n👤 Usuario: @${currentUser.username} (ID: ${userId})`);
    
    // Obtener lista de cuentas que sigues
    console.log('\n📋 Obteniendo lista de cuentas que sigues...\n');
    
    const followingFeed = ig.feed.accountFollowing(userId);
    const following = await followingFeed.items();
    
    console.log(`✅ Sigues a ${following.length} cuentas:\n`);
    
    following.forEach((user, index) => {
      console.log(`${index + 1}. @${user.username} - ${user.full_name}`);
    });
    
    console.log(`\n📊 Total: ${following.length} cuentas`);
    
    // Guardar en archivo
    const followingData = following.map(u => ({
      username: u.username,
      full_name: u.full_name,
      pk: u.pk
    }));
    
    fs.writeFileSync('following_list.json', JSON.stringify(followingData, null, 2));
    console.log('\n💾 Lista guardada en following_list.json');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkFollowing();
