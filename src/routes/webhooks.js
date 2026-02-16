// src/routes/webhooks.js
import express from 'express';
import { stripeHandler } from '../controllers/webhook.js';
import { supabaseAdmin } from '../db/supabase.js';
import { runIncrementalSync } from '../services/gcalWatch.js';

const router = express.Router();

// IMPORTANTE: usar raw body parser aquí para validar firma de Stripe
router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  stripeHandler
);

/**
 * Webhook de Google Calendar
 * POST /webhooks/google/calendar
 */
router.post('/google/calendar', async (req, res) => {
  // Leer headers de Google
  const channelId     = req.get('X-Goog-Channel-Id');
  const resourceId    = req.get('X-Goog-Resource-Id');
  const resourceState = req.get('X-Goog-Resource-State'); // 'exists' | 'sync'
  const tokenB64      = req.get('X-Goog-Channel-Token');  // nuestro token

  console.log(`📨 Webhook received - Channel: ${channelId}, Resource: ${resourceId}, State: ${resourceState}`);

  // Responder inmediatamente para que Google no reintente
  res.status(200).end();

  try {
    // Recuperar el canal
    const { data: chans } = await supabaseAdmin
      .from('google_watch_channels')
      .select('*')
      .eq('channel_id', channelId)
      .eq('resource_id', resourceId)
      .eq('status', 'active')
      .limit(1);

    const chan = chans?.[0];
    if (!chan) {
      console.warn(`⚠️ Unknown webhook channel: ${channelId}`);
      return;
    }

    // Extraer userId & calendarId
    let userId = chan.user_id;
    let calendarId = chan.calendar_id;

    if (tokenB64) {
      try {
        const parsed = JSON.parse(Buffer.from(tokenB64, 'base64url').toString('utf8'));
        userId = parsed.userId || userId;
        calendarId = parsed.calendarId || calendarId;
      } catch (e) {
        console.warn('⚠️ Failed to parse token, using channel data');
      }
    }

    console.log(`🔄 Processing webhook for user ${userId}, calendar ${calendarId}`);

    // Disparar sincronización incremental
    await runIncrementalSync(userId, calendarId);

    // Emitir evento Socket.IO para actualizar UI en tiempo real
    try {
      // Importar dinámicamente para evitar problemas de dependencias circulares
      const { io } = await import('../app.js');
      if (io) {
        io.emit(`calendar:update:${userId}`);
        console.log(`📡 Emitted calendar:update:${userId} event`);
      }
    } catch (socketError) {
      console.warn('⚠️ Could not emit Socket.IO event:', socketError);
    }

    // Marcar último sync
    await supabaseAdmin
      .from('google_watch_channels')
      .update({ 
        last_sync_at: new Date().toISOString(),
        last_error: null
      })
      .eq('channel_id', channelId);

    console.log(`✅ Webhook processed successfully for user ${userId}, calendar ${calendarId}`);

  } catch (error) {
    console.error(`❌ Webhook processing failed:`, error);
    
    // Guardar error en base de datos
    if (channelId) {
      await supabaseAdmin
        .from('google_watch_channels')
        .update({ 
          last_error: error.message,
          updated_at: new Date().toISOString()
        })
        .eq('channel_id', channelId);
    }
  }
});

/**
 * Función exportable para manejar webhooks de Google Calendar
 * (Para compatibilidad con otros sistemas)
 */
export async function googleCalendarWebhook(req, res) {
  // Reutilizar la lógica del endpoint
  const originalUrl = req.url;
  const originalMethod = req.method;
  
  // Simular el request para el endpoint
  req.url = '/google/calendar';
  req.method = 'POST';
  
  // Llamar al handler del router
  await router.handle(req, res, () => {
    // Restaurar valores originales
    req.url = originalUrl;
    req.method = originalMethod;
  });
}

export default router;

