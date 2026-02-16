import fetch from 'node-fetch';
import pool from '../config/db.js';
import { deleteEventById, getEventsByUser, insertEvent } from '../services/calendarService.js';
import { getUserIdFromToken } from './authController.js';


// Insertar múltiples eventos
export async function bulkInsertEvents(req, res) {
    try {
        const userId = getUserIdFromToken(req) || null;
        if (!userId)
            return res.status(401).json({ success: false, message: 'No autenticado' });
        const { events } = req.body;
        if (!Array.isArray(events)) {
            return res.status(400).json({ success: false, message: 'Formato inválido' });
        }
        const insertedEvents = [];
        for (const event of events) {
            const processedEvent = {
                ...event,
                event_date: formatDate(event.event_date),
                title: event.title || '', // ✅ aseguramos que sea string
            };
            const newEvent = await insertEvent(userId, processedEvent);
            // Asegúrate de que `insertEvent` devuelve el `id`
            if (!newEvent.id) {
                throw new Error('Error al insertar evento: el `id` es necesario');
            }
            insertedEvents.push(newEvent);
        }
        return res.json({ success: true, events: insertedEvents });
    }
    catch (error) {
        console.error('❌ Error en bulkInsertEvents:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error instanceof Error ? error.message : 'Error desconocido'
        });
    }
}
// Obtener eventos del usuario
export async function getEvents(req, res) {
    try {
        const userId = getUserIdFromToken(req);
        if (!userId)
            return res.status(401).json({ success: false, message: 'No autenticado' });
        const events = await getEventsByUser(userId);
        return res.json({ success: true, events });
    }
    catch (error) {
        console.error('❌ Error en getEvents:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener eventos',
            error: error instanceof Error ? error.message : 'Error desconocido'
        });
    }
}
// Eliminar evento por ID
export async function deleteEvent(req, res) {
    try {
        const userId = getUserIdFromToken(req);
        if (!userId)
            return res.status(401).json({ success: false, message: 'No autenticado' });
        const { eventId } = req.params;
        if (!eventId || isNaN(Number(eventId))) {
            return res.status(400).json({ success: false, message: 'ID de evento inválido' });
        }
        await deleteEventById(userId, eventId);
        return res.json({ success: true });
    }
    catch (error) {
        console.error('❌ Error en deleteEvent:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al eliminar evento',
            error: error instanceof Error ? error.message : 'Error desconocido'
        });
    }
}
// Generar resumen de eventos
export async function buildCalendarSummary(userId) {
    try {
        const { rows } = await pool.query(`SELECT id, event_date, start_time, end_time, title
       FROM calendar_events
       WHERE user_id = $1::uuid
       ORDER BY event_date, start_time;`, [userId]);
        if (rows.length === 0) {
            return "El usuario no tiene eventos registrados.";
        }
        let summary = "📆 Resumen de Calendario:\n";
        let currentDate = null;
        for (const row of rows) {
            const dateStr = formatDateForDisplay(row.event_date);
            const timeRange = `⏰ ${row.start_time} - ${row.end_time}`;
            const title = row.title || "Evento sin título";
            if (dateStr !== currentDate) {
                currentDate = dateStr;
                summary += `\n📅 ${dateStr}:\n`;
            }
            summary += `${timeRange}: ${title}\n`;
        }
        return summary.trim();
    }
    catch (error) {
        console.error('❌ Error en buildCalendarSummary:', error);
        return 'Error al generar el resumen del calendario.';
    }
}
// Auxiliar para formato YYYY-MM-DD
function formatDate(dateInput) {
    try {
        if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
            return dateInput;
        }
        const date = new Date(dateInput);
        return date.toISOString().split('T')[0];
    }
    catch (error) {
        throw new Error(`Formato de fecha inválido: ${dateInput}`);
    }
}
// Auxiliar para formato DD/MM/YYYY
function formatDateForDisplay(isoDate) {
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
}

export async function saveGoogleCalendarToken(req, res) {
  try {
    const userId = getUserIdFromToken(req)
    if (!userId)
      return res.status(401).json({ success: false, message: 'No autenticado' })

    const { access_token, refresh_token, email } = req.body
    
    if (!access_token) {
      return res
        .status(400)
        .json({ success: false, message: 'Falta access_token' })
    }

    console.log(`💾 Guardando tokens de Google Calendar para usuario: ${userId}`)
    console.log(`   refresh_token presente: ${!!refresh_token}`)

    // Usar Supabase en lugar de pool.query
    const { supabaseAdmin } = await import('../db/supabase.js')

    // Obtener email del usuario si no viene en el request
    let userEmail = email
    if (!userEmail) {
      try {
        const { google } = await import('googleapis')
        const oauth2Client = new google.auth.OAuth2()
        oauth2Client.setCredentials({ access_token })
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
        const userInfo = await oauth2.userinfo.get()
        userEmail = userInfo.data.email
      } catch (e) {
        console.warn('⚠️ No se pudo obtener email del token:', e.message)
      }
    }

    // Calcular fecha de expiración (1 hora desde ahora)
    const expiryDate = new Date(Date.now() + 3600000)

    // Cifrar refresh token si existe
    let encryptedRefreshToken = null
    if (refresh_token) {
      // Cifrado simple (en producción usa algo más robusto)
      encryptedRefreshToken = Buffer.from(refresh_token).toString('base64')
    }

    // Preparar datos para upsert
    // Solo incluimos refresh_token si viene en la petición para evitar sobrescribir uno existente con null
    const tokenData = {
        user_id: userId,
        email: userEmail,
        access_token: access_token,
        expiry_date: expiryDate.toISOString(),
        updated_at: new Date().toISOString()
    };

    if (encryptedRefreshToken) {
        tokenData.refresh_token = encryptedRefreshToken;
    }

    // Guardar en google_accounts (nueva tabla) en lugar de google_calendar
    const { data, error } = await supabaseAdmin
      .from('google_accounts')
      .upsert(tokenData, { onConflict: 'user_id' })
      .select()

    if (error) {
      throw error
    }

    console.log(`✅ Tokens guardados para usuario ${userId} (${userEmail})`)

    // Iniciar sincronización inicial
    try {
      const { fullSync } = await import('../services/googleCalendar.service.js')
      await fullSync(userId)
      console.log(`✅ Sincronización inicial completada para ${userId}`)
    } catch (syncError) {
      console.warn('⚠️ Error en sincronización inicial:', syncError.message)
    }

    return res.json({ 
      success: true,
      message: 'Tokens guardados exitosamente',
      email: userEmail,
      expiresAt: expiryDate.toISOString()
    })
  } catch (error) {
    console.error('❌ Error saving tokens:', error)
    return res.status(500).json({
      success: false,
      message: 'Error saving tokens',
      error: error.message
    })
  }
}
export async function saveGoogleCalendarCode(req, res) {
  try {
    const userId = getUserIdFromToken(req);
    const { code } = req.body;
    console.log('Código recibido:', code);

    // 1) intercambia code por tokens
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.GOOGLE_REDIRECT_URI
      })
    });
    const tokenJson = await tokenResp.json();
    console.log('Respuesta de Google OAuth:', tokenJson);

    const { access_token, refresh_token } = tokenJson;
    if (!access_token) {
      return res.status(500).json({ success: false, message: 'No llegó access_token' });
    }

    // 2) guarda en BD (upsert)
    await pool.query(`
      INSERT INTO google_calendar(user_id, access_token, refresh_token, created_at)
        VALUES($1::uuid, $2, $3, NOW())
      ON CONFLICT(user_id)
      DO UPDATE SET
        access_token   = EXCLUDED.access_token,
        refresh_token  = EXCLUDED.refresh_token,
        created_at     = NOW();
    `, [userId, access_token, refresh_token || null]);

    // 3) ¡devuelve respuesta!
    return res.json({ success: true });
  } catch (err) {
    console.error('❌ Error en saveGoogleCalendarCode:', err);
    return res.status(500).json({ success: false, error: err.message || err });
  }
}

// Obtener token y verificar si está conectado
export async function checkGoogleCalendarConnection(req, res) {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) return res.status(401).json({ success: false, message: 'No autenticado' });

    // Usar Supabase en lugar de pool.query
    const { supabaseAdmin } = await import('../db/supabase.js')

    const { data: account, error } = await supabaseAdmin
      .from('google_accounts')
      .select('access_token, email, expiry_date')
      .eq('user_id', userId)
      .single()

    if (error || !account || !account.access_token) {
      console.log(`📅 checkGoogleCalendarConnection: Usuario ${userId} NO conectado`)
      return res.json({ success: true, connected: false });
    }

    // Verificar si el token está expirado
    const isExpired = account.expiry_date && new Date(account.expiry_date) < new Date()
    
    console.log(`📅 checkGoogleCalendarConnection: Usuario ${userId} conectado (${account.email}), expirado: ${isExpired}`)
    
    return res.json({ 
      success: true, 
      connected: true, 
      access_token: account.access_token,
      email: account.email,
      expired: isExpired
    });
  } catch (error) {
    console.error('❌ Error al verificar token:', error);
    return res.status(500).json({ success: false, message: 'Error interno', error: error.message });
  }
}
export async function getRefreshedAccessToken(req, res) {
  const userId = getUserIdFromToken(req);
  if (!userId) return res.status(401).json({ success:false, message:'No autenticado' });

  // 1) Recupera tokens de BD
  const { rows } = await pool.query(
    'SELECT access_token, refresh_token FROM google_calendar WHERE user_id = $1::uuid',
    [userId]
  );
  if (!rows.length) return res.json({ success:true, connected:false });

  let { access_token, refresh_token } = rows[0];

  // 2) Intenta usar el refresh_token si el access_token expiró
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token
    })
  }).then(r=>r.json());

  if (tokenResponse.error) {
    console.error('Google refresh error', tokenResponse);
    return res.status(500).json({ success:false, message:'No se pudo refrescar token' });
  }

  // 3) Guarda el nuevo access_token (y refresh si viene)
  access_token = tokenResponse.access_token;
  if (tokenResponse.refresh_token) {
    refresh_token = tokenResponse.refresh_token;
  }
  await pool.query(`
    UPDATE google_calendar
      SET access_token=$1, refresh_token=$2, created_at=NOW()
    WHERE user_id=$3::uuid
  `, [access_token, refresh_token, userId]);

  // 4) Devuelve sólo el access_token al front
  return res.json({ success:true, access_token });
}

export async function postGoogleEvent(req, res) {
  try {
    const userId = getUserIdFromToken(req)
    if (!userId) return res.status(401).json({ success:false, message:'No autenticado' })

    const { summary, description, start, end } = req.body
    if (!summary || !start || !end) {
      return res.status(400).json({ success:false, message:'Faltan campos obligatorios' })
    }

    // llamamos al service account
    const evento = await createGoogleEvent({
      summary,
      description: description || '',
      startDateTime: start,
      endDateTime:   end
    })

    return res.json({ success:true, evento })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ success:false, message:err.message })
  }
}

/**
 * GET /api/calendar/google
 * Lista eventos futuros del Google Calendar
 */
export async function getGoogleEvents(req, res) {
  try {
    const userId = getUserIdFromToken(req)
    if (!userId) return res.status(401).json({ success:false, message:'No autenticado' })

    const items = await listGoogleEvents()
    return res.json({ success:true, items })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ success:false, message:err.message })
  }
}

export default {
    checkGoogleCalendarConnection,
    saveGoogleCalendarToken,
    buildCalendarSummary,
    deleteEvent,
    getEvents,
    bulkInsertEvents,
    getRefreshedAccessToken,
    saveGoogleCalendarCode,
    getGoogleEvents,
    postGoogleEvent
}
//# sourceMappingURL=calendarController.js.map

/**El uso de todos estos permisos es porque en nuestra aplicacion queremos el uso del calendario de google para atraves de nuestra IA podamos añadir, ver, editar lo eventos del usuario que se loggueo para que la gente cuando hable con dicha personalidad se pueda agendar de forma automatica citas con la persona que esta hablando en concreto, nosotros tenemos en nuestra aplicacion dos registros, uno para iniciar session en nuestra aplicación y otro para pedir permisos para editar el calendario de google */