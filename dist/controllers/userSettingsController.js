import pool from '../config/db.js'
import { getUserIdFromToken } from './authController.js'

/**
 * GET /api/user_settings
 * Devuelve la configuración de IA global y personalidad por defecto.
 * Crea la fila por defecto si no existe.
 */
export const getUserSettings = async (req, res) => {
  try {
    const userId = getUserIdFromToken(req)
    if (!userId) {
      return res.status(401).json({ message: 'Usuario no autenticado' })
    }

    // Crea la fila por defecto si no existe - ✅ IA ACTIVADA por defecto
    await pool.query(
      `INSERT INTO user_settings (user_id, ai_global_active, updated_at)
       VALUES ($1, TRUE, NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    )

    // Leer la fila
    const { rows } = await pool.query(`
      SELECT
        global_personality_id AS "defaultPersonalityId",
        ai_global_active      AS "aiGlobalActive"
      FROM user_settings
      WHERE user_id = $1
      LIMIT 1
    `, [userId])

    if (!rows.length) {
      // Si no hay fila por algún motivo, devolvemos algo por defecto - ✅ IA ACTIVADA
      return res.json({
        defaultPersonalityId: null,
        aiGlobalActive: true
      })
    }

    return res.json(rows[0])  // { defaultPersonalityId, aiGlobalActive }
  } catch (err) {
    console.error('❌ Error en getUserSettings:', err)
    return res.status(500).json({ message: 'Error leyendo settings', error: err.message })
  }
}

/**
 * PATCH /api/user_settings/global_ai
 * Body: { active: boolean }
 * Activa o desactiva la IA global.
 */
export const setGlobalAI = async (req, res) => {
  try {
    const userId = getUserIdFromToken(req)
    if (!userId) {
      return res.status(401).json({ message: 'Usuario no autenticado' })
    }

    const { active } = req.body
    if (typeof active !== 'boolean') {
      return res.status(400).json({ message: 'Falta el campo active (boolean)' })
    }

    await pool.query(`
      UPDATE user_settings
         SET ai_global_active = $1,
             updated_at       = NOW()
       WHERE user_id = $2
    `, [active, userId])

    return res.json({ success: true, aiGlobalActive: active })
  } catch (err) {
    console.error('❌ Error en setGlobalAI:', err)
    return res.status(500).json({ message: 'Error actualizando AI global', error: err.message })
  }
}

/**
 * PATCH /api/user_settings/default_personality
 * Body: { personalityId: number } (o null)
 * Asigna la personalidad por defecto.
 */
export const setDefaultPersonality = async (req, res) => {
  try {
    const userId = getUserIdFromToken(req)
    if (!userId) {
      return res.status(401).json({ message: 'Usuario no autenticado' })
    }

    const { personalityId } = req.body

    // Si permites poner null, quitas la personalidad
    // if (personalityId === null) {...}
    // Pero aquí asumo que siempre envían un número
    if (personalityId == null) {
      return res.status(400).json({ message: 'Falta el campo personalityId' })
    }

    await pool.query(`
      UPDATE user_settings
         SET global_personality_id = $1,
             updated_at           = NOW()
       WHERE user_id = $2
    `, [personalityId != null ? String(personalityId) : null, userId])

    return res.json({ success: true, defaultPersonalityId: personalityId })
  } catch (err) {
    console.error('❌ Error en setDefaultPersonality:', err)
    return res.status(500).json({
      message: 'Error actualizando personalidad por defecto',
      error: err.message
    })
  }
}

// Opcional: export default
export default {
  getUserSettings,
  setGlobalAI,
  setDefaultPersonality,
}
