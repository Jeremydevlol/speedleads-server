import { supabaseAdmin } from './dist/config/db.js';

async function testPublicWebsites() {
  try {
    console.log('🔍 Probando endpoint público de websites...\n');
    
    // 1. Verificar qué websites existen
    console.log('📋 Websites existentes:');
    const { data: websites, error: websitesError } = await supabaseAdmin
      .from('websites')
      .select('*')
      .limit(1);
    
    if (websitesError) {
      console.error('❌ Error obteniendo websites:', websitesError);
      return;
    }
    
    if (!websites || websites.length === 0) {
      console.log('⚠️ No hay websites en la base de datos');
      return;
    }
    
    // Mostrar todas las columnas disponibles
    console.log('📊 Columnas disponibles en websites:');
    const columns = Object.keys(websites[0]);
    columns.forEach(column => {
      console.log(`  - ${column}: ${typeof websites[0][column]}`);
    });
    
    // 2. Verificar qué usuarios tienen username
    console.log('\n👥 Usuarios con username:');
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profilesusers')
      .select(`
        user_id,
        username
      `)
      .limit(10);
    
    if (profilesError) {
      console.error('❌ Error obteniendo perfiles:', profilesError);
      return;
    }
    
    if (!profiles || profiles.length === 0) {
      console.log('⚠️ No hay perfiles de usuario en la base de datos');
      return;
    }
    
    profiles.forEach(profile => {
      console.log(`  - ${profile.username} (ID: ${profile.user_id})`);
    });
    
    // 3. Buscar websites publicados con username
    console.log('\n🔗 Websites publicados con username:');
    const { data: allWebsites } = await supabaseAdmin
      .from('websites')
      .select(`
        id,
        business_name,
        slug,
        is_published,
        user_id
      `);
    
    const publishedWebsites = [];
    
    for (const website of allWebsites || []) {
      if (website.is_published) {
        // Buscar username del propietario
        const { data: profile } = await supabaseAdmin
          .from('profilesusers')
          .select('username')
          .eq('user_id', website.user_id)
          .single();
        
        if (profile && profile.username) {
          publishedWebsites.push({
            ...website,
            username: profile.username
          });
        }
      }
    }
    
    if (publishedWebsites.length === 0) {
      console.log('⚠️ No hay websites publicados con username válido');
      return;
    }
    
    publishedWebsites.forEach(website => {
      console.log(`  - ${website.business_name} (slug: ${website.slug}, owner: ${website.username})`);
    });
    
    // 4. Probar endpoint público con datos reales (sin builder_data)
    if (publishedWebsites.length > 0) {
      const testWebsite = publishedWebsites[0];
      console.log(`\n🧪 Probando endpoint público con: ${testWebsite.username}/${testWebsite.slug}`);
      
      // Simular la lógica del endpoint (sin builder_data)
      const { data: testResult, error: testError } = await supabaseAdmin
        .from('websites')
        .select(`
          business_name,
          business_description,
          theme_colors,
          social_media,
          main_video,
          sections,
          is_published
        `)
        .eq('slug', testWebsite.slug)
        .eq('user_id', testWebsite.user_id)
        .eq('is_published', true)
        .single();
      
      if (testError) {
        console.error('❌ Error en prueba:', testError);
      } else {
        console.log('✅ Prueba exitosa:', {
          businessName: testResult.business_name,
          hasSections: !!testResult.sections,
          sections: testResult.sections ? 'Sí' : 'No'
        });
      }
    }
    
  } catch (error) {
    console.error('💥 Error general:', error);
  }
}

testPublicWebsites();
