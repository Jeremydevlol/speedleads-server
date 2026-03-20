/**
 * Diagnóstico Meta: Supabase + tablas + webhook + IA.
 * Protegido: NODE_ENV !== 'production' O header X-DIAG-KEY === process.env.DIAG_KEY.
 */
import express from 'express';
import { supabaseAdmin } from '../db/supabase.js';
import { getConnectionByIgId, upsertConversation, insertMessage } from '../db/metaRepo.js';
import { generateReply } from '../services/aiReply.service.js';
import { sendInstagramMessage } from '../services/metaSend.service.js';

const router = express.Router();

function allowDiagnostic(req) {
  if (process.env.NODE_ENV !== 'production') return true;
  const key = req.get('X-DIAG-KEY');
  const expected = process.env.DIAG_KEY;
  return typeof expected === 'string' && expected.length > 0 && key === expected;
}

function diagMiddleware(req, res, next) {
  if (!allowDiagnostic(req)) {
    console.log('[DIAG] Diagnostic access denied (production without valid X-DIAG-KEY)');
    return res.status(403).json({ error: 'Diagnostic not allowed' });
  }
  next();
}

router.use(diagMiddleware);

/**
 * GET /api/meta/diagnostic
 * Estado de env, Supabase y tablas (sin imprimir secretos).
 */
router.get('/diagnostic', async (req, res) => {
  const env = {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    META_VERIFY_TOKEN: !!process.env.META_VERIFY_TOKEN,
    META_APP_SECRET: !!process.env.META_APP_SECRET,
    META_GRAPH_VERSION: !!process.env.META_GRAPH_VERSION,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    DEEPSEEK_API_KEY: !!process.env.DEEPSEEK_API_KEY,
    DIAG_KEY: !!process.env.DIAG_KEY
  };

  const missing = Object.entries(env).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.log('[DIAG] Missing env vars:', missing.join(', '));
  }

  let supabaseReachable = false;
  let tablesOk = false;
  let tablesError = null;

  try {
    const { data, error } = await supabaseAdmin.from('meta_connections').select('tenant_id').limit(1);
    if (error) {
      tablesError = error.message;
      console.log('[DIAG] Supabase/tables error:', error.message);
    } else {
      supabaseReachable = true;
      tablesOk = true;
    }
  } catch (e) {
    tablesError = e.message;
    console.log('[DIAG] Supabase connection failed:', e.message);
  }

  if (supabaseReachable) {
    try {
      const { error: e2 } = await supabaseAdmin.from('meta_conversations').select('tenant_id').limit(0);
      if (e2) {
        tablesOk = false;
        tablesError = tablesError || e2.message;
        console.log('[DIAG] meta_conversations missing or error:', e2.message);
      }
    } catch (_) {}
    try {
      const { error: e3 } = await supabaseAdmin.from('meta_messages').select('id').limit(0);
      if (e3) {
        tablesOk = false;
        tablesError = tablesError || e3.message;
        console.log('[DIAG] meta_messages missing or error:', e3.message);
      }
    } catch (_) {}
  }

  res.json({
    ok: env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && supabaseReachable && tablesOk,
    env,
    supabaseReachable,
    tablesOk,
    tablesError: tablesError || undefined,
    nodeEnv: process.env.NODE_ENV
  });
});

/**
 * POST /api/meta/diagnostic/test-event
 * Simula un evento Meta controlado: conexión, upsert conversación, insert mensaje, opcional IA y envío.
 * Body: { ig_business_id, sender_id, text, mid, send? } (send default false)
 */
router.post('/diagnostic/test-event', async (req, res) => {
  const body = req.body || {};
  const ig_business_id = body.ig_business_id != null ? String(body.ig_business_id) : null;
  const sender_id = body.sender_id != null ? String(body.sender_id) : null;
  const text = body.text != null ? String(body.text) : 'hola test';
  const mid = body.mid != null ? String(body.mid) : `TEST_MID_${Date.now()}`;
  const sendToMeta = body.send === true;

  if (!ig_business_id || !sender_id) {
    return res.status(400).json({
      error: 'Missing ig_business_id or sender_id',
      connectionFound: false
    });
  }

  const conn = await getConnectionByIgId(ig_business_id);
  if (!conn) {
    console.log('[DIAG] No meta_connection for ig_business_id:', ig_business_id);
    return res.status(404).json({
      error: 'No hay meta_connection para ese ig_business_id',
      connectionFound: false,
      ig_business_id
    });
  }

  const { tenant_id, access_token, auto_reply_enabled } = conn;
  const now = new Date().toISOString();

  let insertedIn = false;
  let deduped = false;

  try {
    await upsertConversation({
      tenant_id,
      ig_business_id,
      sender_id,
      last_message: text,
      last_message_at: now
    });
  } catch (e) {
    console.log('[DIAG] Supabase upsertConversation failed:', e.message);
    return res.status(500).json({
      connectionFound: true,
      tenant_id,
      error: 'upsertConversation failed',
      diagMessage: e.message
    });
  }

  const insertResult = await insertMessage({
    tenant_id,
    ig_business_id,
    sender_id,
    direction: 'in',
    mid,
    text,
    raw: { diagnostic: true, source: 'test-event' }
  });

  if (insertResult.inserted) {
    insertedIn = true;
  } else {
    deduped = true;
    console.log('[DIAG] Dedupe: same mid already exists, did not insert again');
  }

  let aiGenerated = false;
  let replyTextPreview = null;
  let sentToMeta = false;
  let metaSendResult = null;

  if (auto_reply_enabled) {
    try {
      const reply = await generateReply({ tenant_id, ig_business_id, sender_id });
      if (reply?.text) {
        aiGenerated = true;
        replyTextPreview = reply.text.length > 100 ? reply.text.slice(0, 100) + '…' : reply.text;
        await insertMessage({
          tenant_id,
          ig_business_id,
          sender_id,
          direction: 'out',
          mid: null,
          text: reply.text,
          raw: { source: 'ai_reply', diagnostic: true }
        });
        if (sendToMeta && access_token) {
          const result = await sendInstagramMessage(access_token, sender_id, reply.text);
          sentToMeta = result.success;
          metaSendResult = result.success
            ? { success: true }
            : { success: false, error: result.error, errorPayload: result.errorPayload };
          if (!result.success) {
            console.log('[DIAG] Meta send failed:', result.error);
            if (result.errorPayload) console.log('[DIAG] Meta Graph API error payload:', JSON.stringify(result.errorPayload));
          }
        }
      } else {
        console.log('[DIAG] IA did not return text (generateReply returned null)');
      }
    } catch (e) {
      console.log('[DIAG] IA generateReply failed:', e.message);
    }
  }

  res.json({
    connectionFound: true,
    tenant_id,
    insertedIn,
    deduped,
    aiGenerated,
    replyTextPreview,
    sentToMeta: sendToMeta ? sentToMeta : undefined,
    metaSendResult
  });
});

export default router;
