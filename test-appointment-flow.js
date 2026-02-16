// Script para simular el flujo de agendamiento
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno - intentar múltiples ubicaciones
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

// Verificar variables críticas
console.log('\n🔍 Verificando variables de entorno...');
console.log('   - SUPABASE_URL:', process.env.SUPABASE_URL ? `✅ (${process.env.SUPABASE_URL.substring(0, 30)}...)` : '❌');
console.log('   - SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ (presente)' : '❌');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n❌ Faltan variables de entorno críticas.');
  console.error('   Por favor, asegúrate de que el archivo .env existe y contiene:');
  console.error('   - SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('\n   O ejecuta el script desde el directorio donde están las variables de entorno.');
  process.exit(1);
}

const userId = '093bc3b4-c162-4e34-aa84-087c4b402597';

async function simulateAppointmentFlow() {
  try {
    console.log('🧪 Iniciando simulación de flujo de agendamiento...\n');
    
    // 1. Importar servicios
    const { getAvailableSlots, formatAvailabilitiesForAI } = await import('./src/services/availabilityService.js');
    const { processAppointmentConfirmation } = await import('./src/services/appointmentProcessor.js');
    
    // 2. Obtener disponibilidades
    console.log('📅 Paso 1: Obteniendo disponibilidades disponibles...');
    const availabilities = await getAvailableSlots(userId, null, null);
    
    if (!availabilities || availabilities.length === 0) {
      console.log('❌ No hay disponibilidades disponibles. Por favor crea algunas desde el frontend primero.');
      return;
    }
    
    console.log(`✅ Encontradas ${availabilities.length} disponibilidades:\n`);
    availabilities.forEach((slot, index) => {
      const date = new Date(slot.start);
      console.log(`   ${index + 1}. ${date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} a las ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`);
    });
    
    // 3. Formatear disponibilidades para mostrar
    const formattedAvailabilities = formatAvailabilitiesForAI(availabilities);
    console.log('\n📋 Disponibilidades formateadas para IA:');
    console.log(formattedAvailabilities);
    
    // 4. Simular mensaje del usuario pidiendo agendar
    console.log('\n💬 Paso 2: Simulando mensaje del usuario...');
    const userMessage1 = 'Quiero agendar una cita para mañana';
    console.log(`Usuario: "${userMessage1}"`);
    
    // 5. Simular respuesta de la IA mostrando disponibilidades
    console.log('\n🤖 Paso 3: Simulando respuesta de la IA mostrando disponibilidades...');
    const aiResponse1 = `Claro, aquí tienes las disponibilidades disponibles para mañana:\n\n${formattedAvailabilities}\n\n¿Cuál prefieres?`;
    console.log(`IA: "${aiResponse1.substring(0, 100)}..."`);
    
    // 6. Simular mensaje del usuario confirmando
    console.log('\n💬 Paso 4: Simulando confirmación del usuario...');
    // Usar la primera disponibilidad como ejemplo
    const selectedSlot = availabilities[0];
    const selectedDate = new Date(selectedSlot.start);
    const timeStr = selectedDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    
    // Diferentes formas de confirmar
    const confirmations = [
      `Perfecto, a las ${timeStr} me parece bien`,
      `Sí, la opción 1`,
      `Confirmo para mañana a las ${timeStr}`
    ];
    
    const userMessage2 = confirmations[0];
    console.log(`Usuario: "${userMessage2}"`);
    
    // 7. Simular respuesta de la IA confirmando agendamiento
    console.log('\n🤖 Paso 5: Simulando respuesta de la IA confirmando agendamiento...');
    const aiResponse2 = `¡Perfecto! He agendado tu cita para ${selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} a las ${timeStr}. Te enviaré una confirmación en breve con todos los detalles.`;
    console.log(`IA: "${aiResponse2}"`);
    
    // 8. Simular historial de conversación
    console.log('\n📚 Paso 6: Creando historial de conversación simulado...');
    const history = [
      { role: 'user', content: userMessage1, sender_type: 'user' },
      { role: 'assistant', content: aiResponse1, sender_type: 'ia' },
      { role: 'user', content: userMessage2, sender_type: 'user' },
      { role: 'assistant', content: aiResponse2, sender_type: 'ia' }
    ];
    
    // 9. Procesar confirmación de agendamiento
    console.log('\n⚙️ Paso 7: Procesando confirmación de agendamiento...');
    const result = await processAppointmentConfirmation(
      aiResponse2,
      userId,
      '34660248350', // Número de teléfono simulado
      'Cliente de Prueba',
      history
    );
    
    if (result && result.success) {
      console.log('\n✅ ¡Agendamiento exitoso!');
      console.log('📋 Detalles del agendamiento:');
      console.log(`   - ID de cita: ${result.appointment?.appointmentId || result.slotEventId}`);
      console.log(`   - Cliente: ${result.clientName}`);
      console.log(`   - Fecha: ${result.appointment?.start ? new Date(result.appointment.start).toLocaleString('es-ES') : 'N/A'}`);
      console.log(`   - Slot usado: ${result.slotEventId}`);
    } else {
      console.log('\n⚠️ No se pudo procesar el agendamiento automáticamente.');
      console.log('   Esto puede ser normal si no se detectó la confirmación o no hay slot válido.');
    }
    
    console.log('\n✅ Simulación completada.');
    
  } catch (error) {
    console.error('\n❌ Error en la simulación:', error);
    console.error(error.stack);
  }
}

// Ejecutar simulación
simulateAppointmentFlow().then(() => {
  console.log('\n🏁 Script finalizado.');
  process.exit(0);
}).catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});

