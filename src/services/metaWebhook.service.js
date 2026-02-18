/**
 * Meta (Instagram) webhook – parseo, validación y extracción de eventos de mensaje.
 */
const OBJECT_INSTAGRAM = 'instagram';

export function parseAndExtractMessageEvents(body) {
  if (!body || typeof body !== 'object') return [];
  if (body.object !== OBJECT_INSTAGRAM) return [];
  const entries = body.entry;
  if (!Array.isArray(entries)) return [];

  const out = [];
  for (const entry of entries) {
    const igBusinessId = entry.id != null ? String(entry.id) : null;
    const messagings = entry.messaging;
    if (!Array.isArray(messagings)) continue;

    for (const ev of messagings) {
      const senderId = ev.sender?.id != null ? String(ev.sender.id) : null;
      const recipientId = ev.recipient?.id != null ? String(ev.recipient.id) : null;
      const message = ev.message;
      if (!message) continue;
      const hasText = message.text != null && String(message.text).trim() !== '';
      const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
      if (!hasText && !hasAttachments) continue;

      const igId = recipientId || igBusinessId;
      if (!igId || !senderId) continue;

      out.push({
        igBusinessId: igId,
        senderId,
        message: {
          mid: message.mid,
          text: message.text ? String(message.text).trim() : null,
          attachments: message.attachments || []
        },
        raw: ev
      });
    }
  }
  return out;
}

export function isValidInstagramPayload(body) {
  return body && body.object === OBJECT_INSTAGRAM && Array.isArray(body.entry);
}
