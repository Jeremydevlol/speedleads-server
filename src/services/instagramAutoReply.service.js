/**
 * Instagram Auto-Reply Service
 * Polling del inbox de Instagram + respuesta automática con IA
 * 
 * Funcionalidad:
 * - Cada 30-60s revisa el inbox de Instagram
 * - Detecta mensajes nuevos no respondidos
 * - Genera respuesta con IA usando la personalidad configurada
 * - Envía la respuesta automáticamente
 */

import OpenAI from 'openai';
import { supabaseAdmin } from '../db/supabase.js';
import {
  getOrCreatePrivateClient,
  privateApiGetStatus,
} from './instagramPrivateApi.service.js';

// ═══════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════

const OPENAI_KEY = (process.env.OPENAI_API_KEY || '').trim();
const DEEPSEEK_KEY = (process.env.DEEPSEEK_API_KEY || '').trim();
const AI_API_KEY = OPENAI_KEY || DEEPSEEK_KEY;
const AI_BASE_URL = DEEPSEEK_KEY && !OPENAI_KEY ? 'https://api.deepseek.com/v1' : undefined;

const openai = new OpenAI({ apiKey: AI_API_KEY, baseURL: AI_BASE_URL });

const POLL_INTERVAL_MS = 20_000; // 20 segundos entre polls
const MAX_CONTEXT_MESSAGES = 15; // últimos 15 mensajes de contexto
const REPLY_DELAY_MIN_MS = 3_000; // mínimo 3s antes de responder
const REPLY_DELAY_MAX_MS = 10_000; // máximo 10s

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════

// Map<userId, { interval, active, repliedThreads, lastPollAt, stats }>
const activePollers = new Map();

// Set de thread_id+item_id ya procesados (evita duplicados)
// Map<userId, Set<string>>
const processedMessages = new Map();

// ═══════════════════════════════════════════════════════════
// AI REPLY GENERATION
// ═══════════════════════════════════════════════════════════

async function getPersonality(userId) {
  try {
    const uid = String(userId);

    // Buscar personalidad global del usuario
    const { data: settings } = await supabaseAdmin
      .from('user_settings')
      .select('global_personality_id')
      .eq('user_id', uid)
      .maybeSingle();

    const personalityId = settings?.global_personality_id
      ? String(settings.global_personality_id)
      : null;

    const baseQuery = supabaseAdmin
      .from('personalities')
      .select('id, nombre, category, saludo, instrucciones, context, tone, language, response_style, fallback_message, no_answer_message, max_response_words, system_prompt_extra, forbidden_topics')
      .eq('users_id', uid);

    if (personalityId) {
      const { data } = await baseQuery.eq('id', personalityId).maybeSingle();
      if (data) return data;
    }

    // Fallback: última personalidad actualizada
    const { data: latest } = await supabaseAdmin
      .from('personalities')
      .select('id, nombre, category, saludo, instrucciones, context, tone, language, response_style, fallback_message, no_answer_message, max_response_words, system_prompt_extra, forbidden_topics')
      .eq('users_id', uid)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return latest ?? null;
  } catch (err) {
    console.warn('[IG-AutoReply] Error obteniendo personalidad:', err.message);
    return null;
  }
}

function buildSystemPrompt(personality) {
  const base = 'Eres un asistente de Instagram que responde DMs de forma natural, breve y conversacional. Responde en el mismo idioma que el usuario.';

  if (!personality) return base;

  const sections = [base];
  sections.push(`Personalidad activa: ${personality.nombre || 'Agente'} (${personality.category || 'general'})`);

  if (personality.instrucciones) sections.push(`Instrucciones: ${String(personality.instrucciones).trim()}`);
  if (personality.context) sections.push(`Contexto: ${String(personality.context).trim()}`);
  if (personality.tone) sections.push(`Tono: ${String(personality.tone).trim()}`);
  if (personality.language) sections.push(`Idioma preferido: ${String(personality.language).trim()}`);
  if (personality.response_style) sections.push(`Estilo de respuesta: ${String(personality.response_style).trim()}`);
  if (personality.system_prompt_extra) sections.push(`Reglas extra: ${String(personality.system_prompt_extra).trim()}`);
  if (personality.forbidden_topics) sections.push(`Temas prohibidos: ${String(personality.forbidden_topics).trim()}`);
  if (personality.no_answer_message) sections.push(`Si no sabes la respuesta, usa: ${String(personality.no_answer_message).trim()}`);
  if (personality.max_response_words) sections.push(`Máximo de palabras por respuesta: ${Number(personality.max_response_words)}`);

  sections.push('\nReglas de respuesta en DM:');
  sections.push('- Sé breve y natural (1-3 frases)');
  sections.push('- No uses markdown, emojis excesivos ni formato formal');
  sections.push('- Responde como una persona real, no como un bot');
  sections.push('- Si no puedes ayudar, sé honesto');

  return sections.join('\n\n');
}

async function generateAIReply(userId, conversationMessages, senderUsername) {
  if (!AI_API_KEY) {
    console.warn('[IG-AutoReply] No hay API key de IA configurada');
    return null;
  }

  const personality = await getPersonality(userId);
  const systemContent = buildSystemPrompt(personality);

  // Construir historial de chat
  const chatMessages = conversationMessages
    .filter(m => m.text && String(m.text).trim())
    .map(m => ({
      role: m.is_sent_by_me ? 'assistant' : 'user',
      content: String(m.text).trim()
    }));

  if (chatMessages.length === 0) return null;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.META_AI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `${systemContent}\n\nEstás respondiendo a @${senderUsername} en Instagram DMs.` },
        ...chatMessages.slice(-MAX_CONTEXT_MESSAGES)
      ],
      max_tokens: 300,
      temperature: 0.7
    });

    const text = completion.choices?.[0]?.message?.content?.trim();
    if (!text) return null;

    console.log(`🤖 [IG-AutoReply] Respuesta a DM de @${senderUsername}: "${text.substring(0, 80)}..."`);
    return text;
  } catch (err) {
    console.error('[IG-AutoReply] Error generando respuesta DM IA:', err.message);
    return null;
  }
}

async function generateAICommentReply(userId, commentText, senderUsername) {
  if (!AI_API_KEY) return null;
  const personality = await getPersonality(userId);
  const systemContent = buildSystemPrompt(personality);

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.META_AI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `${systemContent}\n\nEstás respondiendo a un comentario público en tu post de Instagram hecho por @${senderUsername}.` },
        { role: 'user', content: commentText }
      ],
      max_tokens: 150,
      temperature: 0.7
    });

    const text = completion.choices?.[0]?.message?.content?.trim();
    if (!text) return null;

    console.log(`🤖 [IG-AutoReply] Respuesta a Comentario de @${senderUsername}: "${text.substring(0, 80)}..."`);
    return text;
  } catch (err) {
    console.error('[IG-AutoReply] Error generando respuesta Comentario IA:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// INBOX POLLING
// ═══════════════════════════════════════════════════════════

function humanDelay(minMs, maxMs) {
  const delay = minMs + Math.random() * (maxMs - minMs);
  return new Promise(r => setTimeout(r, Math.round(delay)));
}

async function pollAndReply(userId, io = null) {
  const poller = activePollers.get(userId);
  if (!poller || !poller.active) return;

  try {
    // Verificar que la sesión siga activa
    const status = await privateApiGetStatus(userId);
    if (!status?.logged) {
      console.warn(`⚠️ [IG-AutoReply] Sesión no activa para userId=${userId}. Deteniendo auto-reply.`);
      stopAutoReply(userId);
      return;
    }

    console.log(`🔍 [IG-AutoReply] Haciendo polling de inbox para userId=${userId}...`);
    const client = getOrCreatePrivateClient(userId);

    // Obtener inbox
    const inboxResult = await client.getInbox(5);
    if (!inboxResult.success) {
       console.log(`❌ [IG-AutoReply] Error getInbox:`, inboxResult.error);
       return;
    }
    if (!inboxResult.conversations || inboxResult.conversations.length === 0) {
       console.log(`ℹ️ [IG-AutoReply] Inbox vacío o sin conversaciones recientes.`);
       return;
    }
    console.log(`✅ [IG-AutoReply] Análisis completado. ${inboxResult.conversations.length} conversaciones recientes.`);


    // Obtener set de mensajes ya procesados
    if (!processedMessages.has(userId)) {
      processedMessages.set(userId, new Set());
    }
    const processed = processedMessages.get(userId);

    for (const conv of inboxResult.conversations) {
      // Saltar grupos
      if (conv.is_group) continue;

      // Saltar si no hay usuarios
      if (!conv.users || conv.users.length === 0) continue;

      const senderUsername = conv.users[0]?.username;
      if (!senderUsername) continue;

      // Obtener mensajes del thread
      const threadResult = await client.getThreadMessages(conv.thread_id, MAX_CONTEXT_MESSAGES);
      if (!threadResult.success || !threadResult.messages?.length) continue;

      // Los mensajes vienen del más reciente al más antiguo
      const messages = [...threadResult.messages].reverse();
      const lastMessage = messages[messages.length - 1];

      if (!lastMessage) continue;

      // Si el último mensaje es nuestro, no hay nada que responder
      if (lastMessage.is_sent_by_me) continue;

      // Si el mensaje ya fue procesado, skip
      const messageKey = `${conv.thread_id}:${lastMessage.item_id}`;
      if (processed.has(messageKey)) continue;

      // Importante: No responder a mensajes recibidos ANTES de activar el bot
      const startedAtMs = new Date(poller.startedAt).getTime();
      const messageMs = new Date(lastMessage.timestamp).getTime();
      if (messageMs < startedAtMs) {
        processed.add(messageKey); // Marcar como procesado para no volver a mirarlo
        continue;
      }

      // Si es tipo no-texto (media, etc.), skip por ahora
      if (!lastMessage.text || lastMessage.text.trim() === '') continue;

      console.log(`📩 [IG-AutoReply] Nuevo mensaje de @${senderUsername}: "${lastMessage.text.substring(0, 60)}..."`);

      // Marcar como procesado ANTES de responder (evita duplicados)
      processed.add(messageKey);

      // Delay humano antes de responder
      await humanDelay(REPLY_DELAY_MIN_MS, REPLY_DELAY_MAX_MS);

      // Generar respuesta con IA
      const aiReply = await generateAIReply(userId, messages, senderUsername);
      if (!aiReply) {
        console.warn(`⚠️ [IG-AutoReply] No se pudo generar respuesta para @${senderUsername}`);
        continue;
      }

      // Enviar respuesta
      const replyResult = await client.replyToThread(conv.thread_id, aiReply);

      if (replyResult.success) {
        poller.stats.replied++;
        console.log(`✅ [IG-AutoReply] Respuesta enviada a @${senderUsername}: "${aiReply.substring(0, 80)}..."`);

        // Emitir evento via Socket.IO
        if (io) {
          io.to(String(userId)).emit('ig-auto-reply', {
            username: senderUsername,
            threadId: conv.thread_id,
            incomingMessage: lastMessage.text,
            reply: aiReply,
            timestamp: new Date().toISOString()
          });
        }
      } else {
        poller.stats.errors++;
        console.error(`❌ [IG-AutoReply] Error enviando a @${senderUsername}: ${replyResult.error}`);
      }

      // Delay entre respuestas a diferentes threads
      await humanDelay(2000, 5000);
    }

    // ----------------------------------------------------
    // POLLING DE COMENTARIOS (1 de cada 4 iteraciones)
    // ----------------------------------------------------
    if (poller.pollCount % 4 === 0) {
      console.log(`🔍 [IG-AutoReply] Revisando últimos posts en busca de comentarios para userId=${userId}...`);
      const postsResult = await client.getMyRecentPosts(3);
      if (postsResult.success && postsResult.posts) {
        for (const post of postsResult.posts) {
          if (!post.comment_count) continue;
          const commentsResult = await client.getMediaComments(post.pk);
          if (!commentsResult.success || !commentsResult.comments) continue;

          // Revisar los comentarios más recientes (ej limitamos a los primeros 5 retornados)
          const recentComments = commentsResult.comments.slice(0, 5);
          for (const comment of recentComments) {
            const senderUsername = comment.user?.username;
            if (!senderUsername || String(comment.user_id) === String(client.ig.state.cookieUserId)) continue;

            const commentKey = `comment:${post.pk}:${comment.pk}`;
            if (processed.has(commentKey)) continue;

            const startedAtMs = new Date(poller.startedAt).getTime();
            const commentMs = new Date(comment.created_at * 1000).getTime();
            if (commentMs < startedAtMs) {
              processed.add(commentKey);
              continue;
            }

            console.log(`💬 [IG-AutoReply] Nuevo comentario de @${senderUsername}: "${comment.text}"`);
            processed.add(commentKey);

            await humanDelay(REPLY_DELAY_MIN_MS, REPLY_DELAY_MAX_MS);
            const aiReply = await generateAICommentReply(userId, comment.text, senderUsername);
            
            if (aiReply) {
              const replyResult = await client.commentOnPost(post.pk, aiReply, comment.pk);
              if (replyResult.success) {
                poller.stats.replied++;
                console.log(`✅ [IG-AutoReply] Respuesta a comentario de @${senderUsername} enviada: "${aiReply.substring(0, 80)}"`);
              } else {
                poller.stats.errors++;
                console.error(`❌ [IG-AutoReply] Error respondiendo comentario a @${senderUsername}: ${replyResult.error}`);
              }
            }
            await humanDelay(2000, 4000);
          }
        }
      }
    }

    poller.pollCount++;
    poller.lastPollAt = new Date().toISOString();

    // Limpiar mensajes procesados antiguos (mantener solo últimos 500)
    if (processed.size > 500) {
      const arr = [...processed];
      const toRemove = arr.slice(0, arr.length - 500);
      toRemove.forEach(k => processed.delete(k));
    }

  } catch (error) {
    console.error(`❌ [IG-AutoReply] Error en polling para userId=${userId}:`, error.message);
  }
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

/**
 * Iniciar auto-reply para un usuario
 */
export function startAutoReply(userId, io = null) {
  if (activePollers.has(userId)) {
    console.log(`ℹ️ [IG-AutoReply] Ya hay auto-reply activo para userId=${userId}`);
    return { success: true, alreadyActive: true };
  }

  console.log(`🤖 [IG-AutoReply] Iniciando auto-reply para userId=${userId} (polling cada ${POLL_INTERVAL_MS / 1000}s)`);

  const poller = {
    active: true,
    interval: null,
    startedAt: new Date().toISOString(),
    lastPollAt: null,
    pollCount: 0,
    stats: { replied: 0, errors: 0 }
  };

  activePollers.set(userId, poller);

  // Primer poll inmediato
  pollAndReply(userId, io);

  // Poll periódico
  poller.interval = setInterval(() => {
    pollAndReply(userId, io);
  }, POLL_INTERVAL_MS);

  return { success: true, message: 'Auto-reply iniciado' };
}

/**
 * Detener auto-reply
 */
export function stopAutoReply(userId) {
  const poller = activePollers.get(userId);
  if (!poller) {
    return { success: true, message: 'No había auto-reply activo' };
  }

  poller.active = false;
  if (poller.interval) {
    clearInterval(poller.interval);
  }

  const stats = { ...poller.stats, startedAt: poller.startedAt, stoppedAt: new Date().toISOString() };
  activePollers.delete(userId);
  processedMessages.delete(userId);

  console.log(`⏹️ [IG-AutoReply] Auto-reply detenido para userId=${userId}. Stats:`, stats);

  return { success: true, message: 'Auto-reply detenido', stats };
}

/**
 * Obtener estado del auto-reply
 */
export function getAutoReplyStatus(userId) {
  const poller = activePollers.get(userId);
  if (!poller) {
    return { active: false };
  }

  return {
    active: poller.active,
    startedAt: poller.startedAt,
    lastPollAt: poller.lastPollAt,
    stats: poller.stats,
    pollIntervalSeconds: POLL_INTERVAL_MS / 1000
  };
}
