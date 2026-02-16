import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import pool from '../../../../config/db';
export const runtime = 'nodejs';
function getUserId(req) {
    const auth = req.headers.get('authorization') || '';
    const bearer = auth.replace(/^Bearer\s+/i, '').trim();
    const sbAccess = cookies().get('sb-access-token')?.value || '';
    const xUserId = (req.headers.get('x-user-id') || '').trim();
    const xSupabase = (req.headers.get('x-supabase-auth') || '').trim();
    for (const tok of [bearer]) {
        if (!tok || tok.length < 20)
            continue;
        try {
            const verified = jwt.verify(tok, process.env.JWT_SECRET || 'fallback-secret');
            const uid = verified?.userId || verified?.sub || verified?.id;
            if (uid)
                return String(uid);
        }
        catch { }
    }
    for (const tok of [bearer, sbAccess, xSupabase]) {
        if (!tok || tok.length < 20)
            continue;
        try {
            const decoded = jwt.decode(tok);
            const uid = decoded?.userId || decoded?.sub || decoded?.id;
            if (uid)
                return String(uid);
        }
        catch { }
    }
    if (xUserId)
        return xUserId;
    return null;
}
async function getFirstColumnId(userId) {
    const r = await pool.query(`select id from public.leads where user_id=$1 order by id asc limit 1`, [userId]);
    if (r.rows.length)
        return r.rows[0].id;
    const ins = await pool.query(`insert into public.leads (user_id, title, color, created_at, updated_at)
     values ($1,'Initial Prospect','blue', now(), now()) returning id`, [userId]);
    return ins.rows[0].id;
}
export async function POST(req) {
    const userId = getUserId(req);
    if (!userId)
        return NextResponse.json({ success: false, message: 'No autenticado' }, { status: 401 });
    try {
        const { contacts } = await req.json(); // [{ name, phone }]
        if (!Array.isArray(contacts) || contacts.length === 0) {
            return NextResponse.json({ success: false, message: 'contacts requerido' }, { status: 400 });
        }
        const columnId = await getFirstColumnId(userId);
        let created = 0, skipped = 0;
        for (const c of contacts) {
            const name = (c.name || '').trim();
            const phone = (c.phone || '').trim();
            if (!phone) {
                skipped++;
                continue;
            }
            // Evita duplicados de LEAD por (user_id, phone)
            const exist = await pool.query(`select 1 from public.leads_contacts where user_id=$1 and phone=$2 limit 1`, [userId, phone]);
            if (exist.rows.length) {
                skipped++;
                continue;
            }
            await pool.query(`insert into public.leads_contacts
          (user_id, name, message, avatar_url, column_id, conversation_id, phone, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7, now(), now())`, [userId, name || phone, 'Nuevo contacto importado', null, columnId, null, phone]);
            created++;
        }
        return NextResponse.json({ success: true, created, skipped, columnId });
    }
    catch (e) {
        console.error('leads/import_contacts error:', e);
        return NextResponse.json({ success: false, message: e.message || 'Error' }, { status: 500 });
    }
}
