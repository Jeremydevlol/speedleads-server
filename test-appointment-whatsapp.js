// Script para probar el flujo completo de agendamiento desde WhatsApp
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
const envPaths = [
  join(__dirname, '.env'),
  join(process.cwd(), '.env'),
  '.env'
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
    envLoaded = true;
    console.log(`✅ Variables de entorno cargadas desde: ${envPath}`);
    break;
  }
}

if (!envLoaded) {
  dotenv.config({ override: true });
  console.log('⚠️ Archivo .env no encontrado, usando variables de entorno del sistema');
}

const userId = '093bc3b4-c162-4e34-aa84-087c4b402597';
const testPhone = '34660248350'; // Número de prueba
const API_BASE = process.env.API_BASE_URL || 'http://localhost:5001';
const JWT_TOKEN = process.env.JWT_TOKEN || '';

if (!JWT_TOKEN) {
  console.error('❌ JWT_TOKEN no encontrado en variables de entorno');
  console.error('   Por favor, configura JWT_TOKEN en tu archivo .env');
  process.exit(1);
}

// Simular conversación de agendamiento
const conversationFlow = [
  {
    step: 1,
    userMessage: 'Hola, quiero agendar una cita',
    description: 'Usuario inicia conversación pidiendo agendar'
  },
  {
    step: 2,
    userMessage: 'Para María García',
    description: 'Usuario proporciona el nombre para la cita'
  },
  {
    step: 3,
    userMessage: 'Perfecto, el jueves a las 10am',
    description: 'Usuario confirma fecha y hora'
  }
];

async function sendWhatsAppMessage(phoneNumber, message) {
  try {
    const response = await fetch(`${API_BASE}/api/whatsapp/send_message_to_number`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phoneNumber: phoneNumber,
        textContent: message,
        senderType: 'user',
        defaultCountry: '34'
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ Mensaje enviado: "${message}"`);
      return true;
    } else {
      console.error(`❌ Error enviando mensaje: ${result.message}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error de red: ${error.message}`);
    return false;
  }
}

async function waitForAIResponse(seconds = 3) {
  console.log(`⏳ Esperando ${seconds} segundos para respuesta de IA...`);
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function checkAppointments() {
  try {
    const { supabaseAdmin } = await import('./src/db/supabase.js');
    
    const { data: citas, error } = await supabaseAdmin
      .from('citas_agendadas')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) {
      console.error('❌ Error consultando citas:', error);
      return null;
    }
    
    if (citas && citas.length > 0) {
      return citas[0];
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return null;
  }
}

async function simulateAppointmentFlow() {
  console.log('🧪 Iniciando simulación de flujo de agendamiento desde WhatsApp\n');
  console.log(`📱 Número de prueba: ${testPhone}`);
  console.log(`👤 User ID: ${userId}\n`);
  
  // Verificar disponibilidades antes de empezar
  try {
    const { getAvailableSlots } = await import('./src/services/availabilityService.js');
    const availabilities = await getAvailableSlots(userId, null, null);
    
    if (!availabilities || availabilities.length === 0) {
      console.log('⚠️ No hay disponibilidades disponibles. Por favor crea algunas desde el frontend primero.');
      return;
    }
    
    console.log(`✅ Encontradas ${availabilities.length} disponibilidades disponibles\n`);
  } catch (error) {
    console.error('❌ Error verificando disponibilidades:', error.message);
    return;
  }
  
  // Obtener última cita antes de empezar para comparar después
  const lastAppointmentBefore = await checkAppointments();
  const lastAppointmentIdBefore = lastAppointmentBefore?.id;
  
  console.log('📋 Flujo de conversación:\n');
  
  // Simular cada paso de la conversación
  for (const step of conversationFlow) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📝 Paso ${step.step}: ${step.description}`);
    console.log(`💬 Usuario: "${step.userMessage}"`);
    console.log(`${'='.repeat(60)}\n`);
    
    // Enviar mensaje
    const sent = await sendWhatsAppMessage(testPhone, step.userMessage);
    
    if (!sent) {
      console.log('⚠️ No se pudo enviar el mensaje, continuando...');
    }
    
    // Esperar respuesta de IA
    await waitForAIResponse(5);
    
    console.log('✅ Respuesta de IA procesada (revisa WhatsApp para ver la respuesta)');
  }
  
  // Esperar un poco más para que se procese el agendamiento
  console.log('\n⏳ Esperando procesamiento final del agendamiento...');
  await waitForAIResponse(5);
  
  // Verificar si se creó una nueva cita
  const lastAppointmentAfter = await checkAppointments();
  
  if (lastAppointmentAfter && lastAppointmentAfter.id !== lastAppointmentIdBefore) {
    console.log('\n✅ ¡CITA AGENDADA EXITOSAMENTE!\n');
    console.log('📋 Detalles de la cita:');
    console.log(`   - ID: ${lastAppointmentAfter.id}`);
    console.log(`   - Cliente: ${lastAppointmentAfter.client_name}`);
    console.log(`   - Fecha: ${new Date(lastAppointmentAfter.start_time).toLocaleString('es-ES')}`);
    console.log(`   - Google Event ID: ${lastAppointmentAfter.google_event_id}`);
    console.log(`   - Estado: ${lastAppointmentAfter.status}`);
    
    if (lastAppointmentAfter.location) {
      console.log(`   - Ubicación: ${lastAppointmentAfter.location}`);
    }
    
    if (lastAppointmentAfter.description) {
      console.log(`   - Descripción: ${lastAppointmentAfter.description.substring(0, 100)}...`);
    }
    
    console.log('\n✅ Verifica en WhatsApp que recibiste el mensaje de confirmación');
  } else {
    console.log('\n⚠️ No se detectó una nueva cita agendada');
    console.log('   Esto puede ser normal si:');
    console.log('   - El agendamiento aún se está procesando');
    console.log('   - No se detectó la confirmación en la respuesta de IA');
    console.log('   - Revisa los logs del servidor para más detalles');
  }
  
  console.log('\n🎉 Simulación completada');
  console.log('\n📱 Revisa tu WhatsApp para ver:');
  console.log('   1. Las respuestas de la IA');
  console.log('   2. El mensaje de confirmación de la cita');
  console.log('   3. Los detalles de la cita agendada');
}

// Ejecutar simulación
simulateAppointmentFlow().then(() => {
  console.log('\n🏁 Script finalizado.');
  process.exit(0);
}).catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});


