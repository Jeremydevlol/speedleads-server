import dotenv from 'dotenv';
dotenv.config();

const userId = '093bc3b4-c162-4e34-aa84-087c4b402597';
const token = 'eyJhbGciOiJIUzI1NiIsImtpZCI6Ik55eUJueVpCL3h0LzdJUnMiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2puenNhYmhiZm5pdmRpY2VvZWZnLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiIwOTNiYzNiNC1jMTYyLTRlMzQtYWE4NC0wODdjNGI0MDI1OTciLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzY3NzQ3MjY1LCJpYXQiOjE3Njc3NDM2NjUsImVtYWlsIjoicmVhZHl0b2JsZXNzZEBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6Imdvb2dsZSIsInByb3ZpZGVycyI6WyJnb29nbGUiXX0sInVzZXJfbWV0YWRhdGEiOnsiYXZhdGFyX3VybCI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FDZzhvY0ltdFNlTko4YlVjeU4yeHlPWklQbGpmbUd4SWtiZ1F5dGU3bmNXamtoTjJSdWRiZz1zOTYtYyIsImVtYWlsIjoicmVhZHl0b2JsZXNzZEBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZnVsbF9uYW1lIjoicmVhZHkgdG9ibGVzc2QiLCJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJuYW1lIjoicmVhZHkgdG9ibGVzc2QiLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInBpY3R1cmUiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NJbXRTZU5KOGJVY3lOMnh5T1pJUGxqZm1HeElrYmdReXRlN25jV2praE4yUnVkYmc9czk2LWMiLCJwcm92aWRlcl9pZCI6IjExMDgwMTc1MjE1NDc0MTUzMTgwOCIsInN1YiI6IjExMDgwMTc1MjE1NDc0MTUzMTgwOCIsInVzZXJuYW1lIjoicmVhZHl0b2JsZXNzZCJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6Im9hdXRoIiwidGltZXN0YW1wIjoxNzY3NzQzNjY1fV0sInNlc3Npb25faWQiOiI2ZTlkNWRkMi0wNWIwLTQwNWMtYjdkYi1mY2FlYTI1NGM4YzQiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.OmDls6PWFSlAGykP-8v1794ngtU2V8QCaJi5OCsycGA';

async function testAppointmentGeneration() {
  try {
    console.log('🧪 Probando generación de evento con IA...\n');

    // Simular historial de conversación
    const history = [
      {
        role: 'user',
        content: 'vale agendame una cita para el domingo 11 de enero para ir a comer arepas a nombre de jeremy celaya'
      }
    ];

    const appointmentDate = new Date('2026-01-11');
    const appointmentTime = { hour: 15, minute: 0 };

    // Importar la función
    const { processAppointmentConfirmation } = await import('./dist/services/appointmentProcessor.js');

    // Simular respuesta de IA que confirma el agendamiento
    const aiResponse = `¡Perfecto! He agendado tu cita para Jeremy Celaya el domingo 11 de enero a las 15:00. Te enviaré una confirmación en breve con todos los detalles.`;

    console.log('📅 Procesando confirmación de agendamiento...');
    console.log('📝 Mensaje del usuario:', history[0].content);
    console.log('🤖 Respuesta de IA:', aiResponse);
    console.log('');

    const result = await processAppointmentConfirmation(
      aiResponse,
      userId,
      null, // clientPhone
      null, // clientName (se extraerá del mensaje)
      history
    );

    if (result && result.success) {
      console.log('\n✅ Agendamiento exitoso!');
      console.log('📋 Detalles del evento:');
      console.log('   - Nombre:', result.clientName);
      console.log('   - ID del evento:', result.appointment?.appointmentId || result.slotEventId);
      console.log('   - Título:', result.appointment?.summary);
      console.log('   - Descripción:', result.appointment?.description?.substring(0, 100) + '...');
      console.log('   - Ubicación:', result.appointment?.location || 'No especificada');
      console.log('   - Fecha:', result.appointment?.start);
    } else {
      console.log('\n⚠️ No se procesó el agendamiento');
      console.log('Result:', result);
    }

  } catch (error) {
    console.error('❌ Error en la prueba:', error);
    console.error('Stack:', error.stack);
  }
}

testAppointmentGeneration();


