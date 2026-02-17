// Webhook Meta (Messenger / Instagram) – verificación y recepción de eventos
import crypto from 'crypto';
import express from 'express';

const router = express.Router();

const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
// Activar verificación de firma X-Hub-Signature-256 (HMAC SHA256). En desarrollo puede ser false.
const VERIFY_META_SIGNATURE = process.env.VERIFY_META_SIGNATURE === 'true';

/**
 * Verificación de suscripción (Meta hace GET con hub.mode, hub.verify_token, hub.challenge).
 * GET /webhook/meta?hub.mode=subscribe&hub.verify_token=...&hub.challenge=12345
 * Si verify_token coincide con META_VERIFY_TOKEN → 200 con el texto exacto de hub.challenge.
 */
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

/**
 * Middleware: verifica X-Hub-Signature-256 con HMAC SHA256 usando META_APP_SECRET.
 * req.rawBody debe ser el body crudo (Buffer) antes de parsear JSON.
 */
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

/**
 * POST /webhook/meta – Recibe eventos de Meta.
 * Se debe usar express.raw({ type: 'application/json' }) para tener el body crudo y poder verificar la firma.
 * Responde 200 de inmediato y loguea el body.
 */
function postMetaWebhook(req, res) {
  // Responder 200 inmediatamente (Meta espera respuesta rápida)
  res.status(200).end();

  const rawBody = req.rawBody ?? req.body;
  let body = req.body;
  if (Buffer.isBuffer(rawBody)) {
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch (e) {
      console.warn('Meta webhook: body no es JSON válido', e.message);
      return;
    }
  }

  console.log('📩 Meta webhook (Messenger/Instagram) payload:');
  console.log(JSON.stringify(body, null, 2));
}

// POST con raw body; guardamos rawBody en req para la verificación y para parsear después
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
