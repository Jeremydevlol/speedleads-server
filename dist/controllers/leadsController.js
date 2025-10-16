import pool from "../config/db.js";
import { getUserIdFromToken } from "./authController.js"; // Para obtener el ID del usuario desde el token

// Crear una nueva columna
export async function createColumn(req, res) {
  try {
    const userId = getUserIdFromToken(req);  // Obtener ID de usuario
    if (!userId) {
      return res.status(401).json({ message: "No autenticado" });
    }
    const { title, color } = req.body;

    const result = await pool.query(
      `INSERT INTO leads (user_id, title, color) 
       VALUES ($1, $2, $3) RETURNING *`,
      [userId, title, color]
    );

    res.status(201).json({ success: true, column: result.rows[0] });
  } catch (error) {
    console.error("Error al crear la columna:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

// Obtener todas las columnas
export async function getColumns(req, res) {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const result = await pool.query('SELECT * FROM leads WHERE user_id = $1', [userId]);
    res.json({ success: true, columns: result.rows });
  } catch (error) {
    console.error("Error al obtener las columnas:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}
// Editar una columna
export async function updateColumn(req, res) {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const { columnId } = req.params;
    const { title } = req.body;

    // Actualizar el título de la columna en la base de datos
    const result = await pool.query(
      `UPDATE leads SET title = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
      [title, columnId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Columna no encontrada" });
    }

    res.json({ success: true, column: result.rows[0] });
  } catch (error) {
    console.error("Error al editar la columna:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}
// Eliminar una columna
export async function deleteColumn(req, res) {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const { columnId } = req.params;

    // Eliminar la columna de la base de datos
    const result = await pool.query('DELETE FROM leads WHERE id = $1 AND user_id = $2 RETURNING *', [columnId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Columna no encontrada" });
    }

    res.json({ success: true, column: result.rows[0] });
  } catch (error) {
    console.error("Error al eliminar la columna:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

// Crear un nuevo lead
export async function createLead(req, res) {
  try {
    const userId = getUserIdFromToken(req); // Obtener ID de usuario
    if (!userId) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const { name, message, avatar_url, column_id, conversation_id } = req.body;
    
    const result = await pool.query(
      `INSERT INTO leads_contacts (user_id, name, message, avatar_url, column_id, conversation_id) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, name, message, avatar_url, column_id, conversation_id]
    );

    res.status(201).json({ success: true, lead: result.rows[0] });
  } catch (error) {
    console.error("Error al crear el lead:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

// Mover un lead entre columnas
export async function moveLead(req, res) {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: "No autenticado" });
    }

    // Acepta body (más simple desde front)
    const { leadId, targetColumnId } = req.body;
    if (!leadId || !targetColumnId) {
      return res.status(400).json({ success: false, message: "leadId y targetColumnId requeridos" });
    }

    const { rows } = await pool.query(
      `UPDATE public.leads_contacts
         SET column_id = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING id, column_id`,
      [targetColumnId, leadId, userId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Lead no encontrado o no pertenece al usuario" });
    }

    return res.json({ success: true, lead: rows[0] });
  } catch (error) {
    console.error("moveLead error:", error);
    return res.status(500).json({ success: false, message: "Error interno" });
  }
}

// Eliminar un lead
export async function deleteLead(req, res) {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const { leadId } = req.params;

    const result = await pool.query('DELETE FROM leads_contacts WHERE id = $1 AND user_id = $2 RETURNING *', [leadId, userId]);
    res.json({ success: true, lead: result.rows[0] });
  } catch (error) {
    console.error("Error al eliminar el lead:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}
// Editar un lead
export async function updateLead(req, res) {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const { leadId } = req.params;
    const { name, message, avatar_url, column_id, conversation_id } = req.body;

    const result = await pool.query(
      `UPDATE leads_contacts SET name = $1, message = $2, avatar_url = $3, column_id = $4, conversation_id = $5 
      WHERE id = $6 AND user_id = $7 RETURNING *`,
      [name, message, avatar_url, column_id, conversation_id, leadId, userId]
    );

    res.json({ success: true, lead: result.rows[0] });
  } catch (error) {
    console.error("Error al actualizar el lead:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

// Obtener configuración de auto-creación de leads
export async function getAutoCreateConfig(req, res) {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ message: "No autenticado" });
    }

    // Por ahora, la auto-creación está siempre activada
    // En el futuro se puede almacenar en una tabla de configuración
    res.json({ 
      success: true, 
      autoCreate: true,
      description: "Los leads se crean automáticamente cuando llegan mensajes nuevos de WhatsApp"
    });
  } catch (error) {
    console.error("Error al obtener configuración:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

// Actualizar configuración de auto-creación de leads
export async function updateAutoCreateConfig(req, res) {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const { autoCreate } = req.body;

    // Por ahora, simplemente confirmar la configuración
    // En el futuro se puede almacenar en una tabla de configuración
    res.json({ 
      success: true, 
      autoCreate: autoCreate !== false, // Por defecto true
      message: autoCreate !== false ? 
        "Auto-creación de leads activada" : 
        "Auto-creación de leads desactivada"
    });
  } catch (error) {
    console.error("Error al actualizar configuración:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

// Sincronizar columnas con la BD
export async function syncColumns(req, res) {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const { columns } = req.body;
    if (!Array.isArray(columns) || columns.length === 0) {
      return res.status(400).json({ success: false, message: 'columns requerido' });
    }

    // Traer columnas existentes del usuario
    const existing = await pool.query(
      `select id, title, color from public.leads where user_id=$1 order by id asc`,
      [userId]
    );

    const result = [];

    for (const c of columns) {
      const title = (c.title || '').trim();
      const color = c.color || 'blue';
      
      // Buscar por título (si lo cambiaste, generará nueva fila)
      const found = existing.rows.find(r => (r.title || '').toLowerCase() === title.toLowerCase());
      
      if (found) {
        result.push({ title, color: found.color || 'blue', id: String(found.id) });
      } else {
        const ins = await pool.query(
          `insert into public.leads (user_id, title, color, created_at, updated_at)
           values ($1,$2,$3, now(), now()) returning id`,
          [userId, title, color]
        );
        result.push({ title, color, id: String(ins.rows[0].id) });
      }
    }

    res.json({ success: true, columns: result });
  } catch (error) {
    console.error('sync_columns error:', error);
    res.status(500).json({ success: false, message: error.message || 'Error' });
  }
}

// Sincronizar contactos de WhatsApp como leads
export async function syncWhatsAppLeads(req, res) {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ message: "No autenticado" });
    }

    // 1) Todas las conversaciones con external_id (JID), excluye grupos
    const { rows: convs } = await pool.query(
      `select external_id, contact_name, contact_photo_url
         from public.conversations_new
        where user_id = $1
          and external_id is not null
          and external_id not like '%@g.us'`,
      [userId]
    );

    // Obtener o crear primera columna
    const r = await pool.query(
      `select id from public.leads where user_id=$1 order by id asc limit 1`,
      [userId]
    );
    let columnId;
    if (r.rows.length) {
      columnId = r.rows[0].id;
    } else {
      const ins = await pool.query(
        `insert into public.leads (user_id, title, color, created_at, updated_at)
         values ($1,'Initial Prospect','blue', now(), now()) returning id`,
        [userId]
      );
      columnId = ins.rows[0].id;
    }

    let created = 0, skipped = 0;

    for (const c of convs) {
      const jid = c.external_id;
      const name = (c.contact_name || '').toString().trim() || jid.split('@')[0];

      // evita duplicado por (user_id, conversation_id)
      const exist = await pool.query(
        `select 1 from public.leads_contacts where user_id=$1 and conversation_id=$2 limit 1`,
        [userId, jid]
      );
      if (exist.rows.length) { skipped++; continue; }

      await pool.query(
        `insert into public.leads_contacts
          (user_id, name, message, avatar_url, column_id, conversation_id, phone, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7, now(), now())`,
        [
          userId,
          name,
          'Contacto de WhatsApp',
          c.contact_photo_url || null,
          columnId,
          jid,
          null // aquí phone no lo conocemos (ya tenemos el JID)
        ]
      );
      created++;
    }

    res.json({ success: true, created, skipped });
  } catch (error) {
    console.error('sync_whatsapp_leads error:', error);
    res.status(500).json({ success: false, message: error.message || 'Error' });
  }
}

// Envío masivo de mensajes a leads
export async function bulkSendMessages(req, res) {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const { columnId, mode, text, promptTemplate, personalityId } = req.body;

    // 1) Traer leads de esa columna con conversation_id (JID)
    const { rows: leads } = await pool.query(
      `select name, conversation_id
         from public.leads_contacts
        where user_id=$1 and column_id=$2 and conversation_id is not null`,
      [userId, columnId]
    );

    if (!leads.length) {
      return res.status(400).json({ success: false, message: "No hay leads con WhatsApp en esta columna" });
    }

    // 2) Importar el controlador de WhatsApp para envío interno
    const { sendMessage } = await import('./whatsappController.js');

    // 3) Enviar uno por uno con throttling suave
    let sent = 0, fail = 0;
    for (const l of leads) {
      try {
        let messageToSend = text || "";
        if (mode === "ai") {
          // Por ahora, usa la plantilla como mensaje:
          messageToSend = (promptTemplate || "Hola {{name}}").replace(/{{\s*name\s*}}/gi, l.name || "");
        } else {
          messageToSend = (text || "Hola {{name}}").replace(/{{\s*name\s*}}/gi, l.name || "");
        }

        // Usar el controlador interno directamente
        await sendMessage(userId, l.conversation_id, messageToSend, [], mode === "ai" ? "ia" : "you");
        sent++;
        
        // Throttling suave
        await new Promise(r => setTimeout(r, 250));
      } catch (error) {
        console.error(`Error enviando a ${l.name}:`, error.message);
        fail++;
      }
    }

    res.json({ success: true, sent, fail });
  } catch (error) {
    console.error('bulk_send error:', error);
    res.status(500).json({ success: false, message: error.message || 'Error' });
  }
}



