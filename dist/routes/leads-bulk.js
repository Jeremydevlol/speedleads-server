import { Router } from "express";
import pool, { supabaseAdmin } from "../config/db.js";
import { validateJwt } from "../config/jwt.js";
import { getUserIdFromToken } from "../controllers/authController.js";

// Reutiliza tus utilidades
import { sendMessage } from "../controllers/whatsappController.js";
import { generateBotResponse } from "../services/openaiService.js";

const router = Router();

// Template: "Hola {{name}}" => Hola Carlos
function applyTemplate(tpl = "", vars = {}) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] ?? ""));
}

async function fetchConversationHistory(userId, jid, limit = 15) {
  // 1) sacar convId interno
  const conv = await supabaseAdmin
    .from("conversations_new")
    .select("id")
    .eq("user_id", userId)
    .eq("external_id", jid)
    .maybeSingle();

  if (!conv?.data?.id) return [];

  // 2) traer últimos mensajes
  const msgs = await supabaseAdmin
    .from("messages_new")
    .select("sender_type,text_content,whatsapp_created_at")
    .eq("user_id", userId)
    .eq("conversation_id", conv.data.id)
    .order("whatsapp_created_at", { ascending: true })
    .limit(limit);

  if (!msgs?.data) return [];
  return msgs.data.map(m => ({
    role:
      m.sender_type === "user" ? "user" :
      m.sender_type === "system" ? "system" : "assistant",
    content: m.text_content || ""
  }));
}

async function resolvePersonality(userId, explicitPersonalityId, jid) {
  // Prioridades:
  // 1) explicitPersonalityId del request
  // 2) personalidad de la conversación (conversations_new.personality_id)
  // 3) user_settings.default_personality_id
  if (explicitPersonalityId) {
    const p = await supabaseAdmin.from("personalities").select("*").eq("id", explicitPersonalityId).maybeSingle();
    return p?.data || null;
  }

  const convP = await supabaseAdmin
    .from("conversations_new")
    .select("personality_id")
    .eq("user_id", userId)
    .eq("external_id", jid)
    .maybeSingle();

  if (convP?.data?.personality_id) {
    const p = await supabaseAdmin.from("personalities").select("*").eq("id", convP.data.personality_id).maybeSingle();
    return p?.data || null;
  }

  const settings = await supabaseAdmin
    .from("user_settings")
    .select("default_personality_id")
    .eq("users_id", userId)
    .maybeSingle();

  if (settings?.data?.default_personality_id) {
    const p = await supabaseAdmin.from("personalities").select("*").eq("id", settings.data.default_personality_id).maybeSingle();
    return p?.data || null;
  }

  return null;
}

/**
 * POST /api/leads/bulk_send
 * body: {
 *   columnId: string|number,
 *   mode: 'manual'|'ai',
 *   text?: string,                      // manual
 *   promptTemplate?: string,            // ai -> e.g. "Hola {{name}}..."
 *   personalityId?: string|number      // ai
 * }
 */
router.post("/bulk_send", validateJwt, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) return res.status(401).json({ success: false, message: "No autenticado" });

    const { columnId, mode, text, promptTemplate, personalityId } = req.body;
    if (!columnId) return res.status(400).json({ success: false, message: "columnId requerido" });
    if (mode !== "manual" && mode !== "ai") return res.status(400).json({ success: false, message: "mode inválido" });
    if (mode === "manual" && (!text || !text.trim())) return res.status(400).json({ success: false, message: "text requerido" });

    console.log(`🚀 Iniciando envío masivo ${mode} para columna ${columnId}, usuario ${userId}`);

    // Traer los leads de ESA columna, para ESE usuario, con JID (conversation_id) válido
    const q = `
      select lc.id as lead_id,
             lc.name as lead_name,
             lc.conversation_id as jid
      from public.leads_contacts lc
      join public.leads l on l.id = lc.column_id and l.user_id = lc.user_id
      where lc.user_id = $1
        and lc.column_id = $2
        and lc.conversation_id is not null
    `;
    const { rows } = await client.query(q, [userId, columnId]);
    if (!rows.length) {
      return res.json({ success: true, sent: 0, fail: 0, details: [], message: "No hay leads con conversación en la columna" });
    }

    console.log(`📋 Encontrados ${rows.length} leads para envío masivo`);

    let sent = 0, fail = 0;
    const details = [];

    for (const r of rows) {
      const jid = r.jid;
      const leadName = r.lead_name || jid.split("@")[0];

      try {
        console.log(`📤 Procesando ${leadName} (${jid})...`);
        let finalText = "";

        if (mode === "ai") {
          // 1) personalidad
          const personality = await resolvePersonality(userId, personalityId, jid);
          console.log(`🎭 Personalidad para ${leadName}:`, personality?.name || "Por defecto");
          
          // 2) historial
          const history = await fetchConversationHistory(userId, jid, 15);
          console.log(`📚 Historial para ${leadName}: ${history.length} mensajes`);
          
          // 3) prompt del usuario con variables (por contacto)
          const userMessage = applyTemplate(
            (promptTemplate || "Escribe un saludo profesional para {{name}} y ofrécele ayuda."), 
            { name: leadName }
          );
          console.log(`💬 Prompt personalizado para ${leadName}: "${userMessage}"`);

          // 4) generar respuesta
          const reply = await generateBotResponse({
            personality,
            userMessage,
            userId,
            history,
            mediaType: null,
            mediaContent: null
          });

          finalText = (reply || "").trim();
          if (!finalText) {
            // fallback por si la IA devuelve vacío
            finalText = applyTemplate("Hola {{name}} 👋 ¿Cómo estás? Soy tu asistente.", { name: leadName });
          }

          console.log(`🤖 IA generó para ${leadName}: "${finalText.substring(0, 50)}..."`);

          // 5) enviar como IA
          await sendMessage(userId, jid, finalText, [], "ia");
        } else {
          // MANUAL + plantilla por contacto
          finalText = applyTemplate(text || "", { name: leadName });
          console.log(`📝 Mensaje manual para ${leadName}: "${finalText.substring(0, 50)}..."`);
          await sendMessage(userId, jid, finalText, [], "you");
        }

        details.push({ 
          lead_id: r.lead_id, 
          jid, 
          contactName: leadName,
          ok: true,
          message: finalText.length > 100 ? finalText.substring(0, 100) + "..." : finalText,
          mode: mode
        });
        sent++;
        
        console.log(`✅ Enviado a ${leadName}`);
        await new Promise(r => setTimeout(r, 350)); // throttle
      } catch (e) {
        console.error(`❌ Error enviando a ${leadName}:`, e.message);
        details.push({ 
          lead_id: r.lead_id, 
          jid, 
          contactName: leadName,
          ok: false, 
          error: e?.message || "error",
          mode: mode
        });
        fail++;
      }
    }

    console.log(`🎉 Envío masivo completado: ${sent} exitosos, ${fail} fallidos`);

    return res.json({ 
      success: true, 
      sent, 
      fail, 
      total: rows.length, 
      details,
      message: `Envío ${mode} completado: ${sent}/${rows.length} mensajes enviados`
    });
  } catch (e) {
    console.error("bulk_send error:", e);
    return res.status(500).json({ success: false, message: e?.message || "Error" });
  } finally {
    client.release();
  }
});

/**
 * GET /api/leads/bulk_preview/:columnId
 * Vista previa de los leads que recibirán el mensaje
 */
router.get("/bulk_preview/:columnId", validateJwt, async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: "No autenticado" });
    }

    const { columnId } = req.params;

    const query = `
      SELECT lc.id as lead_id,
             lc.name as lead_name,
             lc.conversation_id as jid,
             lc.message as lead_message,
             l.title as column_title
      FROM public.leads_contacts lc
      JOIN public.leads l ON l.id = lc.column_id AND l.user_id = lc.user_id
      WHERE lc.user_id = $1
        AND lc.column_id = $2
        AND lc.conversation_id IS NOT NULL
        AND lc.conversation_id != ''
      ORDER BY lc.created_at ASC
    `;

    const { rows } = await pool.query(query, [userId, columnId]);

    const preview = rows.map(row => ({
      leadId: row.lead_id,
      name: row.lead_name || row.jid.split("@")[0],
      phone: row.jid.split("@")[0],
      message: row.lead_message,
      hasWhatsApp: !!row.jid
    }));

    return res.json({
      success: true,
      columnTitle: rows.length > 0 ? rows[0].column_title : "Columna no encontrada",
      totalLeads: preview.length,
      leads: preview
    });

  } catch (error) {
    console.error("bulk_preview error:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Error interno" 
    });
  }
});

export default router;
