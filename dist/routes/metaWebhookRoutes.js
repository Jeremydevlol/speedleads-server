// Webhook Meta (Messenger / Instagram) – verificación, recepción, Supabase e IA
import crypto from 'crypto';
import express from 'express';
import { parseAndExtractMessageEvents, isValidInstagramPayload } from '../services/metaWebhook.service.js';
import { getConnectionByIgId, upsertConversation, insertMessage } from '../db/metaRepo.js';
import { generateReply } from '../services/aiReply.service.js';
import { sendInstagramMessage } from '../services/metaSend.service.js';

const router = express.Router();

const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const VERIFY_META_SIGNATURE = process.env.VERIFY_META_SIGNATURE === 'true';

router.get('/meta', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === META_VERIFY_TOKEN && challenge != null) {
    res.status(200).type('text/plain').send(String(challenge));
    return;
  }
  res.status(403).end();
});

function verifyMetaSignature(req, res, next) {
  if (!VERIFY_META_SIGNATURE) return next();
  const signature = req.get('X-Hub-Signature-256');
  const rawBody = req.rawBody ?? req.body;
  if (!signature || !rawBody) {
    return res.status(401).send('Missing signature or body');
  }
  if (!META_APP_SECRET) {
    console.warn('VERIFY_META_SIGNATURE is true but META_APP_SECRET is not set');
    return next();
  }
  const expected = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  const hmac = crypto.createHmac('sha256', META_APP_SECRET).update(payload).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const hmacBuf = Buffer.from(hmac, 'hex');
  if (expectedBuf.length !== hmacBuf.length || !crypto.timingSafeEqual(expectedBuf, hmacBuf)) {
    return res.status(401).send('Invalid signature');
  }
  next();
}

async function processMessageEvent(ev) {
  const { igBusinessId, senderId, message, raw } = ev;
  const conn = await getConnectionByIgId(igBusinessId);
  if (!conn) {
    console.log('[meta webhook] ignored (no connection):', { ig_business_id: igBusinessId, sender_id: senderId, mid: message.mid });
    return;
  }
  const { tenant_id, access_token, auto_reply_enabled } = conn;
  const textForDb = message.text || (message.attachments?.length ? '[archivo adjunto]' : null);
  const now = new Date().toISOString();

  try {
    await upsertConversation({
      tenant_id,
      ig_business_id: igBusinessId,
      sender_id: senderId,
      last_message: textForDb,
      last_message_at: now
    });
  } catch (e) {
    console.error('[meta webhook] upsertConversation error:', e.message);
    return;
  }

  const insertResult = await insertMessage({
    tenant_id,
    ig_business_id: igBusinessId,
    sender_id: senderId,
    direction: 'in',
    mid: message.mid ?? null,
    text: message.text ?? textForDb,
    raw
  });

  if (!insertResult.inserted) {
    console.log('[meta webhook] ignored (duplicate mid):', { tenant_id, ig_business_id: igBusinessId, sender_id: senderId, mid: message.mid });
    return;
  }

  console.log('[meta webhook] message saved:', { tenant_id, ig_business_id: igBusinessId, sender_id: senderId, mid: message.mid });

  if (!auto_reply_enabled) return;

  let replyText = null;
  try {
    const reply = await generateReply({
      tenant_id,
      ig_business_id: igBusinessId,
      sender_id: senderId
    });
    replyText = reply?.text;
  } catch (e) {
    console.error('[meta webhook] generateReply error:', e.message);
    return;
  }
  if (!replyText) return;

  await insertMessage({
    tenant_id,
    ig_business_id: igBusinessId,
    sender_id: senderId,
    direction: 'out',
    mid: null,
    text: replyText,
    raw: { source: 'ai_reply' }
  });

  const sendResult = await sendInstagramMessage(access_token, senderId, replyText);
  if (sendResult.success) {
    console.log('[meta webhook] replied:', { tenant_id, ig_business_id: igBusinessId, sender_id: senderId });
  } else {
    console.error('[meta webhook] send failed:', sendResult.error);
  }
}

function postMetaWebhook(req, res) {
  res.status(200).end();

  let body = req.body;
  const rawBody = req.rawBody ?? req.body;
  if (Buffer.isBuffer(rawBody)) {
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch (e) {
      console.warn('[meta webhook] invalid JSON body');
      return;
    }
  }

  if (!isValidInstagramPayload(body)) {
    if (body && body.object !== 'instagram') {
      console.log('[meta webhook] ignored (object !== instagram):', body.object);
    }
    return;
  }

  const events = parseAndExtractMessageEvents(body);
  if (events.length === 0) {
    console.log('[meta webhook] no message events in payload');
    return;
  }

  for (const ev of events) {
    setImmediate(() => {
      processMessageEvent(ev).catch((err) => {
        console.error('[meta webhook] processMessageEvent error:', err.message);
      });
    });
  }
}

router.post(
  '/meta',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    req.rawBody = req.body;
    next();
  },
  verifyMetaSignature,
  postMetaWebhook
);

export default router;
