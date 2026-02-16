// src/middleware/calendarNormalization.js

/**
 * Middleware para normalizar calendar IDs en requests
 * Convierte diferentes formatos de calendar ID a un formato estándar
 */
export function normalizeCalendarId(req, res, next) {
  try {
    // Normalizar calendarId en body
    if (req.body && req.body.calendarId) {
      req.body.calendarId = normalizeId(req.body.calendarId);
    }

    // Normalizar calendarId en query params
    if (req.query && req.query.calendarId) {
      req.query.calendarId = normalizeId(req.query.calendarId);
    }

    // Normalizar calendarId en params
    if (req.params && req.params.calendarId) {
      req.params.calendarId = normalizeId(req.params.calendarId);
    }

    next();
  } catch (error) {
    console.error('❌ Error normalizing calendar ID:', error);
    res.status(400).json({
      success: false,
      message: 'Invalid calendar ID format',
      error: error.message
    });
  }
}

/**
 * Normaliza un calendar ID individual
 */
function normalizeId(calendarId) {
  if (!calendarId || typeof calendarId !== 'string') {
    return 'primary';
  }

  // Trim whitespace
  const trimmed = calendarId.trim();

  // Si está vacío, usar primary
  if (!trimmed) {
    return 'primary';
  }

  // Si es 'me' o 'self', convertir a 'primary'
  if (trimmed.toLowerCase() === 'me' || trimmed.toLowerCase() === 'self') {
    return 'primary';
  }

  // Si ya es 'primary', mantenerlo
  if (trimmed.toLowerCase() === 'primary') {
    return 'primary';
  }

  // Para emails de Google, validar formato básico
  if (trimmed.includes('@')) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      throw new Error(`Invalid email format for calendar ID: ${trimmed}`);
    }
    return trimmed.toLowerCase();
  }

  // Para otros IDs, mantener como está pero en lowercase
  return trimmed.toLowerCase();
}

/**
 * Middleware específico para validar que el usuario tenga acceso al calendario
 */
export async function validateCalendarAccess(req, res, next) {
  try {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const calendarId = req.body?.calendarId || req.query?.calendarId || req.params?.calendarId || 'primary';

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    // Para el calendario 'primary', siempre permitir acceso
    if (calendarId === 'primary') {
      req.validatedCalendarId = calendarId;
      return next();
    }

    // Para otros calendarios, verificar que el usuario tenga una cuenta de Google conectada
    const { supabaseAdmin } = await import('../db/supabase.js');
    const { data: account } = await supabaseAdmin
      .from('google_accounts')
      .select('email')
      .eq('user_id', userId)
      .single();

    if (!account) {
      return res.status(403).json({
        success: false,
        message: 'Google Calendar not connected for this user'
      });
    }

    // Si el calendarId es un email, verificar que coincida con la cuenta conectada
    if (calendarId.includes('@') && calendarId !== account.email) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to specified calendar'
      });
    }

    req.validatedCalendarId = calendarId;
    next();
  } catch (error) {
    console.error('❌ Error validating calendar access:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating calendar access',
      error: error.message
    });
  }
}

/**
 * Middleware para logs de debugging de calendar IDs
 */
export function logCalendarRequest(req, res, next) {
  const calendarId = req.body?.calendarId || req.query?.calendarId || req.params?.calendarId;
  const userId = req.user?.userId || req.user?.sub || req.user?.id;
  
  if (calendarId) {
    console.log(`📅 Calendar request - User: ${userId}, Calendar: ${calendarId}, Method: ${req.method}, Path: ${req.path}`);
  }
  
  next();
}

/**
 * Función helper para normalizar calendar IDs en servicios
 */
export function normalizeCalendarIdInService(calendarId) {
  return normalizeId(calendarId);
}

/**
 * Función helper para validar formato de calendar ID
 */
export function isValidCalendarId(calendarId) {
  try {
    const normalized = normalizeId(calendarId);
    return normalized !== null && normalized !== undefined;
  } catch (error) {
    return false;
  }
}

/**
 * Middleware combinado para aplicar normalización, validación y logging
 */
export function processCalendarRequest(req, res, next) {
  // Aplicar normalización
  normalizeCalendarId(req, res, (error) => {
    if (error) return;
    
    // Aplicar logging
    logCalendarRequest(req, res, (error) => {
      if (error) return;
      
      // Continuar con validación de acceso
      validateCalendarAccess(req, res, next);
    });
  });
}

export default {
  normalizeCalendarId,
  validateCalendarAccess,
  logCalendarRequest,
  processCalendarRequest,
  normalizeCalendarIdInService,
  isValidCalendarId
};

