/**
 * Respuesta automática con IA para Meta Instagram.
 * Versión simple (solo system prompt env). La versión con personalidades como WhatsApp está en dist/services/aiReply.service.js.
 */
import OpenAI from 'openai';
import { getRecentMessages } from '../db/metaRepo.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_API_KEY ? 'https://api.deepseek.com/v1' : undefined
});

const RECENT_MESSAGES_LIMIT = 20;

function buildChatMessages(rows) {
  return rows
    .filter((r) => r.text != null && String(r.text).trim() !== '')
    .map((r) => ({
      role: r.direction === 'in' ? 'user' : 'assistant',
      content: String(r.text).trim()
    }));
}

export async function generateReply(p) {
  const recent = await getRecentMessages({
    tenant_id: p.tenant_id,
    ig_business_id: p.ig_business_id,
    sender_id: p.sender_id,
    limit: RECENT_MESSAGES_LIMIT
  });
  const messages = buildChatMessages(recent);
  if (messages.length === 0) return null;
  const systemContent =
    process.env.META_AI_SYSTEM_PROMPT ||
    'Eres un asistente útil y amable. Responde de forma breve y natural en el mismo idioma que el usuario.';

  const apiKey = process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.warn('[aiReply] No OPENAI_API_KEY nor DEEPSEEK_API_KEY');
    return null;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.META_AI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemContent },
        ...messages.slice(-RECENT_MESSAGES_LIMIT)
      ],
      max_tokens: 500,
      temperature: 0.7
    });
    const choice = completion.choices?.[0];
    const text = choice?.message?.content?.trim();
    if (!text) return null;
    return {
      text,
      raw: { model: completion.model, usage: completion.usage, id: completion.id }
    };
  } catch (err) {
    console.error('[aiReply] generateReply error:', err.message);
    return null;
  }
}
