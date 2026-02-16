import { supabaseAdmin } from './dist/config/db.js';

async function testProfilesUsers() {
  try {
    console.log('🔍 Verificando tabla profilesusers...\n');
    
    // Buscar todos los perfiles
    const { data: profiles, error } = await supabaseAdmin
      .from('profilesusers')
      .select('*')
      .limit(20);
    
    if (error) {
      console.error('❌ Error obteniendo perfiles:', error);
      return;
    }
    
    if (!profiles || profiles.length === 0) {
      console.log('⚠️ No hay perfiles en la tabla profilesusers');
      return;
    }
    
    console.log('📋 Perfiles encontrados:');
    profiles.forEach(profile => {
      console.log(`  - Username: "${profile.username}" | User ID: ${profile.user_id}`);
    });
    
    // Buscar específicamente el usuario "Jere"
    console.log('\n🔍 Buscando usuario "Jere":');
    const { data: jereProfile, error: jereError } = await supabaseAdmin
      .from('profilesusers')
      .select('*')
      .eq('username', 'Jere')
      .single();
    
    if (jereError) {
      console.error('❌ Error buscando "Jere":', jereError);
    } else if (jereProfile) {
      console.log('✅ Usuario "Jere" encontrado:', jereProfile);
    } else {
      console.log('⚠️ Usuario "Jere" no encontrado');
    }
    
    // Buscar usuarios que contengan "Jere"
    console.log('\n🔍 Buscando usuarios que contengan "Jere":');
    const { data: jereLikeProfiles, error: jereLikeError } = await supabaseAdmin
      .from('profilesusers')
      .select('*')
      .ilike('username', '%Jere%');
    
    if (jereLikeError) {
      console.error('❌ Error en búsqueda LIKE:', jereLikeError);
    } else if (jereLikeProfiles && jereLikeProfiles.length > 0) {
      console.log('✅ Usuarios similares a "Jere":');
      jereLikeProfiles.forEach(profile => {
        console.log(`  - ${profile.username} (ID: ${profile.user_id})`);
      });
    } else {
      console.log('⚠️ No se encontraron usuarios similares a "Jere"');
    }
    
  } catch (error) {
    console.error('💥 Error general:', error);
  }
}

testProfilesUsers();
