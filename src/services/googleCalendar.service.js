// src/services/googleCalendar.service.js
import { google } from 'googleapis';
import { supabaseAdmin } from '../db/supabase.js';

// Funciones de cifrado (básicas para tokens)
const encrypt = (text) => {
  // En producción, usar crypto real
  return Buffer.from(text).toString('base64');
};

const decrypt = (encryptedText) => {
  // En producción, usar crypto real
  return Buffer.from(encryptedText, 'base64').toString();
};

/**
 * Genera URL de autorización OAuth de Google
 */
export function generateAuthUrl(userId) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  
  const state = Buffer.from(JSON.stringify({ userId })).toString('base64');
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.settings.readonly',
      'openid',
      'email',
      'profile'
    ],
    prompt: 'consent',
    state
  });
}

/**
 * Maneja el callback OAuth de Google
 */
export async function handleOAuthCallback(code, userId) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  try {
    // Configurar el redirect_uri explícitamente
    const { tokens } = await oauth2Client.getToken({
      code: code,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI
    });
    
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Missing required tokens from Google OAuth');
    }

    // Obtener email del usuario
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    // Calcular fecha de expiración
    const expiryDate = tokens.expiry_date 
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600000);

    // Cifrar refresh token
    const encryptedRefreshToken = encrypt(tokens.refresh_token);

    // Guardar en base de datos usando Supabase
    await supabaseAdmin
      .from('google_accounts')
      .upsert({
        user_id: userId,
        email: email,
        access_token: tokens.access_token,
        refresh_token: encryptedRefreshToken,
        expiry_date: expiryDate.toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    console.log(`✅ OAuth tokens saved for user ${userId}`);
  } catch (error) {
    console.error('❌ Error in OAuth callback:', error);
    throw error;
  }
}

/**
 * Obtiene cliente OAuth2 configurado para un usuario
 */
export async function getOAuth2Client(userId) {
  // Usar Supabase directamente en lugar del pool
  const { data: account, error } = await supabaseAdmin
    .from('google_accounts')
    .select('access_token, refresh_token, expiry_date')
    .eq('user_id', userId)
    .single();

  if (error || !account) {
    throw new Error('No Google account found for user');
  }

  const { access_token, refresh_token, expiry_date } = account;
  const decryptedRefreshToken = decrypt(refresh_token);

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token,
    refresh_token: decryptedRefreshToken,
    expiry_date: new Date(expiry_date).getTime()
  });

  // Refresh automático si está por expirar
  if (new Date(expiry_date).getTime() - Date.now() < 60000) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      
      await supabaseAdmin
        .from('google_accounts')
        .update({
          access_token: credentials.access_token,
          expiry_date: new Date(credentials.expiry_date).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);
      
      console.log(`🔄 Token refreshed for user ${userId}`);
    } catch (error) {
      console.error('❌ Failed to refresh token:', error);
      throw error;
    }
  }

  return oauth2Client;
}

/**
 * Sincronización completa de eventos
 */
export async function fullSync(userId, calendarId = 'primary') {
  console.log(`🔄 Starting full sync for user ${userId}, calendar ${calendarId}`);
  
  try {
    const oauth2Client = await getOAuth2Client(userId);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    let nextPageToken;
    let syncToken;
    let totalEvents = 0;

    do {
      const response = await calendar.events.list({
        calendarId,
        showDeleted: true,
        singleEvents: true,
        orderBy: 'startTime',
        pageToken: nextPageToken,
        maxResults: 2500
      });

      const events = response.data.items || [];
      totalEvents += events.length;

      // Procesar eventos
      for (const event of events) {
        if (event.id) {
          await upsertEventFromGoogle(userId, calendarId, event);
        }
      }

      nextPageToken = response.data.nextPageToken;
      
      // Guardar sync token para sincronización incremental
      if (response.data.nextSyncToken && !syncToken) {
        syncToken = response.data.nextSyncToken;
      }

    } while (nextPageToken);

    // Guardar sync token
    if (syncToken) {
      await supabaseAdmin
        .from('google_watch_channels')
        .upsert({
          user_id: userId,
          calendar_id: calendarId,
          sync_token: syncToken,
          status: 'active',
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,calendar_id' });
    }

    console.log(`✅ Full sync completed for user ${userId}: ${totalEvents} events processed`);
  } catch (error) {
    console.error(`❌ Full sync failed for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Sincronización incremental de eventos
 */
export async function incrementalSync(userId, calendarId = 'primary') {
  console.log(`⚡ Starting incremental sync for user ${userId}, calendar ${calendarId}`);
  
  try {
    const oauth2Client = await getOAuth2Client(userId);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Obtener sync token guardado
    const { data: watchChannel, error: watchError } = await supabaseAdmin
      .from('google_watch_channels')
      .select('sync_token')
      .eq('user_id', userId)
      .eq('calendar_id', calendarId)
      .single();

    if (watchError || !watchChannel?.sync_token) {
      console.log('No sync token found, falling back to full sync');
      return await fullSync(userId, calendarId);
    }

    const syncToken = watchChannel.sync_token;

    try {
      const response = await calendar.events.list({
        calendarId,
        syncToken,
        showDeleted: true
      });

      const events = response.data.items || [];
      
      for (const event of events) {
        if (event.id) {
          await upsertEventFromGoogle(userId, calendarId, event);
        }
      }

      // Actualizar sync token
      if (response.data.nextSyncToken) {
        await supabaseAdmin
          .from('google_watch_channels')
          .update({
            sync_token: response.data.nextSyncToken,
            last_sync_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('calendar_id', calendarId);
      }

      console.log(`✅ Incremental sync completed: ${events.length} events processed`);
    } catch (error) {
      if (error.code === 410) {
        console.log('Sync token expired, falling back to full sync');
        return await fullSync(userId, calendarId);
      }
      throw error;
    }
  } catch (error) {
    console.error(`❌ Incremental sync failed for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Upsert de evento desde Google Calendar
 */
async function upsertEventFromGoogle(userId, calendarId, event) {
  // Evitar bucles (anti-loop)
  if (event.extendedProperties?.private?.src === 'uniclick') {
    const eventTime = new Date(event.created || event.updated || '').getTime();
    if (Date.now() - eventTime < 30000) { // 30 segundos
      console.log(`⏭️ Skipping recent uniclick event: ${event.id}`);
      return;
    }
  }

  try {
    // Preparar datos del evento
    const eventData = {
      user_id: userId,
      calendar_id: calendarId,
      event_id: event.id,
      summary: event.summary || '',
      description: event.description || '',
      location: event.location || '',
      start_time: event.start?.dateTime || event.start?.date,
      end_time: event.end?.dateTime || event.end?.date,
      start_ts: new Date(event.start?.dateTime || event.start?.date || '').getTime(),
      end_ts: new Date(event.end?.dateTime || event.end?.date || '').getTime(),
      is_all_day: !event.start?.dateTime,
      status: event.status || 'confirmed',
      color_id: event.colorId,
      etag: event.etag,
      source: 'google',
      last_synced_at: new Date().toISOString()
    };

    // Upsert en tabla google_events usando Supabase
    const { error } = await supabaseAdmin
      .from('google_events')
      .upsert(eventData, { 
        onConflict: 'user_id,calendar_id,event_id',
        ignoreDuplicates: false
      });

    if (error) {
      console.error(`❌ Failed to upsert to google_events: ${error.message}`);
      throw error;
    }

    console.log(`✅ Event synced to Supabase: ${event.id}`);

  } catch (error) {
    console.error(`❌ Failed to upsert event from Google: ${event.id}`, error);
  }
}

/**
 * Crear evento en Google Calendar
 */
export async function upsertGoogleEvent(eventData) {
  const { userId, calendarId = 'primary', googleEventId, ...eventDetails } = eventData;
  
  try {
    const oauth2Client = await getOAuth2Client(userId);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Agregar marca para evitar bucles
    const eventPayload = {
      ...eventDetails,
      extendedProperties: {
        private: {
          src: 'uniclick'
        }
      }
    };

    let result;
    
    if (googleEventId) {
      // Actualizar evento existente
      result = await calendar.events.update({
        calendarId,
        eventId: googleEventId,
        requestBody: eventPayload
      });
    } else {
      // Crear nuevo evento
      result = await calendar.events.insert({
        calendarId,
        requestBody: eventPayload
      });
    }

    const createdEvent = result.data;
    
    // Sincronizar a nuestra base de datos
    if (createdEvent.id) {
      await upsertEventFromGoogle(userId, calendarId, createdEvent);
    }

    console.log(`✅ Event ${googleEventId ? 'updated' : 'created'} in Google Calendar: ${createdEvent.id}`);
    
    return { eventId: createdEvent.id };
  } catch (error) {
    console.error('❌ Error upserting Google event:', error);
    throw error;
  }
}

/**
 * Eliminar evento de Google Calendar
 */
export async function deleteGoogleEvent(userId, calendarId, googleEventId) {
  try {
    const oauth2Client = await getOAuth2Client(userId);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Eliminar de Google Calendar
    await calendar.events.delete({
      calendarId,
      eventId: googleEventId
    });

    // Eliminar de nuestra base de datos
    await supabaseAdmin
      .from('google_events')
      .delete()
      .eq('user_id', userId)
      .eq('calendar_id', calendarId)
      .eq('event_id', googleEventId);

    console.log(`✅ Event deleted from Google Calendar and local DB: ${googleEventId}`);
  } catch (error) {
    console.error('❌ Error deleting Google event:', error);
    throw error;
  }
}
