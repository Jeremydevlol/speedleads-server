/**
 * Respuesta automática con IA para Meta Instagram.
 * Usa las mismas personalidades que WhatsApp: user_settings.global_personality_id o agente único.
 */
import OpenAI from 'openai';
import { getRecentMessages } from '../db/metaRepo.js';
import { supabaseAdmin } from '../db/supabase.js';
import { getSingleAgentForUser } from '../controllers/personalityController.js';
import { generateBotResponse } from './openaiService.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_API_KEY
    ? 'https://api.deepseek.com/v1'
    : undefined
});

const RECENT_MESSAGES_LIMIT = 50;

/**
 * Construye array de mensajes para chat (user/assistant) desde meta_messages.
 */
function buildChatMessages(rows) {
  return rows
    .filter((r) => r.text != null && String(r.text).trim() !== '')
    .map((r) => ({
      role: r.direction === 'in' ? 'user' : 'assistant',
      content: String(r.text).trim()
    }));
}

/**
 * Resuelve la personalidad para el tenant (mismo criterio que WhatsApp: global_personality_id o agente único).
 * @param {string} tenantId - user_id / tenant_id
 * @returns {Promise<object|null>}
 */
async function resolvePersonalityForTenant(tenantId) {
  if (!tenantId) return null;
  let personalityId = null;
  const { data: settings } = await supabaseAdmin
    .from('user_settings')
    .select('global_personality_id')
    .eq('user_id', tenantId)
    .maybeSingle();
  if (settings?.global_personality_id) personalityId = settings.global_personality_id;
  if (personalityId) {
    const { data: p } = await supabaseAdmin
      .from('personalities')
      .select('*')
      .eq('id', personalityId)
      .eq('users_id', tenantId)
      .maybeSingle();
    if (p) return p;
  }
  return getSingleAgentForUser(tenantId);
}

/**
 * Genera respuesta con IA para la conversación.
 * Si el usuario tiene personalidad configurada (global o agente único), usa generateBotResponse igual que WhatsApp.
 * Si no, usa META_AI_SYSTEM_PROMPT y modelo básico.
 * @param {object} p - { tenant_id, ig_business_id, sender_id }
 * @returns {Promise<{ text: string, raw?: object } | null>}
 */
export async function generateReply(p) {
  const { tenant_id } = p;
  const recent = await getRecentMessages({
    tenant_id: p.tenant_id,
    ig_business_id: p.ig_business_id,
    sender_id: p.sender_id,
    limit: RECENT_MESSAGES_LIMIT
  });
  const messages = buildChatMessages(recent);
  if (messages.length === 0) return null;

  const apiKey = process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.warn('[aiReply] No OPENAI_API_KEY nor DEEPSEEK_API_KEY');
    return null;
  }

  const personality = await resolvePersonalityForTenant(tenant_id);
  if (personality) {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    const userMessage = lastUserMsg?.content?.trim() || '';
    if (!userMessage) return null;
    const history = messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
    try {
      const response = await generateBotResponse({
        personality,
        userMessage,
        userId: tenant_id,
        history
      });
      if (response && typeof response === 'string' && response.trim()) {
        console.log('[aiReply] Usando personalidad:', personality.nombre, '(ID:', personality.id, ')');
        return { text: response.trim(), raw: { source: 'personality', personalityId: personality.id } };
      }
    } catch (err) {
      console.error('[aiReply] generateBotResponse error:', err.message);
    }
  }

  const systemContent =
    process.env.META_AI_SYSTEM_PROMPT ||
    'Eres un asistente útil y amable. Responde de forma breve y natural en el mismo idioma que el usuario.';
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
