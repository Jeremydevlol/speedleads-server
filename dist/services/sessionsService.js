// pages/api/sessions.js
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs'

// Cliente “admin” con service_role_key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  // Cliente que lee la cookie automáticamente
  const supabase = createServerSupabaseClient({ req, res })
  const {
    data: { user },
    error: userErr
  } = await supabase.auth.getUser()

  if (userErr || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method === 'GET') {
    // Listar sesiones
    const { data: sessions, error } = await supabaseAdmin
      .from('auth.sessions')
      .select('*')
      .eq('user_id', user.id)

    if (error) {
      return res.status(500).json({ error })
    }
    return res.status(200).json({ sessions })
  }

  if (req.method === 'DELETE') {
    const { sessionId } = req.query
    let query = supabaseAdmin.from('auth.sessions').delete()

    if (sessionId) {
      // Revocar una sesión concreta
      query = query.eq('id', sessionId)
    } else {
      // Revocar todas las sesiones del usuario
      query = query.eq('user_id', user.id)
    }

    const { error } = await query
    if (error) {
      return res.status(500).json({ error })
    }
    return res.status(200).json({ success: true })
  }

  res.setHeader('Allow', ['GET', 'DELETE'])
  res.status(405).end()
}