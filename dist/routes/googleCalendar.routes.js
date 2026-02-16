// src/routes/googleCalendar.routes.js
import express from 'express';
import { validateJwt } from '../../dist/config/jwt.js';
import { startCalendarWatch } from '../services/gcalWatch.js';
import {
    deleteGoogleEvent,
    fullSync,
    generateAuthUrl,
    getOAuth2Client,
    handleOAuthCallback,
    incrementalSync,
    saveUserTokens,
    upsertGoogleEvent
} from '../services/googleCalendar.service.js';

const router = express.Router();

// Función helper para extraer userId del token JWT
const getUserIdFromToken = (req) => {
  return req.user?.userId || req.user?.sub || req.user?.id;
};

/**
 * ENDPOINTS DE AUTENTICACIÓN OAUTH
 */

// GET /api/auth/google/calendar/connect?userId=UUID&redirect=URI
router.get('/auth/google/calendar/connect', async (req, res) => {
  try {
    const { userId, redirect } = req.query;
    
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'userId parameter is required'
      });
    }

    // Default to env if not provided
    const redirectUri = redirect || process.env.GOOGLE_REDIRECT_URI;
    
    console.log(`🔗 Generando Auth URL para usuario: ${userId}`);
    console.log(`🔗 Redirect URI a usar en Google: ${redirectUri}`);

    const authUrl = generateAuthUrl(userId, redirectUri);
    res.redirect(authUrl);
  } catch (error) {
    console.error('❌ Error generating auth URL:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error generating authorization URL',
      error: error.message
    });
  }
});

// GET /api/auth/google/calendar/callback
router.get('/auth/google/calendar/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ 
        success: false, 
        message: 'Authorization code is required' 
      });
    }

    if (!state || typeof state !== 'string') {
      return res.status(400).json({ 
        success: false, 
        message: 'State parameter is required' 
      });
    }

    // Decodificar state para obtener userId
    let stateData;
    try {
        stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (e) {
        // Fallback para states antiguos que solo eran userId
        stateData = { userId: state }; // Esto es poco probable si es base64, pero por seguridad
        // Si no es un JSON válido después de decodificar..
        if (!stateData.userId && state) {
           // Asumir que state decodificado ES el userId
           stateData = { userId: Buffer.from(state, 'base64').toString() };
        }
    }
    
    const { userId, redirectUri: stateRedirectUri } = stateData;

    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid state parameter: userId missing' 
      });
    }

    // Usar la redirectUri del state si existe, sino la de env
    const callbackRedirectUri = process.env.GOOGLE_REDIRECT_URI; // Para getToken debe coincidir con la registrada
    // IMPORTANTE: Al intercambiar el token, debemos usar LA MISMA redirect_uri que se usó al generar la URL.
    // Si generamos la URL con `redirectUri` (custom), debemos usar esa aquí.
    
    const tokenExchangeRedirectUri = stateRedirectUri || process.env.GOOGLE_REDIRECT_URI;
    
    console.log(`🔗 Token Exchange Redirect URI: ${tokenExchangeRedirectUri}`);

    // Manejar callback OAuth
    await handleOAuthCallback(code, userId, tokenExchangeRedirectUri);

    // Iniciar full sync
    await fullSync(userId);

    // Iniciar watch para el calendario principal
    const oauth2Client = await getOAuth2Client(userId);
    await startCalendarWatch(oauth2Client, userId, 'primary');

    // Redirigir a página de éxito
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    // Si state traía redirectUri, podríamos intentar deducir a dónde volver, pero por ahora vamos al frontend configurado.
    res.redirect(`${frontendUrl}/calendar?connected=true&userId=${userId}`);
  } catch (error) {
    console.error('❌ Error in OAuth callback:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/calendar?error=connection_failed&message=${encodeURIComponent(error.message)}`);
  }
});

// POST /api/google/calendar/saveCalendarToken - Guardar tokens manualmente (desde frontend Next.js)
// Nota: Este endpoint se monta bajo /api, por lo tanto la ruta completa es /api/calendar/saveCalendarToken (si el router está en /api)
// O si el router está en /api, y definimos /calendar/saveCalendarToken, sería /api/calendar/saveCalendarToken.
router.post('/calendar/saveCalendarToken', async (req, res) => {
  try {
    const { userId, tokens, email } = req.body;

    if (!userId || !tokens) {
      return res.status(400).json({ 
        success: false, 
        message: 'userId and tokens are required' 
      });
    }

    await saveUserTokens(userId, tokens, email);

    res.json({ success: true, message: 'Tokens saved successfully' });
  } catch (error) {
    console.error('❌ Error saving tokens:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error saving tokens',
      error: error.message
    });
  }
});

/**
 * ENDPOINTS DE GESTIÓN DE EVENTOS
 */

// POST /api/google/calendar/upsert - Crear/actualizar evento
router.post('/google/calendar/upsert', validateJwt, async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    const eventData = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    const result = await upsertGoogleEvent({
      userId,
      ...eventData
    });

    res.json({ 
      success: true, 
      message: 'Event upserted successfully',
      eventId: result.eventId
    });
  } catch (error) {
    console.error('❌ Error upserting event:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error upserting event',
      error: error.message
    });
  }
});

// POST /api/google/calendar/availability - Crear disponibilidad (se guarda en BD y Google Calendar)
router.post('/google/calendar/availability', validateJwt, async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    const {
      start,
      end,
      summary = 'Disponibilidad',
      description = '',
      location = '',
      calendarId = 'primary'
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        message: 'start and end are required'
      });
    }

    console.log(`📅 Creando disponibilidad para usuario ${userId}:`, {
      start,
      end,
      summary
    });

    // Verificar si el usuario tiene cuenta de Google conectada
    const { supabaseAdmin } = await import('../db/supabase.js');
    const { data: account, error: accountError } = await supabaseAdmin
      .from('google_accounts')
      .select('email, expiry_date')
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      return res.status(400).json({
        success: false,
        message: 'No hay cuenta de Google conectada. Conecta tu cuenta primero.',
        connectUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/calendar?connect=true`
      });
    }

    // Verificar si el token está expirado
    const isExpired = new Date(account.expiry_date) < new Date();
    if (isExpired) {
      console.warn('⚠️ Token de Google expirado, se intentará refrescar o usar fallback local.');
      // NO retornamos error aquí, permitimos continuar para que funcione el fallback de BD local
      /*
      return res.status(400).json({
        success: false,
        message: 'Token de Google expirado. Reconecta tu cuenta.',
        tokenExpired: true,
        reconnectUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/calendar?reconnect=true`
      });
      */
    }

    // Preparar datos del evento para Google Calendar
    const startDateTime = new Date(start).toISOString();
    const endDateTime = new Date(end).toISOString();

    const eventData = {
      summary,
      description,
      location,
      start: {
        dateTime: startDateTime,
        timeZone: 'UTC'
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'UTC'
      }
    };

    // Crear evento en Google Calendar (pero continuar aunque falle)
    let googleEventId = null;
    let googleError = null;
    try {
      const result = await upsertGoogleEvent({
        userId,
        calendarId,
        ...eventData
      });
      googleEventId = result.eventId;
      console.log(`✅ Disponibilidad creada exitosamente en Google Calendar: ${googleEventId}`);
    } catch (error) {
      googleError = error;
      console.warn('⚠️ Error creando evento en Google Calendar:', error.message);
      console.warn('   Continuando para guardar en base de datos de todas formas...');
      // Continuar sin Google Calendar - guardaremos en BD de todas formas
    }

    // Guardar en la tabla disponibility
    const startDate = new Date(start);
    const endDate = new Date(end);
    const startTs = startDate.getTime();
    const endTs = endDate.getTime();
    
    // Extraer fecha y hora por separado para la tabla disponibility
    const selectedDate = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const startTime = startDate.toTimeString().split(' ')[0]; // HH:MM:SS
    const endTime = endDate.toTimeString().split(' ')[0]; // HH:MM:SS

    // Insertar con todas las columnas disponibles (todas las columnas ya existen después de la migración)
    const insertData = {
      user_id: userId,
      google_event_id: googleEventId, // Puede ser null si Google Calendar falló
      calendar_id: calendarId,
      selected_date: selectedDate,
      start_time: startTime,
      end_time: endTime,
      is_available: true,
      start_ts: startTs,
      end_ts: endTs,
      summary,
      description,
      location,
      status: 'available'
    };
    
    let disponibilidad = null;
    let disponibilidadError = null;
    
    const { data: insertedData, error: insertError } = await supabaseAdmin
      .from('disponibility')
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      // Si es un error de duplicado, intentar obtener la disponibilidad existente
      if (insertError.code === '23505' && insertError.message.includes('unique constraint')) {
        console.warn('⚠️ Disponibilidad duplicada, obteniendo la existente...');
        const { data: existingData, error: selectError } = await supabaseAdmin
          .from('disponibility')
          .select('*')
          .eq('user_id', userId)
          .eq('selected_date', selectedDate)
          .eq('start_time', startTime)
          .eq('end_time', endTime)
          .single();
        
        if (selectError) {
          disponibilidadError = selectError;
          console.error('❌ Error obteniendo disponibilidad existente:', selectError);
        } else {
          disponibilidad = existingData;
          console.log('✅ Disponibilidad existente obtenida:', disponibilidad.id);
        }
      } else {
        disponibilidadError = insertError;
        console.error('❌ Error guardando disponibilidad en BD:', insertError);
        console.error('   Código:', insertError.code);
        console.error('   Mensaje:', insertError.message);
        console.error('   Detalles:', insertError.details);
        console.error('   Hint:', insertError.hint);
      }
    } else {
      disponibilidad = insertedData;
      console.log('✅ Disponibilidad guardada en BD:', disponibilidad.id);
    }

    // Si hay un error y no se pudo obtener la disponibilidad existente, devolver error
    if (disponibilidadError && !disponibilidad) {
      return res.status(400).json({
        success: false,
        message: 'Error guardando disponibilidad en base de datos',
        error: disponibilidadError.message,
        code: disponibilidadError.code,
        tokenExpired: !googleEventId && googleError ? true : false,
        reconnectUrl: !googleEventId && googleError 
          ? `${process.env.FRONTEND_URL || 'http://localhost:3000'}/google-calendar/connect?userId=${userId}`
          : null
      });
    }

    res.json({
      success: true,
      message: disponibilidad && disponibilidad.id
        ? (googleEventId 
            ? 'Disponibilidad creada y guardada en Google Calendar' 
            : 'Disponibilidad guardada en base de datos (Google Calendar no disponible)')
        : 'Disponibilidad ya existía, se obtuvo la existente',
      disponibilidad: disponibilidad || {
        id: null,
        google_event_id: googleEventId,
        summary,
        description,
        location,
        start_time: startDateTime,
        end_time: endDateTime,
        status: 'available'
      },
      googleEventId: googleEventId,
      calendarId: calendarId,
      syncedAt: new Date().toISOString(),
      tokenExpired: !googleEventId && googleError ? true : false,
      reconnectUrl: !googleEventId && googleError 
        ? `${process.env.FRONTEND_URL || 'http://localhost:3000'}/google-calendar/connect?userId=${userId}`
        : null
    });

  } catch (error) {
    console.error('❌ Error creando disponibilidad:', error);
    res.status(500).json({
      success: false,
      message: 'Error creando disponibilidad',
      error: error.message
    });
  }
});

// PUT /api/google/calendar/availability - Actualizar disponibilidad existente
router.put('/google/calendar/availability', validateJwt, async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    const {
      googleEventId,
      start,
      end,
      summary,
      description,
      location,
      calendarId = 'primary'
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    if (!googleEventId) {
      return res.status(400).json({
        success: false,
        message: 'googleEventId is required to update availability'
      });
    }

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        message: 'start and end are required'
      });
    }

    console.log(`📅 Actualizando disponibilidad ${googleEventId} para usuario ${userId}`);

    // Verificar si el usuario tiene cuenta de Google conectada
    const { supabaseAdmin } = await import('../db/supabase.js');
    const { data: account, error: accountError } = await supabaseAdmin
      .from('google_accounts')
      .select('email, expiry_date')
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      return res.status(400).json({
        success: false,
        message: 'No hay cuenta de Google conectada. Conecta tu cuenta primero.',
        connectUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/calendar?connect=true`
      });
    }

    // Verificar si el token está expirado
    const isExpired = new Date(account.expiry_date) < new Date();
    if (isExpired) {
      console.warn('⚠️ Token de Google expirado, se intentará refrescar o usar fallback local.');
      // NO retornamos error aquí, permitimos continuar para que funcione el fallback de BD local
      /*
      return res.status(400).json({
        success: false,
        message: 'Token de Google expirado. Reconecta tu cuenta.',
        tokenExpired: true,
        reconnectUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/calendar?reconnect=true`
      });
      */
    }

    // Preparar datos del evento para Google Calendar
    const startDateTime = new Date(start).toISOString();
    const endDateTime = new Date(end).toISOString();

    const eventData = {
      summary: summary || undefined,
      description: description !== undefined ? description : undefined,
      location: location !== undefined ? location : undefined,
      start: {
        dateTime: startDateTime,
        timeZone: 'UTC'
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'UTC'
      }
    };

    // Eliminar campos undefined
    Object.keys(eventData).forEach(key => {
      if (eventData[key] === undefined) {
        delete eventData[key];
      }
    });

    // Actualizar evento en Google Calendar
    const result = await upsertGoogleEvent({
      userId,
      calendarId,
      googleEventId,
      ...eventData
    });

    console.log(`✅ Disponibilidad actualizada exitosamente en Google Calendar: ${result.eventId}`);

    // Obtener el evento actualizado de la base de datos
    const { data: savedEvent, error: eventError } = await supabaseAdmin
      .from('google_events')
      .select('*')
      .eq('user_id', userId)
      .eq('event_id', result.eventId)
      .single();

    if (eventError) {
      console.warn('⚠️ No se pudo obtener el evento actualizado:', eventError);
    }

    res.json({
      success: true,
      message: 'Disponibilidad actualizada en Google Calendar',
      event: savedEvent || {
        eventId: result.eventId,
        summary,
        description,
        location,
        start: startDateTime,
        end: endDateTime
      },
      googleEventId: result.eventId,
      calendarId: calendarId,
      syncedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error actualizando disponibilidad:', error);
    res.status(500).json({
      success: false,
      message: 'Error actualizando disponibilidad',
      error: error.message
    });
  }
});

// POST /api/google/calendar/delete - Eliminar evento
router.post('/google/calendar/delete', validateJwt, async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    const { calendarId = 'primary', googleEventId } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    if (!googleEventId) {
      return res.status(400).json({ 
        success: false, 
        message: 'googleEventId is required' 
      });
    }

    await deleteGoogleEvent(userId, calendarId, googleEventId);

    res.json({ 
      success: true, 
      message: 'Event deleted successfully' 
    });
  } catch (error) {
    console.error('❌ Error deleting event:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting event',
      error: error.message
    });
  }
});

// GET /api/google/calendar/events/debug - Debug: Verificar eventos guardados en BD
router.get('/google/calendar/events/debug', validateJwt, async (req, res) => {
  try {
    const userId = req.query.userId || getUserIdFromToken(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found'
      });
    }

    const { supabaseAdmin } = await import('../db/supabase.js');

    // Obtener todos los eventos del usuario
    const { data: events, error } = await supabaseAdmin
      .from('google_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Error consultando eventos',
        error: error.message
      });
    }

    res.json({
      success: true,
      userId,
      totalEvents: events?.length || 0,
      events: events || []
    });

  } catch (error) {
    console.error('❌ Error en debug:', error);
    res.status(500).json({
      success: false,
      message: 'Error',
      error: error.message
    });
  }
});

// GET /api/google/calendar/events - Obtener eventos
router.get('/google/calendar/events', validateJwt, async (req, res) => {
  try {
    // Permitir userId desde query parameter o desde token
    const userId = req.query.userId || getUserIdFromToken(req);
    const { 
      calendarId = 'primary',
      timeMin,
      timeMax,
      limit = 50,
      offset = 0
    } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token or query parameter'
      });
    }

    // Usar Supabase directamente en lugar del pool simulado
    const { supabaseAdmin } = await import('../db/supabase.js');
    
    let supabaseQuery = supabaseAdmin
      .from('google_events')
      .select('*')
      .eq('user_id', userId)
      .eq('calendar_id', calendarId);

    if (timeMin) {
      supabaseQuery = supabaseQuery.gte('start_ts', new Date(timeMin).getTime());
    }

    if (timeMax) {
      supabaseQuery = supabaseQuery.lte('end_ts', new Date(timeMax).getTime());
    }

    supabaseQuery = supabaseQuery
      .order('start_ts', { ascending: true })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    const { data: events, error } = await supabaseQuery;

    if (error) {
      console.error('❌ Error fetching events from Supabase:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching events from database',
        error: error.message
      });
    }

    res.json({ 
      success: true, 
      events,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: events.length
      }
    });
  } catch (error) {
    console.error('❌ Error fetching events:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching events',
      error: error.message
    });
  }
});

/**
 * ENDPOINTS DE ESTADO Y SINCRONIZACIÓN
 */

// GET /api/google/calendar/status - Estado de conexión
router.get('/google/calendar/status', validateJwt, async (req, res) => {
  try {
    // Permitir userId desde query parameter o desde token
    const userId = req.query.userId || getUserIdFromToken(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token or query parameter'
      });
    }

    // Usar Supabase directamente
    const { supabaseAdmin } = await import('../db/supabase.js');

    // Verificar cuenta de Google
    const { data: accounts, error: accountError } = await supabaseAdmin
      .from('google_accounts')
      .select('email, expiry_date, refresh_token')
      .eq('user_id', userId);

    if (accountError) {
      console.error('❌ Error fetching Google account:', accountError);
      return res.status(500).json({
        success: false,
        message: 'Error checking Google account',
        error: accountError.message
      });
    }

    if (!accounts || accounts.length === 0) {
      return res.json({ 
        success: true,
        connected: false,
        message: 'No Google account connected'
      });
    }

    const account = accounts[0];
    const isExpired = new Date(account.expiry_date) < new Date();
    const hasRefreshToken = !!account.refresh_token;

    // Obtener watches activos
    const { data: watches, error: watchError } = await supabaseAdmin
      .from('google_watch_channels')
      .select('calendar_id, expiration, last_sync_at, status')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (watchError) {
      console.error('❌ Error fetching watch channels:', watchError);
    }

    // Contar eventos
    const { count: eventCount, error: countError } = await supabaseAdmin
      .from('google_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countError) {
      console.error('❌ Error counting events:', countError);
    }

    res.json({ 
      success: true,
      connected: true,
      account: {
        email: account.email,
        tokenExpired: isExpired,
        hasRefreshToken: hasRefreshToken
      },
      watchChannels: (watches || []).map(watch => ({
        calendarId: watch.calendar_id,
        expiration: watch.expiration,
        lastSync: watch.last_sync_at,
        status: watch.status
      })),
      eventCount: eventCount || 0,
      canCreateEvents: hasRefreshToken && !isExpired,
      reconnectUrl: !hasRefreshToken ? `${process.env.FRONTEND_URL || 'http://localhost:3000'}/google-calendar/connect?userId=${userId}` : null
    });
  } catch (error) {
    console.error('❌ Error checking status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error checking connection status',
      error: error.message
    });
  }
});

// POST /api/google/calendar/sync - Sincronización manual
router.post('/google/calendar/sync', validateJwt, async (req, res) => {
  try {
    // Permitir userId desde body o desde token
    const userId = req.body.userId || getUserIdFromToken(req);
    const { calendarId = 'primary', force = false } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token or request body'
      });
    }

    console.log(`🔄 Iniciando sincronización para usuario: ${userId}`);

    // Verificar si hay cuenta de Google conectada
    const { supabaseAdmin } = await import('../db/supabase.js');
    const { data: account, error: accountError } = await supabaseAdmin
      .from('google_accounts')
      .select('email, expiry_date')
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      console.log('⚠️ No hay cuenta de Google conectada, devolviendo eventos existentes');
      
      // Obtener eventos existentes de la base de datos
      const { data: existingEvents, error: eventsError } = await supabaseAdmin
        .from('google_events')
        .select('*')
        .eq('user_id', userId)
        .order('start_ts', { ascending: true });

      if (eventsError) {
        throw new Error('Error fetching existing events: ' + eventsError.message);
      }

      return res.json({
        success: true,
        message: 'Eventos existentes obtenidos desde base de datos local',
        eventsCount: existingEvents?.length || 0,
        source: 'local_database',
        note: 'Para sincronización en tiempo real, conecta tu cuenta de Google'
      });
    }

    // Verificar si el token está expirado
    const isExpired = new Date(account.expiry_date) < new Date();
    if (isExpired) {
      console.log('⚠️ Token de Google expirado, devolviendo eventos existentes');
      
      // Obtener eventos existentes de la base de datos
      const { data: existingEvents, error: eventsError } = await supabaseAdmin
        .from('google_events')
        .select('*')
        .eq('user_id', userId)
        .order('start_ts', { ascending: true });

      if (eventsError) {
        throw new Error('Error fetching existing events: ' + eventsError.message);
      }

      return res.json({
        success: true,
        message: 'Eventos existentes obtenidos (token expirado)',
        eventsCount: existingEvents?.length || 0,
        source: 'local_database',
        tokenExpired: true,
        reconnectUrl: `http://localhost:5001/api/auth/google/calendar/connect?userId=${userId}`,
        note: 'Para sincronización en tiempo real, reconecta tu cuenta de Google'
      });
    }

    // Intentar sincronización real con Google
    try {
      if (force) {
        await fullSync(userId, calendarId);
      } else {
        await incrementalSync(userId, calendarId);
      }

      // Obtener eventos actualizados
      const { data: syncedEvents, error: eventsError } = await supabaseAdmin
        .from('google_events')
        .select('*')
        .eq('user_id', userId)
        .order('start_ts', { ascending: true });

      res.json({ 
        success: true, 
        message: `${force ? 'Full' : 'Incremental'} sync completed successfully`,
        eventsCount: syncedEvents?.length || 0,
        source: 'google_calendar',
        lastSync: new Date().toISOString()
      });

    } catch (syncError) {
      console.error('❌ Error en sincronización con Google:', syncError);
      
      // Fallback: devolver eventos existentes
      const { data: existingEvents } = await supabaseAdmin
        .from('google_events')
        .select('*')
        .eq('user_id', userId)
        .order('start_ts', { ascending: true });

      res.json({
        success: true,
        message: 'Sincronización con Google falló, devolviendo eventos existentes',
        eventsCount: existingEvents?.length || 0,
        source: 'local_database',
        syncError: syncError.message,
        note: 'Los eventos existentes siguen disponibles'
      });
    }

  } catch (error) {
    console.error('❌ Error in manual sync:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error in manual sync',
      error: error.message
    });
  }
});

// POST /api/google/calendar/disconnect - Desconectar cuenta de Google (UNIVERSAL)
router.post('/google/calendar/disconnect', validateJwt, async (req, res) => {
  try {
    // Permitir userId desde body o desde token
    const userId = req.body.userId || getUserIdFromToken(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token or request body'
      });
    }

    console.log(`🔌 Desconectando Google Calendar para usuario: ${userId}`);

    const { supabaseAdmin } = await import('../db/supabase.js');

    // Obtener información de la cuenta antes de eliminar
    const { data: account, error: accountError } = await supabaseAdmin
      .from('google_accounts')
      .select('email')
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      return res.json({
        success: true,
        message: 'No hay cuenta de Google conectada',
        alreadyDisconnected: true,
        canConnectNew: true,
        connectUrl: `http://localhost:5001/api/auth/google/calendar/connect?userId=${userId}`
      });
    }

    const accountEmail = account.email;

    try {
      // 1. Detener watches activos
      const { data: watches, error: watchError } = await supabaseAdmin
        .from('google_watch_channels')
        .select('channel_id, resource_id')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (!watchError && watches && watches.length > 0) {
        await supabaseAdmin
          .from('google_watch_channels')
          .update({ status: 'stopped', updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('status', 'active');

        console.log(`✅ ${watches.length} watch channels detenidos`);
      }

      // 2. Eliminar eventos sincronizados
      const { error: deleteEventsError } = await supabaseAdmin
        .from('google_events')
        .delete()
        .eq('user_id', userId);

      if (deleteEventsError) {
        console.warn('⚠️ Error eliminando eventos:', deleteEventsError);
      }

      // 3. Eliminar cuenta de Google
      const { error: deleteAccountError } = await supabaseAdmin
        .from('google_accounts')
        .delete()
        .eq('user_id', userId);

      if (deleteAccountError) {
        throw deleteAccountError;
      }

      console.log(`✅ Cuenta ${accountEmail} completamente desconectada`);

      res.json({ 
        success: true, 
        message: `Cuenta ${accountEmail} desconectada exitosamente`,
        disconnectedEmail: accountEmail,
        eventsRemoved: true,
        watchesRemoved: watches?.length || 0,
        canConnectNew: true,
        connectUrl: `http://localhost:5001/api/auth/google/calendar/connect?userId=${userId}`,
        nextSteps: 'Ahora puedes conectar una cuenta de Google diferente'
      });

    } catch (error) {
      console.error('❌ Error during disconnection:', error);
      res.json({
        success: true,
        message: `Cuenta ${accountEmail} desconectada (con algunos errores menores)`,
        disconnectedEmail: accountEmail,
        warning: 'Algunos recursos no se pudieron limpiar completamente',
        canConnectNew: true,
        connectUrl: `http://localhost:5001/api/auth/google/calendar/connect?userId=${userId}`
      });
    }

  } catch (error) {
    console.error('❌ Error disconnecting Google Calendar:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error disconnecting Google Calendar',
      error: error.message
    });
  }
});

// GET /api/google/calendar/calendars - Obtener lista de calendarios
router.get('/google/calendar/calendars', validateJwt, async (req, res) => {
  try {
    // Permitir userId desde query parameter o desde token
    const userId = req.query.userId || getUserIdFromToken(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token or query parameter'
      });
    }

    // Devolver calendario principal por defecto (simulado)
    const calendars = [
      {
        id: 'primary',
        summary: 'Calendario Principal',
        description: 'Tu calendario principal de Google',
        primary: true,
        selected: true,
        accessRole: 'owner',
        colorId: '1'
      }
    ];

    res.json({ 
      success: true, 
      calendars,
      total: calendars.length
    });
  } catch (error) {
    console.error('❌ Error fetching calendars:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching calendars',
      error: error.message
    });
  }
});

// POST /api/google/calendar/save-tokens - Guardar tokens desde Supabase Auth
router.post('/google/calendar/save-tokens', validateJwt, async (req, res) => {
  try {
    const userId = req.body.userId || getUserIdFromToken(req);
    const { accessToken, refreshToken, email } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found'
      });
    }

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        message: 'accessToken is required'
      });
    }

    console.log(`💾 Guardando tokens de Supabase Auth para usuario: ${userId}`);

    const { supabaseAdmin } = await import('../db/supabase.js');

    // Obtener email del usuario si no viene en el request
    let userEmail = email;
    if (!userEmail) {
      try {
        const { google } = await import('googleapis');
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        userEmail = userInfo.data.email;
      } catch (e) {
        console.warn('⚠️ No se pudo obtener email del token:', e.message);
      }
    }

    // Calcular fecha de expiración (1 hora desde ahora)
    const expiryDate = new Date(Date.now() + 3600000);

    // Cifrar refresh token si existe
    let encryptedRefreshToken = null;
    if (refreshToken) {
      // Cifrado simple (en producción usa algo más robusto)
      encryptedRefreshToken = Buffer.from(refreshToken).toString('base64');
    }

    // Guardar en base de datos
    const { data, error } = await supabaseAdmin
      .from('google_accounts')
      .upsert({
        user_id: userId,
        email: userEmail,
        access_token: accessToken,
        refresh_token: encryptedRefreshToken,
        expiry_date: expiryDate.toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      .select();

    if (error) {
      throw error;
    }

    console.log(`✅ Tokens guardados para usuario ${userId} (${userEmail})`);

    // Iniciar sincronización inicial
    try {
      const { fullSync } = await import('../services/googleCalendar.service.js');
      await fullSync(userId);
      console.log(`✅ Sincronización inicial completada para ${userId}`);
    } catch (syncError) {
      console.warn('⚠️ Error en sincronización inicial:', syncError.message);
    }

    res.json({
      success: true,
      message: 'Tokens guardados exitosamente',
      email: userEmail,
      expiresAt: expiryDate.toISOString()
    });

  } catch (error) {
    console.error('❌ Error saving tokens:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving tokens',
      error: error.message
    });
  }
});

// GET /api/google/calendar/appointments - Obtener citas agendadas (separadas de disponibilidades)
router.get('/google/calendar/appointments', validateJwt, async (req, res) => {
  try {
    const userId = req.query.userId || getUserIdFromToken(req);
    const { 
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found'
      });
    }

    const { supabaseAdmin } = await import('../db/supabase.js');
    
    // Obtener citas agendadas desde la tabla citas_agendadas
    let query = supabaseAdmin
      .from('citas_agendadas')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'confirmed') // Solo citas confirmadas
      .order('start_ts', { ascending: true });

    if (startDate) {
      query = query.gte('start_ts', new Date(startDate).getTime());
    }

    if (endDate) {
      query = query.lte('end_ts', new Date(endDate).getTime());
    }

    query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    const { data: appointments, error } = await query;

    if (error) {
      console.error('❌ Error fetching appointments:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching appointments',
        error: error.message
      });
    }

    res.json({
      success: true,
      appointments: appointments || [],
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: appointments?.length || 0
      }
    });
  } catch (error) {
    console.error('❌ Error fetching appointments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching appointments',
      error: error.message
    });
  }
});

// GET /api/google/calendar/availability-slots - Obtener solo disponibilidades (no citas)
router.get('/google/calendar/availability-slots', validateJwt, async (req, res) => {
  try {
    const userId = req.query.userId || getUserIdFromToken(req);
    const { 
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found'
      });
    }

    const { supabaseAdmin } = await import('../db/supabase.js');
    const { getAvailableSlots } = await import('../services/availabilityService.js');
    
    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate ? new Date(endDate) : new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    const slots = await getAvailableSlots(userId, start, end);

    // Filtrar y paginar
    const paginatedSlots = slots.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      success: true,
      slots: paginatedSlots,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: slots.length
      }
    });
  } catch (error) {
    console.error('❌ Error fetching availability slots:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching availability slots',
      error: error.message
    });
  }
});

// GET /api/google/calendar/current-account - Obtener cuenta Google actual del usuario
router.get('/google/calendar/current-account', validateJwt, async (req, res) => {
  try {
    const userId = req.query.userId || getUserIdFromToken(req);
    console.log(`📋 Obteniendo cuenta Google actual para usuario: ${userId}`);

    const { supabaseAdmin } = await import('../db/supabase.js');

    // Obtener cuenta actual del usuario
    const { data: account, error: accountError } = await supabaseAdmin
      .from('google_accounts')
      .select('user_id, email, expiry_date, created_at, updated_at')
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      return res.json({
        success: true,
        account: null,
        message: 'No hay cuenta de Google conectada',
        connectUrl: `http://localhost:5001/api/auth/google/calendar/connect?userId=${userId}`
      });
    }

    const isExpired = new Date(account.expiry_date) < new Date();
    
    // Contar eventos de esta cuenta
    const { count: eventCount } = await supabaseAdmin
      .from('google_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', account.user_id);

    // Contar watches activos
    const { count: watchCount } = await supabaseAdmin
      .from('google_watch_channels')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', account.user_id)
      .eq('status', 'active');

    const accountData = {
      userId: account.user_id,
      email: account.email,
      isExpired,
      expiryDate: account.expiry_date,
      createdAt: account.created_at,
      lastUpdated: account.updated_at,
      eventCount: eventCount || 0,
      activeWatches: watchCount || 0,
      status: isExpired ? 'expired' : 'active',
      reconnectUrl: isExpired 
        ? `http://localhost:5001/api/auth/google/calendar/connect?userId=${account.user_id}`
        : null
    };

    res.json({
      success: true,
      account: accountData,
      message: `Cuenta conectada: ${account.email}`
    });

  } catch (error) {
    console.error('❌ Error fetching current Google account:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching current Google account',
      error: error.message
    });
  }
});


// POST /api/google/calendar/book-appointment - Agendar cita desde la IA
router.post('/google/calendar/book-appointment', validateJwt, async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    const {
      slotEventId,
      clientName,
      clientPhone,
      notes,
      sendConfirmation = true
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    if (!slotEventId || !clientName) {
      return res.status(400).json({
        success: false,
        message: 'slotEventId and clientName are required'
      });
    }

    console.log(`📅 Agendando cita para ${clientName} (slot: ${slotEventId})`);

    // Importar servicio de disponibilidades
    const { bookAppointment } = await import('../services/availabilityService.js');
    
    // Agendar la cita
    const appointment = await bookAppointment(
      userId,
      slotEventId,
      clientName,
      clientPhone,
      notes
    );

    // Enviar confirmación por WhatsApp si se solicita
    let confirmationSent = false;
    if (sendConfirmation && clientPhone) {
      try {
        const { sendMessageToNumber } = await import('../controllers/whatsappController.js');
        const confirmationMessage = `✅ Cita confirmada\n\n` +
          `Hola ${clientName},\n\n` +
          `Tu cita ha sido agendada exitosamente:\n\n` +
          `📅 Fecha: ${new Date(appointment.start).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n` +
          `⏰ Hora: ${new Date(appointment.start).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - ${new Date(appointment.end).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}\n` +
          (appointment.location ? `📍 Ubicación: ${appointment.location}\n` : '') +
          (appointment.notes ? `📝 Notas: ${appointment.notes}\n` : '') +
          `\n¡Te esperamos!`;

        await sendMessageToNumber(
          userId,
          clientPhone,
          confirmationMessage,
          [],
          'ia',
          '34' // default country
        );
        confirmationSent = true;
        console.log(`✅ Confirmación enviada por WhatsApp a ${clientPhone}`);
      } catch (whatsappError) {
        console.warn('⚠️ Error enviando confirmación por WhatsApp:', whatsappError.message);
      }
    }

    res.json({
      success: true,
      message: 'Cita agendada exitosamente',
      appointment,
      confirmationSent
    });

  } catch (error) {
    console.error('❌ Error agendando cita:', error);
    res.status(500).json({
      success: false,
      message: 'Error agendando cita',
      error: error.message
    });
  }
});

export default router;
