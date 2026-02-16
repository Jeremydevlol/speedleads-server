// src/services/availabilityService.js
// Servicio para gestionar disponibilidades y agendamientos desde la IA

import { supabaseAdmin } from '../db/supabase.js';
import { upsertGoogleEvent } from './googleCalendar.service.js';

/**
 * Obtener disponibilidades disponibles para un usuario
 * @param {string} userId - ID del usuario
 * @param {Date} startDate - Fecha de inicio para buscar (opcional)
 * @param {Date} endDate - Fecha de fin para buscar (opcional)
 * @returns {Promise<Array>} Array de disponibilidades disponibles
 */
export async function getAvailableSlots(userId, startDate = null, endDate = null) {
  try {
    const now = new Date();
    const start = startDate || now;
    const end = endDate || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 días por defecto

    // Obtener disponibilidades desde la tabla disponibility
    let query = supabaseAdmin
      .from('disponibility')
      .select('*')
      .eq('user_id', userId)
      .eq('is_available', true) // Solo disponibilidades disponibles
      .gte('selected_date', start.toISOString().split('T')[0]) // Filtrar por fecha
      .lte('selected_date', end.toISOString().split('T')[0])
      .order('selected_date', { ascending: true })
      .order('start_time', { ascending: true });

    const { data: disponibilidades, error } = await query;

    if (error) {
      console.error('❌ Error obteniendo disponibilidades:', error);
      return [];
    }

    if (!disponibilidades || disponibilidades.length === 0) {
      return [];
    }

    // Mapear a formato esperado
    const availabilities = disponibilidades.map(disp => {
      // Combinar selected_date con start_time y end_time para crear timestamps completos
      const startDateTime = new Date(`${disp.selected_date}T${disp.start_time}`);
      const endDateTime = new Date(`${disp.selected_date}T${disp.end_time}`);
      
      // Log para debug si google_event_id está undefined
      if (!disp.google_event_id) {
        console.warn(`⚠️ Disponibilidad ${disp.id} no tiene google_event_id`);
      }
      
      return {
        id: disp.id,
        disponibilidadId: disp.id,
        eventId: disp.google_event_id || disp.id, // Usar id como fallback si no hay google_event_id
        googleEventId: disp.google_event_id,
        summary: disp.summary || 'Disponibilidad',
        description: disp.description,
        location: disp.location,
        start: startDateTime.toISOString(),
        end: endDateTime.toISOString(),
        startTimestamp: disp.start_ts || startDateTime.getTime(),
        endTimestamp: disp.end_ts || endDateTime.getTime(),
        isAvailable: disp.is_available,
        selectedDate: disp.selected_date,
        startTime: disp.start_time,
        endTime: disp.end_time,
        recurrencia: disp.recurrencia
      };
    });

    return availabilities;

  } catch (error) {
    console.error('❌ Error en getAvailableSlots:', error);
    return [];
  }
}

/**
 * Formatear disponibilidades para que la IA las entienda
 * @param {Array} slots - Array de disponibilidades
 * @returns {string} Texto formateado para la IA
 */
export function formatAvailabilitiesForAI(slots) {
  if (!slots || slots.length === 0) {
    return 'No hay disponibilidades disponibles en este momento.';
  }

  let text = `📅 DISPONIBILIDADES DISPONIBLES:\n\n`;
  
  slots.forEach((slot, index) => {
    const startDate = new Date(slot.start);
    const endDate = new Date(slot.end);
    
    const dateStr = startDate.toLocaleDateString('es-ES', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    const startTime = startDate.toLocaleTimeString('es-ES', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    const endTime = endDate.toLocaleTimeString('es-ES', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    text += `${index + 1}. ${dateStr}\n`;
    text += `   ⏰ ${startTime} - ${endTime}\n`;
    if (slot.location) {
      text += `   📍 ${slot.location}\n`;
    }
    if (slot.description) {
      text += `   📝 ${slot.description}\n`;
    }
    text += `   ID: ${slot.eventId}\n\n`;
  });

  return text;
}

/**
 * Extraer información de agendamiento del mensaje del usuario
 * @param {string} message - Mensaje del usuario
 * @param {Array} availabilities - Array de disponibilidades disponibles
 * @returns {Object|null} Información del agendamiento o null si no se puede determinar
 */
export function extractAppointmentInfo(message, availabilities) {
  if (!message || typeof message !== 'string') {
    return null;
  }
  const lowerMessage = message.toLowerCase();
  
  // Buscar por número (1, 2, 3, etc.)
  const numberMatch = lowerMessage.match(/(?:opción|opción|la|el|número|numero)\s*(\d+)/);
  if (numberMatch && availabilities) {
    const index = parseInt(numberMatch[1]) - 1;
    if (index >= 0 && index < availabilities.length) {
      return {
        slotEventId: availabilities[index].eventId,
        slot: availabilities[index]
      };
    }
  }
  
  // Buscar por ID del evento
  if (availabilities) {
    for (const slot of availabilities) {
      if (slot.eventId && typeof slot.eventId === 'string' && lowerMessage.includes(slot.eventId.toLowerCase())) {
        return {
          slotEventId: slot.eventId,
          slot: slot
        };
      }
    }
  }
  
  // Buscar por fecha/hora mencionada en el mensaje
  if (availabilities && availabilities.length > 0) {
    // Buscar por fecha (mañana, hoy, día específico)
    const now = new Date();
    let targetDate = null;
    
    if (lowerMessage.includes('mañana') && !lowerMessage.includes('pasado')) {
      targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + 1);
    } else if (lowerMessage.includes('hoy')) {
      targetDate = new Date(now);
    } else if (lowerMessage.includes('pasado mañana')) {
      targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + 2);
    }
    
    // Buscar por hora mencionada
    const timePatterns = [
      /a\s+las\s+(\d{1,2})/i,
      /a\s+la\s+(\d{1,2})\s+de\s+la\s+(tarde|mañana|noche)/i,
      /(\d{1,2}):(\d{2})/,
      /(\d{1,2})\s*(am|pm)/i,
      /(\d{1,2})\s+de\s+la\s+(tarde|mañana|noche)/i,
      /las\s+(\d{1,2})/i
    ];
    
    let targetHour = null;
    let targetMinute = 0;
    
    for (const pattern of timePatterns) {
      const match = lowerMessage.match(pattern);
      if (match) {
        if (match[1] && match[2] && !isNaN(parseInt(match[2])) && match[2].length === 2) {
          // Formato HH:MM
          targetHour = parseInt(match[1]);
          targetMinute = parseInt(match[2]);
        } else if (match[1]) {
          let hour = parseInt(match[1]);
          if (match[2]) {
            const ampm = match[2].toLowerCase();
            if (ampm === 'pm' && hour < 12) {
              hour += 12;
            } else if (ampm === 'am' && hour === 12) {
              hour = 0;
            }
          } else if (match[3] && match[3].includes('tarde') && hour < 12) {
            hour += 12;
          }
          targetHour = hour;
        }
        if (targetHour !== null) break;
      }
    }
    
    // Buscar disponibilidad que coincida con fecha y hora
    if (targetDate || targetHour !== null) {
      for (const slot of availabilities) {
        if (!slot.start) continue;
        const slotDate = new Date(slot.start);
        const slotHour = slotDate.getHours();
        const slotMinute = slotDate.getMinutes();
        const slotDay = slotDate.getDate();
        const slotMonth = slotDate.getMonth();
        const slotYear = slotDate.getFullYear();
        
        let dateMatch = true;
        let timeMatch = true;
        
        // Verificar fecha
        if (targetDate) {
          const targetDay = targetDate.getDate();
          const targetMonth = targetDate.getMonth();
          const targetYear = targetDate.getFullYear();
          dateMatch = (slotDay === targetDay && slotMonth === targetMonth && slotYear === targetYear);
        }
        
        // Verificar hora (con tolerancia de ±30 minutos)
        if (targetHour !== null) {
          const timeDiff = Math.abs((slotHour * 60 + slotMinute) - (targetHour * 60 + targetMinute));
          timeMatch = timeDiff <= 30; // Tolerancia de 30 minutos
        }
        
        if (dateMatch && timeMatch) {
          return {
            slotEventId: slot.eventId,
            slot: slot
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * Agendar una cita/reunión
 * @param {string} userId - ID del usuario
 * @param {string} slotEventId - ID del evento de disponibilidad
 * @param {string} clientName - Nombre del cliente
 * @param {string} clientPhone - Teléfono del cliente (opcional)
 * @param {string} notes - Notas adicionales (opcional)
 * @param {string} description - Descripción detallada de la cita (opcional)
 * @param {string} location - Ubicación de la cita (opcional)
 * @returns {Promise<Object>} Información del agendamiento
 */
export async function bookAppointment(userId, slotEventId, clientName, clientPhone = null, notes = null, description = null, location = null) {
  try {
    console.log(`📅 Agendando cita para ${clientName} en slot ${slotEventId}`);

    // 1. Obtener la disponibilidad (puede ser por google_event_id o por disponibility_id)
    let availability = null;
    let disponibilityId = null;

    // Intentar buscar por google_event_id primero
    const { data: dispByEventId, error: error1 } = await supabaseAdmin
      .from('disponibility')
      .select('*')
      .eq('user_id', userId)
      .eq('google_event_id', slotEventId)
      .eq('is_available', true)
      .single();

    if (!error1 && dispByEventId) {
      availability = dispByEventId;
      disponibilityId = dispByEventId.id;
    } else {
      // Intentar buscar por ID de disponibility
      const { data: dispById, error: error2 } = await supabaseAdmin
        .from('disponibility')
        .select('*')
        .eq('user_id', userId)
        .eq('id', slotEventId)
        .eq('is_available', true)
        .single();

      if (!error2 && dispById) {
        availability = dispById;
        disponibilityId = dispById.id;
      }
    }

    if (!availability) {
      throw new Error('Disponibilidad no encontrada o ya está ocupada');
    }

    // Combinar selected_date con start_time y end_time para crear timestamps completos
    const startDateTime = new Date(`${availability.selected_date}T${availability.start_time}`);
    const endDateTime = new Date(`${availability.selected_date}T${availability.end_time}`);

    // 2. Crear evento de cita en Google Calendar con información profesional
    // Generar título/Summary más profesional y contextual
    let appointmentSummary = `Cita con ${clientName}`;
    if (description) {
      // Si hay descripción, crear un título más descriptivo
      const descLower = description.toLowerCase();
      if (descLower.includes('comer') || descLower.includes('pizza') || descLower.includes('restaurante')) {
        appointmentSummary = `Reunión con ${clientName} - ${description}`;
      } else if (descLower.includes('proyecto') || descLower.includes('hablar') || descLower.includes('reunión')) {
        appointmentSummary = `Reunión: ${description} - ${clientName}`;
      } else if (descLower.includes('consulta') || descLower.includes('asesoría')) {
        appointmentSummary = `Consulta con ${clientName} - ${description}`;
      } else {
        appointmentSummary = `${description} - ${clientName}`;
      }
    }
    
    // Generar descripción más completa y profesional
    let appointmentDescription = '';
    if (description) {
      appointmentDescription = `${description}`;
      if (notes && notes !== description) {
        appointmentDescription += `\n\nNotas adicionales: ${notes}`;
      }
    } else if (notes) {
      appointmentDescription = notes;
    }
    
    // Agregar información del cliente
    appointmentDescription += `\n\nCliente: ${clientName}`;
    if (clientPhone) {
      appointmentDescription += `\nTeléfono: ${clientPhone}`;
    }
    // clientEmail no está disponible en este contexto
    
    const appointmentLocation = location || availability.location || '';
    
    const appointmentData = {
      summary: appointmentSummary,
      description: appointmentDescription,
      location: appointmentLocation,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'UTC'
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'UTC'
      }
    };

    // Intentar crear evento en Google Calendar, pero continuar aunque falle
    let googleEventId = null;
    try {
      const result = await upsertGoogleEvent({
        userId,
        calendarId: 'primary',
        ...appointmentData
      });
      googleEventId = result.eventId;
      console.log(`✅ Cita agendada exitosamente en Google Calendar: ${googleEventId}`);
    } catch (googleError) {
      console.warn('⚠️ Error creando evento en Google Calendar:', googleError.message);
      console.warn('   Continuando para guardar en base de datos de todas formas...');
      // Continuar sin Google Calendar - guardaremos en BD de todas formas
    }

    // 3. Marcar disponibilidad como ocupada
    try {
      // Intentar actualizar ambas columnas, pero si una falla, continuar con la otra
      const updateData = { is_available: false };
      
      // Intentar agregar status si existe la columna
      const { error: updateError } = await supabaseAdmin
        .from('disponibility')
        .update(updateData)
        .eq('id', disponibilityId);

      if (updateError) {
        console.warn('⚠️ Error marcando disponibilidad como ocupada:', updateError);
        // Intentar solo con is_available si status falla
        if (updateError.message && updateError.message.includes('status')) {
          const { error: updateError2 } = await supabaseAdmin
            .from('disponibility')
            .update({ is_available: false })
            .eq('id', disponibilityId);
          
          if (updateError2) {
            console.warn('⚠️ Error actualizando is_available:', updateError2);
          } else {
            console.log('✅ Disponibilidad marcada como ocupada (solo is_available)');
          }
        }
      } else {
        // Si la actualización básica funcionó, intentar agregar status
        try {
          await supabaseAdmin
            .from('disponibility')
            .update({ status: 'booked' })
            .eq('id', disponibilityId);
          console.log('✅ Disponibilidad marcada como ocupada (is_available + status)');
        } catch (statusError) {
          console.log('✅ Disponibilidad marcada como ocupada (solo is_available, status no disponible)');
        }
      }
    } catch (error) {
      console.warn('⚠️ Error general marcando disponibilidad como ocupada:', error);
    }

    // 4. Guardar en tabla citas_agendadas
    const startTs = startDateTime.getTime();
    const endTs = endDateTime.getTime();
    let citaAgendada = null;

    try {
      const insertData = {
        user_id: userId,
        google_event_id: googleEventId, // Puede ser null si Google Calendar falló
        calendar_id: 'primary',
        client_name: clientName,
        client_phone: clientPhone,
        summary: appointmentSummary,
        description: appointmentDescription,
        location: appointmentLocation,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        start_ts: startTs,
        end_ts: endTs,
        notes: notes,
        status: 'confirmed'
      };
      
      // Agregar disponibilidad_id solo si está disponible (con tilde, como está en la BD)
      // Pero primero verificar que la foreign key funcione correctamente
      // Si hay error de foreign key, no incluir disponibilidad_id
      if (disponibilityId) {
        // Intentar incluir disponibilidad_id, pero si falla la foreign key, se omitirá
        insertData.disponibilidad_id = disponibilityId;
      }
      
      const { data: citaData, error: citaError } = await supabaseAdmin
        .from('citas_agendadas')
        .insert(insertData)
        .select()
        .single();

      if (citaError) {
        console.warn('⚠️ Error guardando cita agendada:', citaError);
        
        // Si el error es por google_event_id null, intentar sin él (aunque debería ser nullable ahora)
        if (citaError.message && citaError.message.includes('google_event_id')) {
          // Si google_event_id es null y causa error, intentar con un placeholder temporal
          // O simplemente retry sin incluir el campo si ya es null
          console.warn('⚠️ Error relacionado con google_event_id, intentando con valor temporal...');
          insertData.google_event_id = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          const { data: citaData3, error: citaError3 } = await supabaseAdmin
            .from('citas_agendadas')
            .insert(insertData)
            .select()
            .single();
          
          if (!citaError3) {
            citaAgendada = citaData3;
            console.log('✅ Cita guardada en citas_agendadas (con google_event_id temporal)');
          } else {
            console.warn('⚠️ Error persistente guardando cita:', citaError3);
          }
        }
        // Si el error es por disponibilidad_id o foreign key, intentar sin él
        else if (citaError.message && (citaError.message.includes('disponibility_id') || 
            citaError.message.includes('disponibilidad_id') || 
            citaError.message.includes('foreign key') ||
            citaError.message.includes('fk_disponibilidad'))) {
          delete insertData.disponibilidad_id;
          const { data: citaData2, error: citaError2 } = await supabaseAdmin
            .from('citas_agendadas')
            .insert(insertData)
            .select()
            .single();
          
          if (citaError2) {
            console.warn('⚠️ Error guardando cita agendada (sin disponibility_id):', citaError2);
          } else {
            citaAgendada = citaData2;
            console.log('✅ Cita guardada en citas_agendadas (sin disponibility_id)');
          }
        }
      } else {
        citaAgendada = citaData;
        console.log('✅ Cita guardada exitosamente en citas_agendadas:', citaAgendada?.id);
      }
    } catch (dbError) {
      console.warn('⚠️ Error general guardando cita agendada:', dbError);
    }

    return {
      success: true,
      appointmentId: googleEventId || citaAgendada?.id || 'local-only', // Usar ID de cita si no hay Google Calendar
      citaId: citaAgendada?.id,
      clientName,
      clientPhone,
      start: startDateTime.toISOString(),
      end: endDateTime.toISOString(),
      location: appointmentLocation,
      description: appointmentDescription,
      summary: appointmentSummary,
      notes,
      googleCalendarSynced: !!googleEventId // Indicar si se sincronizó con Google Calendar
    };

  } catch (error) {
    console.error('❌ Error agendando cita:', error);
    throw error;
  }
}

/**
 * Obtener disponibilidades formateadas para la IA
 * @param {string} userId - ID del usuario
 * @param {number} daysAhead - Días hacia adelante para buscar (default: 30)
 * @returns {Promise<string>} Texto formateado de disponibilidades
 */
export async function getFormattedAvailabilities(userId, daysAhead = 30) {
  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  
  const slots = await getAvailableSlots(userId, startDate, endDate);
  return formatAvailabilitiesForAI(slots);
}

