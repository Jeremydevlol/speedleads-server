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
        try {
            const v = jwt.verify(tok, process.env.JWT_SECRET || 'fallback-secret');
            const uid = v?.userId || v?.sub || v?.id;
            if (uid)
                return String(uid);
        }
        catch { }
    }
    for (const tok of [bearer, sbAccess, xSupabase]) {
        try {
            const d = jwt.decode(tok);
            const uid = d?.userId || d?.sub || d?.id;
            if (uid)
                return String(uid);
        }
        catch { }
    }
    if (xUserId)
        return xUserId;
    return null;
}
async function resolveColumnId(userId, col) {
    const target = String(col);
    // Si es formato "col1", "col2", etc., convertir a índice
    if (/^col\d+$/i.test(target)) {
        const idx = Number(target.replace(/col/i, '')) - 1;
        const { rows } = await pool.query(`SELECT id FROM public.leads WHERE user_id = $1 ORDER BY id ASC`, [userId]);
        if (rows[idx]) {
            return String(rows[idx].id);
        }
        console.warn(`⚠️ Columna ${target} no encontrada (índice ${idx})`);
        return null;
    }
    // Si es un número, verificar que existe en BD
    if (/^\d+$/.test(target)) {
        const { rows } = await pool.query(`SELECT id FROM public.leads WHERE user_id = $1 AND id = $2`, [userId, target]);
        if (rows.length > 0) {
            return String(rows[0].id);
        }
        console.warn(`⚠️ Columna con ID ${target} no encontrada para usuario ${userId}`);
        return null;
    }
    // Si ya es un string válido, devolverlo directamente
    return target;
}
export async function POST(req) {
    console.log('🚀 Next.js API: Moviendo lead...');
    const userId = getUserId(req);
    if (!userId) {
        console.log('❌ No autenticado');
        return NextResponse.json({ success: false, message: 'No autenticado' }, { status: 401 });
    }
    try {
        const body = await req.json();
        const { leadId, targetColumnId } = body;
        if (!leadId || !targetColumnId) {
            console.log('❌ Datos incompletos:', { leadId, targetColumnId });
            return NextResponse.json({
                success: false,
                message: 'leadId y targetColumnId requeridos'
            }, { status: 400 });
        }
        console.log('📝 Moviendo lead:', { leadId, targetColumnId });
        // Resolver el ID de la columna de destino
        const dbColId = await resolveColumnId(userId, targetColumnId);
        if (!dbColId) {
            console.log('❌ Columna destino inválida:', targetColumnId);
            return NextResponse.json({
                success: false,
                message: 'Columna destino no válida'
            }, { status: 400 });
        }
        console.log(`🎯 Columna destino resuelta: ${targetColumnId} → ${dbColId}`);
        // Actualizar la columna del lead (solo si pertenece al usuario)
        const result = await pool.query(`UPDATE public.leads_contacts
         SET column_id = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING id, name, column_id, conversation_id, updated_at`, [dbColId, leadId, userId]);
        if (!result.rows.length) {
            console.log('❌ Lead no encontrado o sin permisos:', { leadId, userId });
            return NextResponse.json({
                success: false,
                message: 'Lead no encontrado o sin permiso'
            }, { status: 404 });
        }
        const updatedLead = result.rows[0];
        console.log('✅ Lead movido exitosamente:', updatedLead.id, '→ columna:', updatedLead.column_id);
        return NextResponse.json({
            success: true,
            lead: {
                id: updatedLead.id,
                name: updatedLead.name,
                column_id: updatedLead.column_id,
                conversation_id: updatedLead.conversation_id,
                updated_at: updatedLead.updated_at
            }
        });
    }
    catch (error) {
        console.error('❌ Error moviendo lead:', error);
        return NextResponse.json({
            success: false,
            message: error.message || 'Error interno'
        }, { status: 500 });
    }
}
