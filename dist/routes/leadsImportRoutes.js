import { Router } from "express";
import pool from "../config/db.js";
import { validateJwt } from "../config/jwt.js";
import { getUserIdFromToken } from "../controllers/authController.js";

const router = Router();

/**
 * Normaliza un número de teléfono a formato JID de WhatsApp
 */
function normalizeToJid(raw, defaultCountry = "34") {
  if (!raw) throw new Error("Teléfono vacío");
  
  let n = raw.replace(/[^\d+]/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("+")) n = n.slice(1);
  
  // Si el número es corto y no empieza con código de país, añadir defaultCountry
  if (!n.startsWith(defaultCountry) && n.length <= 9) {
    n = defaultCountry + n;
  }
  
  if (n.length < 7) throw new Error("Teléfono demasiado corto");
  
  return `${n}@s.whatsapp.net`;
}

/**
 * POST /api/leads/import_contacts
 * Guarda contactos en conversations_new y crea leads en la primera columna
 * 
 * @body {Array} contacts - Lista de contactos [{ name, phone }]
 * @body {string} [column_id] - ID de columna específica (opcional)
 * @body {string} [defaultCountry] - Código de país por defecto (opcional, default: "34")
 * @returns {Object} Resultado de la importación
 */
router.post("/import_contacts", validateJwt, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "No autenticado" 
      });
    }

    const { contacts, column_id, defaultCountry = "34" } = req.body || {};
    
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Se requiere un array de contactos no vacío" 
      });
    }

    // 1) Obtener o crear columna objetivo
    let targetColumnId = column_id;
    
    if (!targetColumnId) {
      // Buscar la primera columna del usuario
      const columnResult = await client.query(
        `SELECT id FROM leads WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1`, 
        [userId]
      );
      
      if (!columnResult.rows.length) {
        // Crear primera columna si no existe
        const createColumnResult = await client.query(
          `INSERT INTO leads (user_id, title, color, created_at) 
           VALUES ($1, $2, $3, NOW()) RETURNING id`,
          [userId, "Nuevos Contactos", "blue"]
        );
        targetColumnId = createColumnResult.rows[0].id;
        console.log(`Created new column for user ${userId}: ${targetColumnId}`);
      } else {
        targetColumnId = columnResult.rows[0].id;
      }
    } else {
      // Verificar que la columna pertenece al usuario
      const verifyColumn = await client.query(
        `SELECT id FROM leads WHERE id = $1 AND user_id = $2`,
        [column_id, userId]
      );
      
      if (!verifyColumn.rows.length) {
        return res.status(400).json({
          success: false,
          message: "La columna especificada no existe o no pertenece al usuario"
        });
      }
    }

    await client.query("BEGIN");

    const results = {
      success: [],
      errors: [],
      stats: {
        total: contacts.length,
        processed: 0,
        conversations_created: 0,
        conversations_updated: 0,
        leads_created: 0,
        leads_skipped: 0
      }
    };

    for (const contact of contacts) {
      try {
        if (!contact.phone) {
          results.errors.push({
            contact,
            error: "Teléfono vacío"
          });
          continue;
        }

        const jid = normalizeToJid(contact.phone, defaultCountry);
        const contactName = contact.name || jid.split("@")[0];

        // 2) Upsert en conversations_new
        const conversationResult = await client.query(
          `INSERT INTO conversations_new (
             user_id, external_id, contact_name, started_at, 
             ai_active, tenant, updated_at
           )
           VALUES ($1, $2, $3, NOW(), false, 'whatsapp', NOW())
           ON CONFLICT (user_id, external_id)
           DO UPDATE SET 
             contact_name = EXCLUDED.contact_name,
             updated_at = NOW()
           RETURNING (xmax = 0) AS was_inserted`,
          [userId, jid, contactName]
        );

        const wasInserted = conversationResult.rows[0]?.was_inserted;
        if (wasInserted) {
          results.stats.conversations_created++;
        } else {
          results.stats.conversations_updated++;
        }

        // 3) Verificar si ya existe un lead para esta conversación
        const existingLead = await client.query(
          `SELECT id FROM leads_contacts 
           WHERE user_id = $1 AND conversation_id = $2 LIMIT 1`,
          [userId, jid]
        );

        if (!existingLead.rows.length) {
          // Crear nuevo lead
          await client.query(
            `INSERT INTO leads_contacts (
               user_id, name, message, avatar_url, 
               column_id, conversation_id, created_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [
              userId, 
              contactName, 
              "Contacto importado desde archivo", 
              null, 
              targetColumnId, 
              jid
            ]
          );
          
          results.stats.leads_created++;
        } else {
          results.stats.leads_skipped++;
        }

        results.success.push({
          name: contactName,
          phone: contact.phone,
          conversationId: jid,
          action: wasInserted ? "created" : "updated"
        });

        results.stats.processed++;

      } catch (error) {
        console.error("Error processing contact:", contact, error);
        results.errors.push({
          contact,
          error: error.message
        });
      }
    }

    await client.query("COMMIT");

    console.log(`Import completed for user ${userId}:`, results.stats);

    return res.json({ 
      success: true, 
      results,
      column_id: targetColumnId
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("leads import_contacts error:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Error importando contactos" 
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/leads/columns_with_leads
 * Obtiene todas las columnas con sus leads anidados
 * Útil para mostrar el kanban completo en una sola llamada
 */
router.get("/columns_with_leads", validateJwt, async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const result = await pool.query(
      `SELECT 
         l.id, l.title, l.color, l.created_at,
         COALESCE(
           JSON_AGG(
             JSON_BUILD_OBJECT(
               'id', lc.id,
               'name', lc.name,
               'message', lc.message,
               'avatar_url', lc.avatar_url,
               'conversation_id', lc.conversation_id,
               'created_at', lc.created_at
             ) ORDER BY lc.created_at DESC
           ) FILTER (WHERE lc.id IS NOT NULL), 
           '[]'
         ) AS leads
       FROM leads l
       LEFT JOIN leads_contacts lc ON lc.column_id = l.id AND lc.user_id = l.user_id
       WHERE l.user_id = $1
       GROUP BY l.id, l.title, l.color, l.created_at
       ORDER BY l.created_at ASC`,
      [userId]
    );

    res.json({ 
      success: true, 
      columns: result.rows 
    });

  } catch (error) {
    console.error("Error getting columns with leads:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

export default router;
