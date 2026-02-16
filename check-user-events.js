// Script para verificar eventos de un usuario en la base de datos
import dotenv from 'dotenv';
dotenv.config();

import { supabaseAdmin } from './src/db/supabase.js';

const userId = '093bc3b4-c162-4e34-aa84-087c4b402597';

async function checkUserEvents() {
  console.log(`🔍 Verificando eventos para usuario: ${userId}\n`);

  try {
    // 1. Verificar cuenta de Google
    console.log('1️⃣ Verificando cuenta de Google...');
    const { data: account, error: accountError } = await supabaseAdmin
      .from('google_accounts')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      console.log('❌ No hay cuenta de Google conectada');
      console.log('Error:', accountError?.message);
    } else {
      console.log('✅ Cuenta encontrada:');
      console.log(`   Email: ${account.email}`);
      console.log(`   Token expira: ${new Date(account.expiry_date).toLocaleString()}`);
      console.log(`   Token expirado: ${new Date(account.expiry_date) < new Date() ? 'SÍ' : 'NO'}`);
    }

    console.log('\n2️⃣ Verificando eventos en google_events...');
    const { data: events, error: eventsError } = await supabaseAdmin
      .from('google_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (eventsError) {
      console.log('❌ Error consultando eventos:', eventsError.message);
      console.log('Detalles:', eventsError);
    } else if (!events || events.length === 0) {
      console.log('⚠️ No hay eventos guardados para este usuario');
    } else {
      console.log(`✅ Se encontraron ${events.length} evento(s):\n`);
      events.forEach((event, index) => {
        console.log(`${index + 1}. ${event.summary || 'Sin título'}`);
        console.log(`   ID: ${event.id}`);
        console.log(`   Event ID (Google): ${event.event_id}`);
        console.log(`   Inicio: ${event.start_time ? new Date(event.start_time).toLocaleString() : 'N/A'}`);
        console.log(`   Fin: ${event.end_time ? new Date(event.end_time).toLocaleString() : 'N/A'}`);
        console.log(`   Fuente: ${event.source}`);
        console.log(`   Creado: ${new Date(event.created_at).toLocaleString()}`);
        console.log(`   Sincronizado: ${event.last_synced_at ? new Date(event.last_synced_at).toLocaleString() : 'N/A'}`);
        console.log('');
      });
    }

    // 3. Verificar el último evento creado (el de la prueba)
    console.log('\n3️⃣ Buscando evento específico de la prueba...');
    const { data: testEvent, error: testError } = await supabaseAdmin
      .from('google_events')
      .select('*')
      .eq('user_id', userId)
      .eq('event_id', '3hseqj8cr2imh56r0dr94u3rv8')
      .single();

    if (testError) {
      console.log('❌ El evento de prueba NO está en la base de datos');
      console.log('Error:', testError.message);
      console.log('Esto significa que el evento se creó en Google Calendar pero NO se guardó en la BD');
    } else {
      console.log('✅ Evento de prueba encontrado:');
      console.log(JSON.stringify(testEvent, null, 2));
    }

  } catch (error) {
    console.error('❌ Error general:', error);
  }
}

checkUserEvents();

