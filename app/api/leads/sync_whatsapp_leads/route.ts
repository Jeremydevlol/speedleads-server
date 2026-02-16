import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import pool from '../../../../config/db'

export const runtime = 'nodejs'

function getUserId(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || ''
  const bearer = auth.replace(/^Bearer\s+/i, '').trim()
  const sbAccess = cookies().get('sb-access-token')?.value || ''
  const xUserId = (req.headers.get('x-user-id') || '').trim()
  const xSupabase = (req.headers.get('x-supabase-auth') || '').trim()

  // Verifica con tu JWT (si aplica)
  for (const tok of [bearer]) {
    if (!tok || tok.length < 20) continue
    try {
      const verified: any = jwt.verify(tok, process.env.JWT_SECRET || 'fallback-secret')
      const uid = verified?.userId || verified?.sub || verified?.id
      if (uid) return String(uid)
    } catch {}
  }
  // Decode sin verificar (Supabase u otros)
  for (const tok of [bearer, sbAccess, xSupabase]) {
    if (!tok || tok.length < 20) continue
    try {
      const decoded: any = jwt.decode(tok)
      const uid = decoded?.userId || decoded?.sub || decoded?.id
      if (uid) return String(uid)
    } catch {}
  }
  if (xUserId) return xUserId
  return null
}

async function getFirstColumnId(userId: string) {
  const r = await pool.query(
    `select id from public.leads where user_id=$1 order by id asc limit 1`,
    [userId]
  )
  if (r.rows.length) return r.rows[0].id
  const ins = await pool.query(
    `insert into public.leads (user_id, title, color, created_at, updated_at)
     values ($1,'Initial Prospect','blue', now(), now()) returning id`,
    [userId]
  )
  return ins.rows[0].id
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ success:false, message:'No autenticado' }, { status:401 })

  try {
    // 1) Todas las conversaciones con external_id (JID), excluye grupos
    const { rows: convs } = await pool.query(
      `select external_id, contact_name, contact_photo_url
         from public.conversations_new
        where user_id = $1
          and external_id is not null
          and external_id not like '%@g.us'`,
      [userId]
    )

    const columnId = await getFirstColumnId(userId)
    let created = 0, skipped = 0

    for (const c of convs) {
      const jid = c.external_id as string
      const name = (c.contact_name || '').toString().trim() || jid.split('@')[0]

      // evita duplicado por (user_id, conversation_id)
      const exist = await pool.query(
        `select 1 from public.leads_contacts where user_id=$1 and conversation_id=$2 limit 1`,
        [userId, jid]
      )
      if (exist.rows.length) { skipped++; continue }

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
      )
      created++
    }

    return NextResponse.json({ success:true, created, skipped })
  } catch (e:any) {
    console.error('sync_whatsapp_leads error:', e)
    return NextResponse.json({ success:false, message:e.message || 'Error' }, { status:500 })
  }
}
