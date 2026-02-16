// Script para verificar conversaciones de WhatsApp
import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variables de entorno no configuradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConversations() {
  try {
    // Usuario del log compartido
    const userId = '89e3859d-f1bb-408a-9460-126a5cd77cc3';
    
    console.log('🔍 Verificando conversaciones...\n');
    console.log(`📱 User ID: ${userId}\n`);
    
    // Consultar conversaciones (sin mensajes para evitar timeout)
    const { data: conversations, error, count } = await supabase
      .from('conversations_new')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .not('external_id', 'like', '%@g.us%')
      .neq('external_id', 'status@broadcast')
      .order('updated_at', { ascending: false })
      .limit(50);
    
    if (error) {
      console.error('❌ Error al consultar:', error);
      return;
    }
    
    const totalConversations = count || conversations.length;
    
    console.log('═══════════════════════════════════════════════════');
    console.log(`✅ TOTAL DE CONVERSACIONES: ${totalConversations}`);
    console.log('═══════════════════════════════════════════════════\n');
    
    if (conversations.length > 0) {
      console.log('📋 Primeras 15 conversaciones (más recientes):\n');
      
      // Obtener conteo de mensajes para algunas conversaciones
      const sampleConvs = conversations.slice(0, 15);
      
      for (let i = 0; i < sampleConvs.length; i++) {
        const conv = sampleConvs[i];
        const name = conv.contact_name || 'Sin nombre';
        const jid = conv.external_id || 'Sin JID';
        const hasPhoto = conv.contact_photo_url ? '📷' : '❌';
        
        // Obtener último mensaje de esta conversación
        const { data: lastMessage } = await supabase
          .from('messages_new')
          .select('text_content, sender_type, created_at')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        const { count: msgCount } = await supabase
          .from('messages_new')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conv.id);
        
        const lastMsg = lastMessage?.text_content?.substring(0, 50) || 'Sin mensajes';
        
        console.log(`   ${(i + 1).toString().padStart(2, ' ')}. ${name.padEnd(35)} ${hasPhoto}`);
        console.log(`       JID: ${jid}`);
        console.log(`       Mensajes: ${msgCount || 0} | Último: ${lastMsg}...`);
        console.log(`       AI Activa: ${conv.ai_active ? '✅' : '❌'} | Personalidad: ${conv.personality_id || 'N/A'}`);
        console.log('');
      }
      
      if (conversations.length > 15) {
        console.log(`   ... y ${conversations.length - 15} conversaciones más\n`);
      }
      
      // Estadísticas básicas
      const withPhotos = conversations.filter(c => c.contact_photo_url).length;
      const withAI = conversations.filter(c => c.ai_active).length;
      
      console.log('═══════════════════════════════════════════════════');
      console.log('📊 ESTADÍSTICAS:');
      console.log(`   • Total conversaciones: ${conversations.length}`);
      console.log(`   • Con foto de perfil: ${withPhotos}`);
      console.log(`   • Con AI activa: ${withAI}`);
      console.log(`   • wa_user_id: ${conversations[0]?.wa_user_id || 'N/A'}`);
      console.log('═══════════════════════════════════════════════════\n');
      
      // Verificar mensajes de una conversación específica (la primera)
      if (sampleConvs.length > 0) {
        const firstConv = sampleConvs[0];
        console.log(`\n💬 Últimos mensajes de "${firstConv.contact_name}":\n`);
        
        const { data: messages } = await supabase
          .from('messages_new')
          .select('text_content, sender_type, created_at, whatsapp_created_at')
          .eq('conversation_id', firstConv.id)
          .order('created_at', { ascending: false })
          .limit(5);
        
        if (messages && messages.length > 0) {
          messages.forEach((msg, idx) => {
            const sender = msg.sender_type === 'user' ? '👤 Usuario' : '🤖 AI';
            const text = msg.text_content?.substring(0, 60) || 'Sin texto';
            const date = msg.created_at || msg.whatsapp_created_at || 'Sin fecha';
            console.log(`   ${idx + 1}. ${sender}: ${text}...`);
            console.log(`      Fecha: ${date}`);
          });
        } else {
          console.log('   No hay mensajes en esta conversación');
        }
      }
    } else {
      console.log('⚠️ No se encontraron conversaciones para este usuario');
    }
    
  } catch (error) {
    console.error('❌ Error general:', error);
    console.error('   Stack:', error.stack);
  }
}

// Ejecutar
checkConversations();

