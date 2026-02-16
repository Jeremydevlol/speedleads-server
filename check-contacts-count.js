// Script para contar contactos extraídos de WhatsApp
import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variables de entorno no configuradas');
  console.error('   Asegúrate de tener SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
  console.error('   Ejecuta este script desde el directorio raíz donde está el .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function countContacts() {
  try {
    // Usuario del log compartido
    const userId = '89e3859d-f1bb-408a-9460-126a5cd77cc3';
    
    console.log('🔍 Consultando contactos extraídos...\n');
    console.log(`📱 User ID: ${userId}\n`);
    
    // Consultar contactos usando Supabase
    const { data, error, count } = await supabase
      .from('conversations_new')
      .select('*', { count: 'exact', head: false })
      .eq('user_id', userId)
      .not('external_id', 'like', '%@g.us%')
      .order('updated_at', { ascending: false });
    
    if (error) {
      console.error('❌ Error al consultar:', error);
      return;
    }
    
    const totalContacts = count || data.length;
    
    console.log('═══════════════════════════════════════════════════');
    console.log(`✅ TOTAL DE CONTACTOS EXTRAÍDOS: ${totalContacts}`);
    console.log('═══════════════════════════════════════════════════\n');
    
    if (data.length > 0) {
      console.log('📋 Primeros 15 contactos (más recientes):\n');
      data.slice(0, 15).forEach((contact, index) => {
        const name = contact.contact_name || 'Sin nombre';
        const jid = contact.external_id || 'Sin JID';
        const hasPhoto = contact.contact_photo_url ? '📷' : '❌';
        console.log(`   ${(index + 1).toString().padStart(2, ' ')}. ${name.padEnd(35)} ${hasPhoto} ${jid}`);
      });
      
      if (data.length > 15) {
        console.log(`\n   ... y ${data.length - 15} contactos más`);
      }
      
      // Estadísticas adicionales
      const withPhotos = data.filter(c => c.contact_photo_url).length;
      const withoutPhotos = data.length - withPhotos;
      const withWaUserId = data.filter(c => c.wa_user_id).length;
      
      console.log('\n═══════════════════════════════════════════════════');
      console.log('📊 ESTADÍSTICAS:');
      console.log(`   • Con foto de perfil: ${withPhotos}`);
      console.log(`   • Sin foto de perfil: ${withoutPhotos}`);
      console.log(`   • Con wa_user_id: ${withWaUserId}`);
      console.log(`   • Sin wa_user_id: ${data.length - withWaUserId}`);
      if (data[0]?.wa_user_id) {
        console.log(`   • wa_user_id: ${data[0].wa_user_id}`);
      }
      console.log('═══════════════════════════════════════════════════\n');
    } else {
      console.log('⚠️ No se encontraron contactos para este usuario');
    }
    
  } catch (error) {
    console.error('❌ Error general:', error);
    console.error('   Stack:', error.stack);
  }
}

// Ejecutar
countContacts();
