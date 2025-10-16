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

  for (const tok of [bearer]) {
    if (!tok || tok.length < 20) continue
    try {
      const verified: any = jwt.verify(tok, process.env.JWT_SECRET || 'fallback-secret')
      const uid = verified?.userId || verified?.sub || verified?.id
      if (uid) return String(uid)
    } catch {}
  }
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

function normalizeToJid(raw: string, defaultCountry='34') {
  let n = (raw || '').replace(/[^\d+]/g,'')
  if (!n) throw new Error('phone vacío')
  if (n.startsWith('00')) n = n.slice(2)
  if (n.startsWith('+')) n = n.slice(1)
  if (!n.startsWith(defaultCountry) && n.length <= 9) n = defaultCountry + n
  if (n.length < 7) throw new Error('phone corto')
  return `${n}@s.whatsapp.net`
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ success:false, message:'No autenticado' }, { status:401 })

  try {
    const { rows } = await pool.query(
      `select id, name, phone
         from public.leads_contacts
        where user_id=$1 and conversation_id is null and phone is not null`,
      [userId]
    )

    let created = 0, updated = 0, fail = 0

    for (const r of rows) {
      try {
        const jid = normalizeToJid(r.phone)
        const contactName = r.name || r.phone

        // Upsert conversación
        const upd = await pool.query(
          `update public.conversations_new
              set contact_name=$3, updated_at=now(), tenant='whatsapp'
            where user_id=$1 and external_id=$2`,
          [userId, jid, contactName]
        )
        if (upd.rowCount === 0) {
          await pool.query(
            `insert into public.conversations_new
              (user_id, external_id, contact_name, contact_photo_url, started_at, ai_active, tenant, updated_at, wa_user_id)
             values ($1,$2,$3,null, now(), false, 'whatsapp', now(), null)`,
            [userId, jid, contactName]
          )
          created++
        }

        // Actualiza el lead con su JID
        await pool.query(
          `update public.leads_contacts
              set conversation_id=$1, updated_at=now()
            where id=$2 and user_id=$3`,
          [jid, r.id, userId]
        )
        updated++
      } catch (e) {
        console.error('ensure conv item error:', e)
        fail++
      }
    }

    return NextResponse.json({ success:true, created, updated, fail })
  } catch (e:any) {
    console.error('ensure_conversations_for_leads error:', e)
    return NextResponse.json({ success:false, message:e.message || 'Error' }, { status:500 })
  }
}