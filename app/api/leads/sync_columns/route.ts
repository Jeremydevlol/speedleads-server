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
    try { 
      const v: any = jwt.verify(tok, process.env.JWT_SECRET || 'fallback-secret')
      const uid = v?.userId || v?.sub || v?.id
      if (uid) return String(uid)
    } catch {}
  }
  for (const tok of [bearer, sbAccess, xSupabase]) {
    try { 
      const d: any = jwt.decode(tok)
      const uid = d?.userId || d?.sub || d?.id
      if (uid) return String(uid) 
    } catch {}
  }
  if (xUserId) return xUserId
  return null
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ success: false, message: 'No autenticado' }, { status: 401 })
  
  try {
    const { columns } = await req.json() as { columns: Array<{ title: string, color?: string }> }
    if (!Array.isArray(columns) || columns.length === 0) {
      return NextResponse.json({ success: false, message: 'columns requerido' }, { status: 400 })
    }

    // Traer columnas existentes del usuario
    const existing = await pool.query(
      `select id, title, color from public.leads where user_id=$1 order by id asc`,
      [userId]
    )

    const result: Array<{ title: string, color: string, id: string }> = []

    for (const c of columns) {
      const title = (c.title || '').trim()
      const color = c.color || 'blue'
      
      // Buscar por título (si lo cambiaste, generará nueva fila)
      const found = existing.rows.find(r => (r.title || '').toLowerCase() === title.toLowerCase())
      
      if (found) {
        result.push({ title, color: found.color || 'blue', id: String(found.id) })
      } else {
        const ins = await pool.query(
          `insert into public.leads (user_id, title, color, created_at, updated_at)
           values ($1,$2,$3, now(), now()) returning id`,
          [userId, title, color]
        )
        result.push({ title, color, id: String(ins.rows[0].id) })
      }
    }

    return NextResponse.json({ success: true, columns: result })
  } catch (e: any) {
    console.error('sync_columns error:', e)
    return NextResponse.json({ success: false, message: e.message || 'Error' }, { status: 500 })
  }
}
