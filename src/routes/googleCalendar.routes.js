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

// GET /api/auth/google/calendar/connect?userId=UUID
router.get('/auth/google/calendar/connect', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'userId parameter is required'
      });
    }

    const authUrl = generateAuthUrl(userId);
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
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { userId } = stateData;

    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid state parameter' 
      });
    }

    // Manejar callback OAuth
    await handleOAuthCallback(code, userId);

    // Iniciar full sync
    await fullSync(userId);

    // Iniciar watch para el calendario principal
    const oauth2Client = await getOAuth2Client(userId);
    await startCalendarWatch(oauth2Client, userId, 'primary');

    // 🔐 AUTENTICACIÓN: Generar JWT y cookies de sesión
    const { supabaseAdmin } = await import('../db/supabase.js');
    const jwt = (await import('jsonwebtoken')).default;
    
    // Obtener datos del usuario
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, username, role, avatar_url, full_name')
      .eq('id', userId)
      .single();

    if (!userError && userData) {
      // Crear JWT token
      const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-key';
      const token = jwt.sign({ userId: userData.id }, JWT_SECRET, { expiresIn: '7d' });

      // Configurar cookies para autenticación
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
        domain: process.env.NODE_ENV === 'development' ? undefined : (process.env.COOKIE_DOMAIN || '.uniclick.io'),
        path: '/'
      };

      console.log('🍪 Configurando cookies de sesión después de Google Calendar OAuth:', {
        userId: userData.id,
        email: userData.email,
        domain: cookieOptions.domain
      });

      res.cookie('auth_token', token, cookieOptions);
      res.cookie('user_id', userData.id, cookieOptions);
    }

    // Redirigir al dashboard con sesión iniciada
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/dashboard?googleConnected=true`);
  } catch (error) {
    console.error('❌ Error in OAuth callback:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/dashboard?googleError=true&message=${encodeURIComponent(error.message)}`);
  }
});

// POST /api/google/calendar/saveCalendarToken - Guardar tokens manualmente (desde frontend Next.js)
// Nota: Este endpoint se monta bajo /api, por lo tanto la ruta completa es /api/calendar/saveCalendarToken (si el router está en /api)
// O si el router está en /api, y definimos /calendar/saveCalendarToken, sería /api/calendar/saveCalendarToken.
router.post('/calendar/saveCalendarToken', async (req, res) => {
  try {
    const { userId, tokens } = req.body;

    if (!userId || !tokens) {
      return res.status(400).json({ 
        success: false, 
        message: 'userId and tokens are required' 
      });
    }

    await saveUserTokens(userId, tokens);

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
      .select('email, expiry_date')
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
        tokenExpired: isExpired
      },
      watchChannels: (watches || []).map(watch => ({
        calendarId: watch.calendar_id,
        expiration: watch.expiration,
        lastSync: watch.last_sync_at,
        status: watch.status
      })),
      eventCount: eventCount || 0
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


export default router;
