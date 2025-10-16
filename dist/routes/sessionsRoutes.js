// routes/sessionsRoutes.js
import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import { validateJwt } from '../config/jwt.js'
import { getUserIdFromToken } from '../controllers/authController.js'

const router = Router()

// Verificamos que las vars de entorno llegan bien
console.log('Supabase URL:', process.env.SUPABASE_URL)
console.log('Service Role Key present?', !!process.env.SUPABASE_SERVICE_ROLE_KEY)

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// LISTAR sesiones activas
router.get('/', validateJwt, async (req, res) => {
  try {
    const userId = getUserIdFromToken(req)
    console.log('[GET /api/sessions] userId =', userId)

    const { data: sessions, error } = await supabaseAdmin
      .from('user_sessions')   // Vista pública
      .select('*')
      .eq('user_id', userId)

    if (error)
      return res.status(500).json({ success: false, error: error.message })

    return res.json({ success: true, sessions })
  } catch (err) {
    console.error('[GET /api/sessions] unexpected error', err)
    return res.status(500).json({ success: false, error: err.message })
  }
})

// REVOCAR sesión o cerrar todas
router.delete('/:sessionId?', validateJwt, async (req, res) => {
  try {
    const userId = getUserIdFromToken(req)
    const { sessionId } = req.params

    if (sessionId) {
      console.log(`[DELETE /api/sessions] revoking one → userId=${userId}, sessionId=${sessionId}`)
      const { error } = await supabaseAdmin.rpc('delete_user_session', {
        _user_id:    userId,
        _session_id: sessionId
      })
      if (error) throw error
    } else {
      console.log(`[DELETE /api/sessions] revoking all → userId=${userId}`)
      const { error } = await supabaseAdmin.rpc('delete_all_user_sessions', {
        _user_id: userId
      })
      if (error) throw error
    }

    return res.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/sessions] unexpected error', err)
    return res.status(500).json({ success: false, error: err.message })
  }
})

export default router