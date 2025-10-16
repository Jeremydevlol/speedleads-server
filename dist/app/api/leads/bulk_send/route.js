import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import pool from "../../../../config/db";
export const runtime = "nodejs";
function getUserId(req) {
    const auth = req.headers.get("authorization") || "";
    const bearer = auth.replace(/^Bearer\s+/i, "").trim();
    const sbAccess = cookies().get("sb-access-token")?.value || "";
    const xUserId = (req.headers.get("x-user-id") || "").trim();
    const xSupabase = (req.headers.get("x-supabase-auth") || "").trim();
    for (const tok of [bearer]) {
        if (!tok || tok.length < 20)
            continue;
        try {
            const v = jwt.verify(tok, process.env.JWT_SECRET || "fallback-secret");
            const uid = v?.userId || v?.sub || v?.id;
            if (uid)
                return String(uid);
        }
        catch { }
    }
    for (const tok of [bearer, sbAccess, xSupabase]) {
        if (!tok || tok.length < 20)
            continue;
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
export async function POST(req) {
    const userId = getUserId(req);
    if (!userId)
        return NextResponse.json({ success: false, message: "No autenticado" }, { status: 401 });
    try {
        const { columnId, mode, text, promptTemplate, personalityId } = await req.json();
        // 0) Vincular JIDs para leads de esta columna sin conversation_id (si tienen phone)
        const headers = {
            Authorization: req.headers.get("authorization") || "",
            "x-user-id": userId,
            "Content-Type": "application/json",
        };
        const origin = req.nextUrl.origin;
        // Vincula los leads de ESTA columna (ligero filtro lado BD)
        await fetch(`${origin}/api/whatsapp/ensure_conversations_for_leads`, {
            method: "POST",
            headers,
        });
        // 1) Traer leads preparados (con JID) de esa columna
        const { rows: leads } = await pool.query(`select name, conversation_id
         from public.leads_contacts
        where user_id=$1 and column_id=$2 and conversation_id is not null`, [userId, columnId]);
        if (!leads.length) {
            return NextResponse.json({ success: false, message: "No hay leads con WhatsApp en esta columna" }, { status: 400 });
        }
        // 2) Enviar uno a uno
        let sent = 0, fail = 0;
        const detail = [];
        for (const l of leads) {
            try {
                let messageToSend = (text || "").trim();
                if (mode === "ai") {
                    // Por ahora: plantilla simple con variable {{name}}
                    messageToSend = (promptTemplate || "Hola {{name}}").replace(/{{\s*name\s*}}/gi, l.name || "");
                }
                else {
                    messageToSend = (text || "Hola {{name}}").replace(/{{\s*name\s*}}/gi, l.name || "");
                }
                const res = await fetch(`${origin}/api/whatsapp/send_message`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        conversationId: l.conversation_id,
                        textContent: messageToSend,
                        attachments: [],
                        senderType: mode === "ai" ? "ia" : "you",
                        personalityId: personalityId || undefined,
                    }),
                });
                if (res.ok) {
                    sent++;
                    detail.push({ to: l.conversation_id, ok: true });
                }
                else {
                    fail++;
                    const e = await res.text().catch(() => "");
                    detail.push({ to: l.conversation_id, ok: false, error: e || `HTTP ${res.status}` });
                }
                await new Promise(r => setTimeout(r, 250)); // throttle
            }
            catch (e) {
                fail++;
                detail.push({ to: l.conversation_id, ok: false, error: e?.message || "Error de envío" });
            }
        }
        return NextResponse.json({ success: true, sent, fail, detail });
    }
    catch (e) {
        console.error("bulk_send error:", e);
        return NextResponse.json({ success: false, message: e.message || "Error" }, { status: 500 });
    }
}
