/**
 * Respuesta automática con IA para Meta Instagram.
 * Versión simple (solo system prompt env). La versión con personalidades como WhatsApp está en dist/services/aiReply.service.js.
 */
import OpenAI from 'openai';
import { getRecentMessages } from '../db/metaRepo.js';
import { supabaseAdmin } from '../db/supabase.js';

const OPENAI_KEY = (process.env.OPENAI_API_KEY || '').trim();
const DEEPSEEK_KEY = (process.env.DEEPSEEK_API_KEY || '').trim();
const AI_PROVIDER = OPENAI_KEY ? 'openai' : (DEEPSEEK_KEY ? 'deepseek' : null);
const AI_API_KEY = OPENAI_KEY || DEEPSEEK_KEY;
const AI_BASE_URL = AI_PROVIDER === 'deepseek' ? 'https://api.deepseek.com/v1' : undefined;

const openai = new OpenAI({
  apiKey: AI_API_KEY,
  baseURL: AI_BASE_URL
});

const RECENT_MESSAGES_LIMIT = 20;
const DEFAULT_SYSTEM_PROMPT =
  'Eres un asistente útil y amable. Responde de forma breve y natural en el mismo idioma que el usuario.';

async function getPreferredPersonality(userId, explicitPersonalityId = null) {
  if (!userId) return null;
  try {
    const uid = String(userId);
    const requestedPersonalityId = explicitPersonalityId ? String(explicitPersonalityId) : null;
    const { data: settings } = await supabaseAdmin
      .from('user_settings')
      .select('global_personality_id')
      .eq('user_id', uid)
      .maybeSingle();

    const selectedPersonalityId =
      requestedPersonalityId ||
      (settings?.global_personality_id ? String(settings.global_personality_id) : null);
    const baseQuery = supabaseAdmin
      .from('personalities')
      .select('id, nombre, category, saludo, instrucciones, context, tone, language, response_style, fallback_message, no_answer_message, max_response_words, system_prompt_extra, forbidden_topics')
      .eq('users_id', uid);

    if (selectedPersonalityId) {
      const { data: selected } = await baseQuery.eq('id', selectedPersonalityId).maybeSingle();
      if (selected) return selected;
    }

    const { data: latest } = await supabaseAdmin
      .from('personalities')
      .select('id, nombre, category, saludo, instrucciones, context, tone, language, response_style, fallback_message, no_answer_message, max_response_words, system_prompt_extra, forbidden_topics')
      .eq('users_id', uid)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return latest ?? null;
  } catch (err) {
    console.warn('[aiReply] getPreferredPersonality warning:', err.message);
    return null;
  }
}

function buildSystemPrompt(personality) {
  if (!personality) {
    return process.env.META_AI_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;
  }

  const sections = [
    process.env.META_AI_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT,
    `Personalidad activa: ${personality.nombre || 'Agente'} (${personality.category || 'general'})`,
  ];

  if (personality.saludo) sections.push(`Saludo base: ${String(personality.saludo).trim()}`);
  if (personality.instrucciones) sections.push(`Instrucciones: ${String(personality.instrucciones).trim()}`);
  if (personality.context) sections.push(`Contexto: ${String(personality.context).trim()}`);
  if (personality.tone) sections.push(`Tono: ${String(personality.tone).trim()}`);
  if (personality.language) sections.push(`Idioma preferido: ${String(personality.language).trim()}`);
  if (personality.response_style) sections.push(`Estilo de respuesta: ${String(personality.response_style).trim()}`);
  if (personality.system_prompt_extra) sections.push(`Reglas extra: ${String(personality.system_prompt_extra).trim()}`);
  if (personality.forbidden_topics) sections.push(`Temas prohibidos: ${String(personality.forbidden_topics).trim()}`);
  if (personality.no_answer_message) sections.push(`Si no sabes la respuesta, usa: ${String(personality.no_answer_message).trim()}`);
  if (personality.max_response_words) sections.push(`Máximo de palabras por respuesta: ${Number(personality.max_response_words)}`);

  return sections.join('\n\n');
}

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
  const personality = await getPreferredPersonality(p.tenant_id);
  const systemContent = buildSystemPrompt(personality);

  if (!AI_API_KEY) {
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

export async function generatePersonalizedLeadMessage({
  tenant_id,
  recipient_username,
  template_message,
  personality_id = null,
}) {
  if (!AI_API_KEY) {
    return { success: false, error: 'No OPENAI_API_KEY nor DEEPSEEK_API_KEY' };
  }

  const template = String(template_message || '').trim();
  if (!template) {
    return { success: false, error: 'template_message is required' };
  }

  const personality = await getPreferredPersonality(tenant_id, personality_id);
  const systemContent = `${buildSystemPrompt(personality)}

Objetivo: redactar un DM de prospeccion para Instagram usando una plantilla base.
Reglas:
- Debes mantener la intencion del mensaje plantilla, pero reescribirlo de forma natural.
- Personaliza el texto para @${String(recipient_username || '').replace(/^@/, '') || 'usuario'}.
- Devuelve solo el mensaje final, sin comillas, sin markdown, sin explicaciones.
- Longitud recomendada: 1-3 frases.`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.META_AI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemContent },
        {
          role: 'user',
          content: `Plantilla base:\n${template}\n\nGenera una version unica para este lead de Instagram.`,
        },
      ],
      max_tokens: 180,
      temperature: 0.9,
    });

    const text = completion.choices?.[0]?.message?.content?.trim();
    if (!text) return { success: false, error: 'Empty AI response' };
    return { success: true, text };
  } catch (err) {
    console.error('[aiReply] generatePersonalizedLeadMessage error:', err.message);
    return {
      success: false,
      error: `AI ${AI_PROVIDER || 'provider'} auth/error: ${err.message}`,
    };
  }
}
