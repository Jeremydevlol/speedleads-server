// src/services/gcalWatch.js
import { randomUUID } from 'crypto';
import { google } from 'googleapis';
import { supabaseAdmin } from '../db/supabase.js';
import { getOAuth2Client, incrementalSync } from './googleCalendar.service.js';

/**
 * Crear un watch channel para un calendario
 */
export async function startCalendarWatch(oauth2Client, userId, calendarId) {
  // Verificar configuración HTTPS
  if (!process.env.PUBLIC_BASE_URL) {
    console.log(`🚫 Skipping webhooks - PUBLIC_BASE_URL not configured`);
    return;
  }

  if (process.env.ENABLE_GCAL_WEBHOOKS !== 'true') {
    console.log(`⚠️ Skipping webhooks (ENABLE_GCAL_WEBHOOKS=false)`);
    return;
  }

  const address = `${process.env.PUBLIC_BASE_URL}${process.env.GOOGLE_CALENDAR_WEBHOOK_PATH || '/webhooks/google/calendar'}`;
  console.log(`🔗 Creating watch for ${address}`);

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const channelId = randomUUID();
  // Token para identificar el webhook
  const tokenPayload = Buffer.from(JSON.stringify({ userId, calendarId })).toString('base64url');

  try {
    const res = await calendar.events.watch({
      calendarId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address,
        token: tokenPayload,
        params: {
          ttl: 604800 // 7 días en segundos
        }
      }
    });

    const { resourceId, expiration } = res.data;
    const expirationDate = expiration ? new Date(parseInt(expiration)) : null;

    // Guardar en base de datos
    await supabaseAdmin
      .from('google_watch_channels')
      .upsert({
        user_id: userId,
        calendar_id: calendarId,
        channel_id: channelId,
        resource_id: resourceId,
        token: tokenPayload,
        expiration: expirationDate?.toISOString(),
        status: 'active'
      }, { onConflict: 'user_id,calendar_id' });

    console.log(`✅ Watch started for user ${userId}, calendar ${calendarId}, expires at ${expirationDate}`);
    return { channelId, resourceId, expiration: expirationDate };
  } catch (error) {
    console.error(`❌ Failed to start watch:`, error);
    throw error;
  }
}

/**
 * Detener un watch channel
 */
export async function stopCalendarWatch(oauth2Client, channelId, resourceId) {
  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    await calendar.channels.stop({
      requestBody: {
        id: channelId,
        resourceId: resourceId
      }
    });

    // Actualizar estado en base de datos
    await supabaseAdmin
      .from('google_watch_channels')
      .update({ 
        status: 'stopped',
        updated_at: new Date().toISOString()
      })
      .eq('channel_id', channelId);

    console.log(`✅ Watch stopped for channel ${channelId}`);
  } catch (error) {
    console.error(`❌ Failed to stop watch for channel ${channelId}:`, error);
    throw error;
  }
}

/**
 * Ejecutar sincronización incremental (llamada desde webhook)
 */
export async function runIncrementalSync(userId, calendarId) {
  try {
    console.log(`🔄 Running incremental sync for user ${userId}, calendar ${calendarId}`);
    await incrementalSync(userId, calendarId);
    console.log(`✅ Incremental sync completed for user ${userId}, calendar ${calendarId}`);
  } catch (error) {
    console.error(`❌ Incremental sync failed for user ${userId}, calendar ${calendarId}:`, error);
    throw error;
  }
}

/**
 * Renovar un watch channel que está por expirar
 */
export async function renewWatch(userId, calendarId, oldChannelId, oldResourceId) {
  try {
    console.log(`🔄 Renewing watch for user ${userId}, calendar ${calendarId}`);
    
    const oauth2Client = await getOAuth2Client(userId);
    
    // Detener el watch anterior
    try {
      await stopCalendarWatch(oauth2Client, oldChannelId, oldResourceId);
    } catch (error) {
      console.warn(`⚠️ Failed to stop old watch, continuing with renewal:`, error.message);
    }

    // Crear nuevo watch
    const newWatch = await startCalendarWatch(oauth2Client, userId, calendarId);
    
    console.log(`✅ Watch renewed for user ${userId}, calendar ${calendarId}`);
    return newWatch;
  } catch (error) {
    console.error(`❌ Failed to renew watch for user ${userId}, calendar ${calendarId}:`, error);
    throw error;
  }
}

/**
 * Obtener todos los watches activos de un usuario
 */
export async function getUserWatches(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('google_watch_channels')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error(`❌ Failed to get user watches for ${userId}:`, error);
    throw error;
  }
}

/**
 * Obtener watches que están por expirar
 */
export async function getExpiringWatches(minutesFromNow = 60) {
  try {
    const expirationThreshold = new Date(Date.now() + minutesFromNow * 60 * 1000);
    
    const { data, error } = await supabaseAdmin
      .from('google_watch_channels')
      .select('*')
      .eq('status', 'active')
      .lt('expiration', expirationThreshold.toISOString());

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error(`❌ Failed to get expiring watches:`, error);
    throw error;
  }
}

/**
 * Limpiar watches expirados o inválidos
 */
export async function cleanupExpiredWatches() {
  try {
    console.log('🧹 Starting cleanup of expired watches...');
    
    // Marcar como expirados los watches que ya pasaron su fecha de expiración
    const { data: expiredWatches, error: selectError } = await supabaseAdmin
      .from('google_watch_channels')
      .select('*')
      .eq('status', 'active')
      .lt('expiration', new Date().toISOString());

    if (selectError) {
      throw selectError;
    }

    if (expiredWatches && expiredWatches.length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('google_watch_channels')
        .update({ status: 'expired' })
        .in('id', expiredWatches.map(w => w.id));

      if (updateError) {
        throw updateError;
      }

      console.log(`✅ Marked ${expiredWatches.length} watches as expired`);
    }

    // Eliminar watches muy antiguos (más de 30 días)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const { error: deleteError } = await supabaseAdmin
      .from('google_watch_channels')
      .delete()
      .in('status', ['expired', 'stopped'])
      .lt('updated_at', thirtyDaysAgo.toISOString());

    if (deleteError) {
      throw deleteError;
    }

    console.log('✅ Cleanup of expired watches completed');
  } catch (error) {
    console.error('❌ Failed to cleanup expired watches:', error);
    throw error;
  }
}

