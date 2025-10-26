import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';
import pool from '../../../../lib/db';
export const runtime = 'nodejs';
function getUserId(req) {
    const auth = req.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token)
        return null;
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
        return payload.userId || payload.sub || payload.id || null;
    }
    catch {
        return null;
    }
}
async function resolveColumnId(userId, col) {
    const target = String(col);
    // Si es formato "col1", "col2", etc., convertir a índice
    if (/^col\d+$/i.test(target)) {
        const idx = Number(target.replace(/col/i, '')) - 1;
        const { rows } = await pool.query(`SELECT id FROM public.leads WHERE user_id = $1 ORDER BY id ASC`, [userId]);
        return rows[idx]?.id ?? null;
    }
    // Si ya es un UUID, devolverlo directamente
    return target;
}
export async function POST(req) {
    console.log('🚀 Next.js API: Creando nuevo lead...');
    const userId = getUserId(req);
    if (!userId) {
        console.log('❌ No autenticado');
        return NextResponse.json({ success: false, message: 'No autenticado' }, { status: 401 });
    }
    try {
        const body = await req.json();
        const { name, message, avatar_url, column_id, conversation_id } = body;
        console.log('📝 Datos del lead:', { name, message, column_id, conversation_id });
        // Resolver el ID de la columna (puede ser "col1", "col2" o un UUID directo)
        const dbColId = await resolveColumnId(userId, column_id);
        if (!dbColId) {
            console.log('❌ Columna inválida:', column_id);
            return NextResponse.json({ success: false, message: 'Columna inválida' }, { status: 400 });
        }
        console.log(`🎯 Columna resuelta: ${column_id} → ${dbColId}`);
        // Insertar el nuevo lead
        const result = await pool.query(`INSERT INTO public.leads_contacts
        (user_id, name, message, avatar_url, column_id, conversation_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING id, name, message, avatar_url, column_id, conversation_id, created_at`, [
            userId,
            name || '',
            message || '',
            avatar_url || null,
            dbColId,
            conversation_id || null
        ]);
        const newLead = result.rows[0];
        console.log('✅ Lead creado exitosamente:', newLead.id);
        return NextResponse.json({
            success: true,
            lead: {
                id: newLead.id,
                name: newLead.name,
                message: newLead.message,
                avatar_url: newLead.avatar_url,
                column_id: newLead.column_id,
                conversation_id: newLead.conversation_id,
                created_at: newLead.created_at
            }
        });
    }
    catch (error) {
        console.error('❌ Error creando lead:', error);
        return NextResponse.json({
            success: false,
            message: error.message || 'Error interno'
        }, { status: 500 });
    }
}
