// config/jwt.js — Validación híbrida: Supabase Auth API + JWT local
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from './db.js';
dotenv.config();

let lastInvalidTokenLog = 0;
const INVALID_TOKEN_LOG_INTERVAL_MS = 30000;

// ─── Cache de tokens validados por Supabase Auth ────────────────────────────
const tokenCache = new Map();
const TOKEN_CACHE_TTL_MS = 60_000; // 1 minuto

function getCachedToken(token) {
    const entry = tokenCache.get(token);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
        tokenCache.delete(token);
        return null;
    }
    return entry.user;
}

function setCachedToken(token, user) {
    if (tokenCache.size > 500) {
        const now = Date.now();
        for (const [k, v] of tokenCache) {
            if (now > v.expires) tokenCache.delete(k);
        }
    }
    tokenCache.set(token, { user, expires: Date.now() + TOKEN_CACHE_TTL_MS });
}

async function validateWithSupabase(token) {
    try {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data?.user) return null;
        const user = data.user;
        return {
            userId: user.id,
            sub: user.id,
            email: user.email,
            role: user.role || 'authenticated',
            user_metadata: user.user_metadata || {},
            aud: user.aud || 'authenticated',
            iss: 'supabase',
        };
    } catch (err) {
        console.log('⚠️ Error validando token con Supabase Auth:', err.message);
        return null;
    }
}

export const validateJwt = async (req, res, next) => {
    // Bypass: rutas Meta (OAuth callbacks, diagnóstico) no exigen JWT
    const path = (req.originalUrl || req.path || '').split('?')[0];
    if (path.startsWith('/api/meta/diagnostic') || path.startsWith('/meta/diagnostic')) {
        return next();
    }
    if (path === '/auth/meta/callback') {
        return next();
    }
    // Bypass: Bright Data scrapers (sin sesión IG, sin login)
    if (path.startsWith('/api/instagram/brightdata') || path.startsWith('/api/brightdata')) {
        return next();
    }

    // Intentar obtener token del header Authorization o de las cookies
    let token = req.headers['authorization']?.split(' ')[1];

    // Si no hay token en headers, intentar obtenerlo de las cookies
    if (!token && req.cookies && req.cookies.auth_token) {
        token = req.cookies.auth_token;
    }

    if (!token) {
        // En desarrollo, permitir usar solo x-user-id
        const xUserId = (req.headers['x-user-id'] || '').trim();
        const isDev = process.env.NODE_ENV === 'development';
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (isDev && xUserId && uuidRegex.test(xUserId)) {
            req.user = { userId: xUserId, sub: xUserId };
            return next();
        }
        console.log('❌ Token no proporcionado en headers ni cookies');
        return res.status(403).json({ error: 'Token no proporcionado' });
    }

    // MODO DESARROLLO: Aceptar development-token para desarrollo local
    if (process.env.NODE_ENV === 'development' && token === 'development-token') {
        console.log('🔧 MODO DESARROLLO: Aceptando development-token');
        req.user = {
            userId: '96754cf7-5784-47f1-9fa8-0fc59122fe13',
            sub: '96754cf7-5784-47f1-9fa8-0fc59122fe13',
            email: 'jesuscastillogomez21@gmail.com'
        };
        return next();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ESTRATEGIA DE VALIDACIÓN (en orden de prioridad):
    //   1. Cache local (token ya validado recientemente)
    //   2. JWT verify local (si JWT_SECRET coincide con Supabase)
    //   3. Supabase Auth API (validación definitiva — siempre funciona)
    // ═══════════════════════════════════════════════════════════════════════

    // 1) ¿Token en cache?
    const cached = getCachedToken(token);
    if (cached) {
        req.user = cached;
        return next();
    }

    // 2) Intentar verificación local con JWT_SECRET
    const jwtSecret = process.env.JWT_SECRET;
    const hasValidSecret = jwtSecret
        && jwtSecret !== 'clave-secreta-de-desarrollo'
        && jwtSecret !== 'tu_jwt_secret_muy_seguro_aqui'
        && jwtSecret !== 'PEGA_AQUI_TU_JWT_SECRET_DE_SUPABASE';

    if (hasValidSecret) {
        try {
            const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
            const user = {
                userId: decoded.userId || decoded.sub,
                sub: decoded.sub || decoded.userId,
                email: decoded.email,
                role: decoded.role,
                ...decoded
            };
            console.log('✅ Token validado localmente (JWT) para userId:', user.userId);
            setCachedToken(token, user);
            req.user = user;
            return next();
        } catch (jwtErr) {
            // La verificación local falló — continuar a Supabase Auth API
            const now = Date.now();
            if (now - lastInvalidTokenLog > INVALID_TOKEN_LOG_INTERVAL_MS) {
                lastInvalidTokenLog = now;
                console.log('⚠️ JWT local falló, intentando validación con Supabase Auth API...');
            }
        }
    }

    // 3) Validar con Supabase Auth API (método definitivo)
    try {
        const supabaseUser = await validateWithSupabase(token);
        if (supabaseUser) {
            console.log('✅ Token validado con Supabase Auth para userId:', supabaseUser.userId);
            setCachedToken(token, supabaseUser);
            req.user = supabaseUser;
            return next();
        }
    } catch (supabaseErr) {
        console.log('❌ Error en validación Supabase Auth:', supabaseErr.message);
    }

    // 4) En desarrollo, fallback a x-user-id
    const xUserId = (req.headers['x-user-id'] || '').trim();
    const isDev = process.env.NODE_ENV === 'development';
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (isDev && xUserId && uuidRegex.test(xUserId)) {
        console.log('⚡ DEV: Aceptando x-user-id como fallback');
        req.user = { userId: xUserId, sub: xUserId };
        return next();
    }

    // Token inválido — rechazar
    console.log('❌ Token inválido: no pasó ninguna validación');
    return res.status(401).json({ error: 'Token inválido o expirado' });
};

// ─── Middleware permisivo (force validate) ──────────────────────────────────
export const forceValidateJwt = async (req, res, next) => {
    let token = req.headers['authorization']?.split(' ')[1];

    if (!token && req.cookies && req.cookies.auth_token) {
        token = req.cookies.auth_token;
    }

    if (!token) {
        console.log('❌ No hay token para force login');
        return res.status(403).json({ error: 'Token no proporcionado' });
    }

    // Primero intentar la validación normal
    const cached = getCachedToken(token);
    if (cached) {
        req.user = cached;
        return next();
    }

    // Intentar Supabase Auth API
    try {
        const supabaseUser = await validateWithSupabase(token);
        if (supabaseUser) {
            setCachedToken(token, supabaseUser);
            req.user = supabaseUser;
            return next();
        }
    } catch (err) {
        // continuar
    }

    // Intentar JWT local
    try {
        const jwtSecret = process.env.JWT_SECRET || 'clave-secreta-de-desarrollo';
        const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
        req.user = decoded;
        return next();
    } catch (err) {
        // Fallback: decodificar sin verificar (modo permisivo)
        try {
            const decoded = jwt.decode(token);
            if (decoded && (decoded.userId || decoded.sub)) {
                console.log('⚡ FORCE: Decodificación sin verificar, userId:', decoded.userId || decoded.sub);
                req.user = {
                    userId: decoded.userId || decoded.sub,
                    sub: decoded.sub || decoded.userId,
                    email: decoded.email,
                    ...decoded
                };
                return next();
            }
        } catch (decodeError) {
            console.log('❌ Force login falló completamente');
        }

        return res.status(401).json({ error: 'Token completamente inválido' });
    }
};
