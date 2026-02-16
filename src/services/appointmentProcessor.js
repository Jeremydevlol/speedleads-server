// src/services/appointmentProcessor.js
// Procesa respuestas de la IA para detectar y ejecutar agendamientos automáticos

import { getAvailableSlots, extractAppointmentInfo, bookAppointment } from './availabilityService.js';
import { supabaseAdmin } from '../db/supabase.js';
import OpenAI from 'openai';

// Cliente OpenAI para generar descripciones profesionales
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 10000,
  maxRetries: 1
});

/**
 * Genera información profesional del evento usando IA basada en el historial de conversación
 */
async function generateEventDetailsWithAI(history, clientName, appointmentDate, appointmentTime) {
  try {
    // Construir contexto de la conversación
    const conversationContext = history
      .slice(-15) // Últimos 15 mensajes para contexto
      .map(msg => {
        const role = msg.role === 'user' || msg.sender_type === 'user' ? 'Usuario' : 'Asistente';
        const content = msg.content || msg.text_content || '';
        return `${role}: ${content}`;
      })
      .join('\n\n');

    const dateStr = appointmentDate ? appointmentDate.toLocaleDateString('es-ES', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    }) : 'fecha a determinar';
    const timeStr = appointmentTime ? `${appointmentTime.hour}:${appointmentTime.minute.toString().padStart(2, '0')}` : 'hora a determinar';

    const prompt = `Basándote en la siguiente conversación, genera información profesional para un evento de calendario:

CONVERSACIÓN:
${conversationContext}

INFORMACIÓN BÁSICA:
- Nombre del cliente: ${clientName}
- Fecha: ${dateStr}
- Hora: ${timeStr}

Genera un objeto JSON con la siguiente estructura:
{
  "clientName": "Nombre completo y profesional del cliente (usa el nombre más completo que encuentres o el proporcionado)",
  "description": "Descripción profesional y detallada del evento que incluya: motivo/razón de la cita, contexto relevante de la conversación, y cualquier detalle importante mencionado",
  "location": "Ubicación del evento si se menciona (restaurante, oficina, dirección, etc.), o cadena vacía si no se menciona",
  "summary": "Título breve y profesional para el evento (máximo 60 caracteres)"
}

IMPORTANTE:
- La descripción debe ser profesional, completa y contextualizada
- Incluye información relevante de la conversación que explique el propósito de la cita
- Si mencionan "ir a comer arepas", inclúyelo en la descripción
- El nombre debe ser el más completo y profesional posible
- Si no hay ubicación clara, deja location como cadena vacía
- El summary debe ser conciso y descriptivo

Responde SOLO con el JSON, sin texto adicional antes o después.`;

    console.log('🤖 Generando detalles del evento con IA...');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Eres un asistente que genera información profesional para eventos de calendario basándote en conversaciones. Responde siempre con JSON válido.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    });

    const generatedContent = response.choices[0]?.message?.content;
    if (!generatedContent) {
      throw new Error('No se recibió respuesta de la IA');
    }

    const eventDetails = JSON.parse(generatedContent);
    console.log('✅ Detalles del evento generados con IA:', eventDetails);
    
    return {
      clientName: eventDetails.clientName || clientName,
      description: eventDetails.description || '',
      location: eventDetails.location || '',
      summary: eventDetails.summary || `Cita con ${clientName}`
    };

  } catch (error) {
    console.warn('⚠️ Error generando detalles con IA, usando valores extraídos:', error.message);
    // Retornar valores por defecto si falla la IA
    return {
      clientName: clientName,
      description: '',
      location: '',
      summary: `Cita con ${clientName}`
    };
  }
}

/**
 * Procesa la respuesta de la IA para detectar si confirma un agendamiento
 * @param {string} aiResponse - Respuesta generada por la IA
 * @param {string} userId - ID del usuario
 * @param {string} clientPhone - Teléfono del cliente (opcional)
 * @param {string} clientName - Nombre del cliente (opcional)
 * @param {Array} history - Historial de la conversación
 * @returns {Promise<Object|null>} Información del agendamiento ejecutado o null
 */
export async function processAppointmentConfirmation(aiResponse, userId, clientPhone = null, clientName = null, history = []) {
  try {
    const lowerResponse = aiResponse.toLowerCase();
    
    // Detectar si la IA está confirmando un agendamiento
    const isConfirming = lowerResponse.includes('agendado') ||
                        lowerResponse.includes('agendé') ||
                        lowerResponse.includes('he agendado') ||
                        lowerResponse.includes('cita confirmada') ||
                        lowerResponse.includes('confirmado') ||
                        (lowerResponse.includes('perfecto') && lowerResponse.includes('cita')) ||
                        (lowerResponse.includes('listo') && lowerResponse.includes('cita'));

    if (!isConfirming) {
      return null; // No hay confirmación de agendamiento
    }

    console.log('📅 Detectada confirmación de agendamiento en respuesta de IA');

    // Obtener todas las disponibilidades actuales (si existen)
    const availabilities = await getAvailableSlots(userId, null, null);
    
    // Buscar disponibilidades en el historial completo (no solo últimos 10)
    const recentHistory = history.slice(-20); // Últimos 20 mensajes para mejor contexto
    const availabilityMessage = recentHistory.find(msg => {
      const content = (msg.content || msg.text_content || '').toLowerCase();
      return content.includes('disponibilidad') || 
             content.includes('opción') ||
             content.includes('horario') ||
             content.match(/\d+\.\s*(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo)/i);
    });

    console.log(`📅 Disponibilidades encontradas: ${availabilities?.length || 0}, Mensaje con disponibilidades: ${availabilityMessage ? 'Sí' : 'No'}`);

    // Intentar extraer qué slot eligió el usuario del historial (priorizar si hay disponibilidades)
    let selectedSlot = null;
    
    // Primero: Extraer fecha y hora específica del mensaje del usuario
    const userMessages = recentHistory.filter(msg => 
      msg.role === 'user' || msg.sender_type === 'user'
    );
    const allUserText = userMessages.map(msg => (msg.content || msg.text_content || '')).join(' ').toLowerCase();
    
    let requestedDate = null;
    let requestedTime = null;
    
    // Extraer fecha (10 de enero, enero 10, etc.)
    const datePatterns = [
      /(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i,
      /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(\d{1,2})/i,
      /(\d{1,2})\/(\d{1,2})/,
      /(\d{4})-(\d{2})-(\d{2})/
    ];
    
    const months = {
      'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3,
      'mayo': 4, 'junio': 5, 'julio': 6, 'agosto': 7,
      'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
    };
    
    for (const pattern of datePatterns) {
      const match = allUserText.match(pattern);
      if (match) {
        const now = new Date();
        const currentYear = now.getFullYear();
        
        if (match[2] && months[match[2].toLowerCase()] !== undefined) {
          const day = parseInt(match[1]);
          const month = months[match[2].toLowerCase()];
          requestedDate = new Date(currentYear, month, day);
          console.log(`📅 Fecha extraída del mensaje: ${day} de ${match[2]}`);
        } else if (match[1] && months[match[1].toLowerCase()] !== undefined) {
          const day = parseInt(match[2]);
          const month = months[match[1].toLowerCase()];
          requestedDate = new Date(currentYear, month, day);
          console.log(`📅 Fecha extraída del mensaje: ${day} de ${match[1]}`);
        }
        
        if (requestedDate && requestedDate < now) {
          requestedDate = new Date(currentYear + 1, requestedDate.getMonth(), requestedDate.getDate());
        }
        
        if (requestedDate) break;
      }
    }
    
    // Extraer hora (3pm, 3 pm, 15:00, etc.)
    const timePatterns = [
      /a\s+las\s+(\d{1,2})\s*(am|pm|de\s+la\s+(mañana|tarde|noche))?/i,
      /(\d{1,2}):(\d{2})/,
      /(\d{1,2})\s*(am|pm|de\s+la\s+(mañana|tarde|noche))/i,
      /las\s+(\d{1,2})/i
    ];
    
    for (const pattern of timePatterns) {
      const match = allUserText.match(pattern);
      if (match) {
        if (match[1] && match[2] && !isNaN(parseInt(match[2])) && match[2].length === 2) {
          // Formato HH:MM
          requestedTime = { hour: parseInt(match[1]), minute: parseInt(match[2]) };
          console.log(`⏰ Hora extraída del mensaje: ${requestedTime.hour}:${requestedTime.minute}`);
        } else if (match[1]) {
          let hour = parseInt(match[1]);
          const ampm = (match[2] || match[3] || '').toLowerCase();
          if (ampm.includes('pm') || ampm.includes('tarde') || ampm.includes('noche')) {
            if (hour < 12) hour += 12;
          } else if (ampm.includes('am') || ampm.includes('mañana')) {
            if (hour === 12) hour = 0;
          }
          requestedTime = { hour, minute: 0 };
          console.log(`⏰ Hora extraída del mensaje: ${requestedTime.hour}:${requestedTime.minute}`);
        }
        if (requestedTime) break;
      }
    }
    
    if (availabilities && availabilities.length > 0) {
      // Si tenemos fecha y hora específica, buscar slot que coincida exactamente o que contenga la hora solicitada
      if (requestedDate && requestedTime) {
        console.log(`🔍 Buscando slot que coincida con: ${requestedDate.toLocaleDateString()} a las ${requestedTime.hour}:${requestedTime.minute}`);
        
        for (const slot of availabilities) {
          if (!slot || !slot.start) continue;
          const slotStart = new Date(slot.start);
          const slotEnd = slot.end ? new Date(slot.end) : null;
          const slotDay = slotStart.getDate();
          const slotMonth = slotStart.getMonth();
          
          const requestedDay = requestedDate.getDate();
          const requestedMonth = requestedDate.getMonth();
          
          // Verificar fecha (día y mes, año puede variar)
          const dateMatch = (slotDay === requestedDay && slotMonth === requestedMonth);
          
          if (!dateMatch) continue;
          
          // Verificar si la hora solicitada está dentro del rango de la disponibilidad
          const requestedMinutes = requestedTime.hour * 60 + requestedTime.minute;
          const slotStartMinutes = slotStart.getHours() * 60 + slotStart.getMinutes();
          const slotEndMinutes = slotEnd ? slotEnd.getHours() * 60 + slotEnd.getMinutes() : null;
          
          let timeMatch = false;
          
          // Si hay hora de fin, verificar que la hora solicitada esté dentro del rango
          if (slotEndMinutes !== null) {
            timeMatch = requestedMinutes >= slotStartMinutes && requestedMinutes <= slotEndMinutes;
          } else {
            // Si no hay hora de fin, usar tolerancia de ±30 minutos desde el inicio
            const timeDiff = Math.abs(slotStartMinutes - requestedMinutes);
            timeMatch = timeDiff <= 30;
          }
          
          if (timeMatch) {
            selectedSlot = {
              slotEventId: slot.eventId,
              slot: slot
            };
            console.log(`✅ Slot encontrado por fecha/hora (dentro del rango): ${selectedSlot.slotEventId} (${slotStart.toLocaleString()} - ${slotEnd?.toLocaleString() || 'sin fin'})`);
            break;
          }
        }
      }
      
      // Si aún no encontramos, buscar por número de opción o ID
      if (!selectedSlot) {
        const allMessages = [...userMessages, { role: 'assistant', content: aiResponse }];
        
        for (const msg of allMessages.reverse()) {
          const content = (msg.content || msg.text_content || '').toLowerCase();
          const appointmentInfo = extractAppointmentInfo(content, availabilities);
          
          if (appointmentInfo && appointmentInfo.slotEventId) {
            selectedSlot = appointmentInfo;
            console.log(`✅ Slot seleccionado encontrado por número/ID: ${appointmentInfo.slotEventId} (${appointmentInfo.slot?.start})`);
            break;
          }
        }
      }
      
      // Si aún no se encontró, intentar por fecha/hora mencionada en la respuesta de IA
      if (!selectedSlot && aiResponse) {
        for (const slot of availabilities) {
          if (!slot || !slot.start) continue;
          const slotDate = new Date(slot.start);
          const dateStr = slotDate.toLocaleDateString('es-ES', { 
            weekday: 'long', 
            day: 'numeric',
            month: 'long'
          }).toLowerCase();
          
          const timeStr = slotDate.toLocaleTimeString('es-ES', { 
            hour: '2-digit', 
            minute: '2-digit' 
          });

          if (lowerResponse.includes(dateStr) || lowerResponse.includes(timeStr)) {
            selectedSlot = {
              slotEventId: slot.eventId,
              slot: slot
            };
            console.log(`✅ Slot encontrado por fecha/hora en respuesta IA: ${selectedSlot.slotEventId}`);
            break;
          }
        }
      }
    }

    // Extraer nombre del cliente si no se proporcionó
    let finalClientName = clientName;
    if (!finalClientName) {
      // Buscar en el historial reciente si el usuario mencionó un nombre
      const recentHistory = history.slice(-10);
      const allText = recentHistory.map(msg => (msg.content || msg.text_content || '')).join(' ');
      
      // Buscar patrones mejorados - priorizar nombres completos
      // Buscar "para [nombre]" al final del mensaje (más específico y completo)
      const namePatterns = [
        // Patrón específico: "para [nombre completo]" al final (más confiable)
        /para\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+)(?:\s|$)/gi,
        // Patrón: "a nombre de [nombre]"
        /a\s+nombre\s+de\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)/gi,
        // Patrón: "para [nombre]" (simple)
        /para\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)(?:\s|$)/gi,
        // Patrón: "es para [nombre]"
        /es\s+para\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)/gi,
        // Patrón: "me llamo/soy [nombre]"
        /(?:me\s+llamo|soy|mi\s+nombre\s+es)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)/gi
      ];
      
      // Palabras comunes que no son nombres
      const stopWords = ['el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'a', 'al', 'ir', 'comer', 'agendar', 'cita', 'reunión', 'consulta'];
      
      // Buscar todos los nombres y tomar el más completo (más palabras)
      let foundNames = [];
      for (const pattern of namePatterns) {
        const matches = [...allText.matchAll(pattern)];
        for (const match of matches) {
          if (match[1]) {
            const name = match[1].trim();
            // Filtrar palabras comunes y frases que no son nombres
            const nameWords = name.split(/\s+/);
            const isValidName = nameWords.length <= 4 && // Máximo 4 palabras (ej: "Juan Carlos Pérez García")
              !nameWords.some(word => stopWords.includes(word.toLowerCase())) &&
              name.length > 2 && // Mínimo 3 caracteres
              !name.match(/^(para|ir|comer|agendar|el|la|los|las)/i); // No empezar con palabras comunes
            
            if (isValidName) {
              foundNames.push(name);
            }
          }
        }
      }
      
      // Si hay múltiples nombres, priorizar:
      // 1. El que aparece al final del texto (más reciente)
      // 2. El más largo (más completo)
      // 3. El que tiene más palabras
      if (foundNames.length > 0) {
        // Encontrar la posición de cada nombre en el texto
        const namesWithPosition = foundNames.map(name => {
          const lastIndex = allText.toLowerCase().lastIndexOf(name.toLowerCase());
          return { name, position: lastIndex, words: name.split(/\s+/).length, length: name.length };
        });
        
        // Ordenar: primero por posición (más al final), luego por palabras, luego por longitud
        namesWithPosition.sort((a, b) => {
          if (a.position !== b.position) return b.position - a.position; // Más al final primero
          if (a.words !== b.words) return b.words - a.words; // Más palabras primero
          return b.length - a.length; // Más largo primero
        });
        
        finalClientName = namesWithPosition[0].name;
        console.log(`✅ Nombre extraído del historial: ${finalClientName} (de ${foundNames.length} opciones encontradas)`);
      }
      
      finalClientName = finalClientName || 'Cliente';
    }
    
    // Extraer información adicional de la conversación (descripción, ubicación, motivo)
    let appointmentDescription = '';
    let appointmentLocation = '';
    let appointmentNotes = '';
    
    // Buscar en el historial reciente información sobre la cita
    const allMessages = history.slice(-20).map(msg => 
      (msg.content || msg.text_content || '').toLowerCase()
    ).join(' ');
    
    // Extraer motivo/descripción de la cita - patrones mejorados para capturar mejor el contexto
    const descriptionPatterns = [
      /(?:para|ir a|vamos a|sobre|acerca de|trataremos|hablaremos|revisaremos)\s+([^.!?]+(?:cita|reunión|consulta|revisión|charla|comer|hacer|ver|revisar|trabajar|estudiar|entrenar|ir|viajar)[^.!?]*)/i,
      /(?:la cita es|la reunión es|será para|es para)\s+([^.!?]+)/i,
      /para\s+(?:ir\s+a|hacer|ver|revisar|comer|trabajar|estudiar|entrenar)\s+([^.!?]+)/i,
      /(?:ir a|vamos a|queremos)\s+([^.!?]+)/i
    ];
    
    for (const pattern of descriptionPatterns) {
      const match = allMessages.match(pattern);
      if (match && match[1]) {
        let desc = match[1].trim();
        // Limpiar palabras comunes al inicio
        desc = desc.replace(/^(el|la|los|las|un|una|de|del|en|a|al|comer|hacer|ver|ir)\s+/i, '');
        if (desc.length > 5) { // Solo si tiene al menos 5 caracteres
          appointmentDescription = desc;
          break;
        }
      }
    }
    
    // Si no se encontró descripción con patrones, buscar frases comunes después de "para"
    if (!appointmentDescription) {
      const paraMatch = allMessages.match(/para\s+([^.!?]+(?:arepa|comida|reunión|cita|consulta|trabajo|estudio|entrenamiento|viaje|comer|hacer|ver|revisar)[^.!?]*)/i);
      if (paraMatch && paraMatch[1]) {
        appointmentDescription = paraMatch[1].trim();
      }
    }
    
    // Si aún no hay descripción, buscar cualquier frase después de "para" que tenga sentido
    if (!appointmentDescription) {
      const generalParaMatch = allMessages.match(/para\s+([^.!?]{5,50})/i);
      if (generalParaMatch && generalParaMatch[1]) {
        let desc = generalParaMatch[1].trim();
        // Filtrar palabras que no son relevantes
        if (!desc.match(/^(el|la|los|las|un|una|de|del|en|a|al|su|sus|mi|mis|tu|tus|nuestro|nuestra)$/i)) {
          appointmentDescription = desc;
        }
      }
    }
    
    console.log(`📝 Descripción extraída: ${appointmentDescription || 'No encontrada'}`);
    console.log(`📍 Ubicación extraída: ${appointmentLocation || 'No encontrada'}`);
    console.log(`👤 Nombre del cliente: ${finalClientName}`);
    
    // GENERAR INFORMACIÓN CON IA - Esto se hará cuando tengamos fecha/hora confirmada
    
    // Extraer ubicación si se menciona - patrones mejorados
    const locationPatterns = [
      /(?:en|ubicado en|dirección|direccion|dirección es|direccion es|restaurante|local|lugar|ubicación|ubicacion)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ][^.!?]+?)(?:\s+(?:para|a|el|la|los|las|del|de|con|y|,|\.|$))/i,
      /(?:lugar|ubicación|ubicacion|restaurante|local)\s*:?\s*([A-ZÁÉÍÓÚÑa-záéíóúñ][^.!?]+)/i,
      /en\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+)*)/i
    ];
    
    for (const pattern of locationPatterns) {
      const match = allMessages.match(pattern);
      if (match && match[1]) {
        let location = match[1].trim();
        // Limpiar palabras comunes al final
        location = location.replace(/\s+(?:para|a|el|la|los|las|del|de|con|y|,|\.)$/i, '');
        if (location.length > 2) {
          appointmentLocation = location;
          break;
        }
      }
    }
    
    // Crear notas combinando información relevante
    if (appointmentDescription) {
      appointmentNotes = `Motivo: ${appointmentDescription}`;
    }
    if (appointmentLocation) {
      appointmentNotes += appointmentNotes ? ` | Ubicación: ${appointmentLocation}` : `Ubicación: ${appointmentLocation}`;
    }

    // Si no hay slot seleccionado, intentar extraer fecha/hora de la conversación y crear evento directamente
    if (!selectedSlot) {
      console.log('📅 No hay slot seleccionado, intentando extraer fecha/hora de la conversación...');
      
      // Usar fecha y hora ya extraídas del mensaje del usuario, o buscar en el historial
      let appointmentDate = requestedDate;
      let appointmentTime = requestedTime;
      
      // Si no se extrajeron del mensaje del usuario, buscar en el historial
      if (!appointmentDate || !appointmentTime) {
        const allMessages = [...recentHistory, { role: 'assistant', content: aiResponse }];
        const now = new Date();
        const currentYear = now.getFullYear();
      
      // Primero buscar palabras relativas (mañana, hoy, etc.)
      for (const msg of allMessages) {
        const content = (msg.content || msg.text_content || '').toLowerCase();
        
        if (content.includes('mañana') && !content.includes('pasado')) {
          appointmentDate = new Date(now);
          appointmentDate.setDate(appointmentDate.getDate() + 1);
          console.log('📅 Fecha encontrada: mañana');
          break;
        } else if (content.includes('pasado mañana')) {
          appointmentDate = new Date(now);
          appointmentDate.setDate(appointmentDate.getDate() + 2);
          console.log('📅 Fecha encontrada: pasado mañana');
          break;
        } else if (content.includes('hoy')) {
          appointmentDate = new Date(now);
          console.log('📅 Fecha encontrada: hoy');
          break;
        }
      }
      
      // Si no se encontró fecha relativa, buscar fechas absolutas
      const datePatterns = [
        /(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i,
        /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(\d{1,2})/i,
        /(\d{1,2})\/(\d{1,2})/,
        /(\d{4})-(\d{2})-(\d{2})/
      ];
      
      // Buscar hora (5, 5pm, 17:00, etc.)
      const timePatterns = [
        /a\s+las\s+(\d{1,2})\s*(am|pm)?/i,  // "a las 10 am"
        /(\d{1,2}):(\d{2})/,  // "10:00"
        /(\d{1,2})\s*(am|pm)/i,  // "10 am" o "10am"
        /(\d{1,2})\s+de\s+la\s+(mañana|tarde|noche)/i,  // "5 de la tarde"
        /las\s+(\d{1,2})/i,  // "las 10"
        /\b(\d{1,2})\s*(?:de\s+la\s+)?(?:mañana|tarde|noche|pm|am)?\b/i  // "7" o "7 pm" o "7 de la tarde"
      ];
      
      for (const msg of allMessages) {
        const content = (msg.content || msg.text_content || '').toLowerCase();
        
        // Buscar fecha absoluta (solo si no se encontró fecha relativa)
        if (!appointmentDate) {
          for (const pattern of datePatterns) {
            const match = content.match(pattern);
            if (match) {
              // Mapeo de meses en español
              const months = {
                'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3,
                'mayo': 4, 'junio': 5, 'julio': 6, 'agosto': 7,
                'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
              };
              
              if (match[2] && months[match[2].toLowerCase()] !== undefined) {
                const day = parseInt(match[1]);
                const month = months[match[2].toLowerCase()];
                appointmentDate = new Date(currentYear, month, day);
                console.log(`📅 Fecha encontrada: ${day} de ${match[2]}`);
              } else if (match[1] && months[match[1].toLowerCase()] !== undefined) {
                const day = parseInt(match[2]);
                const month = months[match[1].toLowerCase()];
                appointmentDate = new Date(currentYear, month, day);
                console.log(`📅 Fecha encontrada: ${day} de ${match[1]}`);
              }
              
              if (appointmentDate && appointmentDate < now) {
                appointmentDate = new Date(currentYear + 1, appointmentDate.getMonth(), appointmentDate.getDate());
              }
              
              if (appointmentDate) break;
            }
          }
        }
        
        // Buscar hora
        if (!appointmentTime) {
          for (const pattern of timePatterns) {
            const match = content.match(pattern);
            if (match) {
              if (match[1] && match[2] && !isNaN(parseInt(match[2])) && match[2].length === 2) {
                // Formato HH:MM (match[2] es minutos)
                appointmentTime = { hour: parseInt(match[1]), minute: parseInt(match[2]) };
                console.log(`⏰ Hora encontrada: ${appointmentTime.hour}:${appointmentTime.minute}`);
              } else if (match[1]) {
                // Formato simple (10, 10am, 10pm, etc.)
                let hour = parseInt(match[1]);
                if (match[2]) {
                  const ampm = match[2].toLowerCase();
                  if (ampm === 'pm' && hour < 12) {
                    hour += 12;
                  } else if (ampm === 'am' && hour === 12) {
                    hour = 0;
                  } else if (ampm.includes('tarde') && hour < 12) {
                    hour += 12;
                  }
                }
                appointmentTime = { hour, minute: 0 };
                console.log(`⏰ Hora encontrada: ${appointmentTime.hour}:${appointmentTime.minute}`);
              }
              
              if (appointmentTime) break;
            }
          }
        }
        
        if (appointmentDate && appointmentTime) break;
      }
      } // Cerrar el if (!appointmentDate || !appointmentTime)
      
      // Si encontramos fecha y hora, crear el evento directamente
      if (appointmentDate && appointmentTime) {
        console.log(`📅 Creando evento directamente: ${appointmentDate.toLocaleDateString()} a las ${appointmentTime.hour}:${appointmentTime.minute.toString().padStart(2, '0')}`);
        console.log(`📅 Fecha extraída: ${appointmentDate}, Hora extraída: ${appointmentTime.hour}:${appointmentTime.minute}`);
        
        // Generar información profesional con IA
        const aiEventDetails = await generateEventDetailsWithAI(
          history,
          finalClientName,
          appointmentDate,
          appointmentTime
        );
        
        // Usar la información generada por IA o la extraída manualmente como fallback
        const finalName = aiEventDetails.clientName || finalClientName;
        const finalDescription = aiEventDetails.description || appointmentDescription || '';
        const finalLocation = aiEventDetails.location || appointmentLocation || '';
        const finalSummary = aiEventDetails.summary || `Cita con ${finalName}`;
        
        // Configurar fecha y hora
        const startDateTime = new Date(appointmentDate);
        startDateTime.setHours(appointmentTime.hour, appointmentTime.minute, 0, 0);
        
        const endDateTime = new Date(startDateTime);
        endDateTime.setHours(startDateTime.getHours() + 1); // Duración de 1 hora por defecto
        
        // Crear evento directamente en Google Calendar con información completa generada por IA
        const { upsertGoogleEvent } = await import('./googleCalendar.service.js');
        
        // Construir descripción completa con información de IA
        let fullDescription = finalDescription;
        if (clientPhone) {
          fullDescription += (fullDescription ? '\n\n' : '') + `Teléfono: ${clientPhone}`;
        }
        if (!fullDescription) {
          fullDescription = 'Cita agendada automáticamente desde conversación';
        }
        
        // Intentar crear evento en Google Calendar, pero no fallar si hay error
        let googleEventId = null;
        try {
          const result = await upsertGoogleEvent({
            userId,
            calendarId: 'primary',
            summary: finalSummary,
            description: fullDescription.trim(),
            location: finalLocation,
            start: {
              dateTime: startDateTime.toISOString(),
              timeZone: 'UTC'
            },
            end: {
              dateTime: endDateTime.toISOString(),
              timeZone: 'UTC'
            }
          });
          
          googleEventId = result?.eventId || null;
          if (googleEventId) {
            console.log(`✅ Evento creado directamente en Google Calendar: ${googleEventId}`);
          }
        } catch (googleError) {
          console.warn('⚠️ Error creando evento en Google Calendar, guardando en BD de todas formas:', googleError.message);
          // Continuar con el proceso aunque falle Google Calendar
        }
        
        // Guardar en citas_agendadas (siempre, aunque falle Google Calendar)
        try {
          const { data: cita, error: citaError } = await supabaseAdmin
            .from('citas_agendadas')
            .insert({
              user_id: userId,
              disponibilidad_id: null, // No hay disponibilidad previa
              google_event_id: googleEventId, // Puede ser null si falló Google Calendar
              calendar_id: 'primary',
              client_name: finalName,
              client_phone: clientPhone,
              summary: finalSummary,
              description: fullDescription.trim(),
              location: finalLocation,
              start_time: startDateTime.toISOString(),
              end_time: endDateTime.toISOString(),
              start_ts: startDateTime.getTime(),
              end_ts: endDateTime.getTime(),
            notes: appointmentNotes || `Agendado automáticamente desde conversación`,
            status: 'confirmed'
            })
            .select()
            .single();

          if (citaError) {
            console.error('⚠️ Error guardando cita en citas_agendadas:', citaError);
            throw citaError; // Lanzar error solo si falla la BD, no Google Calendar
          } else {
            console.log(`✅ Cita guardada en citas_agendadas: ${cita.id}`);
          }
          
          return {
            success: true,
            appointment: {
              appointmentId: googleEventId || cita.id, // Usar ID de BD si no hay Google Calendar
              summary: finalSummary,
              start: startDateTime.toISOString(),
              end: endDateTime.toISOString(),
              location: finalLocation || null,
              description: finalDescription || null,
              notes: appointmentNotes || `Agendado automáticamente desde conversación`
            },
            slotEventId: googleEventId || cita.id,
            clientName: finalName
          };
        } catch (dbError) {
          console.error('⚠️ Error guardando cita en BD:', dbError);
          throw dbError; // Solo lanzar error si falla la BD
        }
      } else {
        console.log('⚠️ No se pudo extraer fecha y hora de la conversación');
        console.log(`📅 Fecha encontrada: ${appointmentDate ? appointmentDate.toLocaleDateString() : 'null'}`);
        console.log(`⏰ Hora encontrada: ${appointmentTime ? `${appointmentTime.hour}:${appointmentTime.minute}` : 'null'}`);
        console.log(`📝 Últimos mensajes analizados:`, allMessages.slice(-3).map(m => (m.content || m.text_content || '').substring(0, 50)));
        return null;
      }
    }

    // Si hay slot seleccionado y válido, usar bookAppointment
    if (selectedSlot && selectedSlot.slotEventId) {
      console.log(`📅 Ejecutando agendamiento para ${finalClientName}...`);
      
      // Obtener fecha y hora del slot para generar detalles con IA
      const slotDate = selectedSlot.slot?.start ? new Date(selectedSlot.slot.start) : null;
      const slotTime = slotDate ? { hour: slotDate.getHours(), minute: slotDate.getMinutes() } : null;
      
      // Generar información profesional con IA
      const aiEventDetails = await generateEventDetailsWithAI(
        history,
        finalClientName,
        slotDate,
        slotTime
      );
      
      // Usar la información generada por IA
      const finalName = aiEventDetails.clientName || finalClientName;
      const finalDescription = aiEventDetails.description || appointmentDescription || '';
      const finalLocation = aiEventDetails.location || appointmentLocation || '';
      
      const appointment = await bookAppointment(
        userId,
        selectedSlot.slotEventId,
        finalName,
        clientPhone,
        appointmentNotes || `Agendado automáticamente desde conversación`,
        finalDescription,
        finalLocation
      );

      console.log(`✅ Agendamiento ejecutado exitosamente: ${appointment.appointmentId}`);

      return {
        success: true,
        appointment,
        slotEventId: selectedSlot.slotEventId,
        clientName: finalName
      };
    }
    
    // Si llegamos aquí sin agendar, retornar null
    return null;

  } catch (error) {
    console.error('❌ Error procesando confirmación de agendamiento:', error);
    return null;
  }
}

