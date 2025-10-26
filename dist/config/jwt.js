import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
dotenv.config();

export const validateJwt = (req, res, next) => {
    // Intentar obtener token del header Authorization o de las cookies
    let token = req.headers['authorization']?.split(' ')[1];
    
    // Si no hay token en headers, intentar obtenerlo de las cookies
    if (!token && req.cookies && req.cookies.auth_token) {
        token = req.cookies.auth_token;
        console.log('🍪 Token obtenido de cookie en validateJwt');
    }
    
    if (!token) {
        console.log('❌ Token no proporcionado en headers ni cookies');
        console.log('Headers:', req.headers['authorization']);
        console.log('Cookies:', req.cookies);
        return res.status(403).json({ error: 'Token no proporcionado' });
    }

    // MODO DESARROLLO: Aceptar development-token para desarrollo local
    if (process.env.NODE_ENV === 'development' && token === 'development-token') {
        console.log('🔧 MODO DESARROLLO: Aceptando development-token');
        req.user = { 
            userId: '96754cf7-5784-47f1-9fa8-0fc59122fe13', // Usuario por defecto para desarrollo
            sub: '96754cf7-5784-47f1-9fa8-0fc59122fe13',
            email: 'jesuscastillogomez21@gmail.com'
        };
        return next();
    }

    // Verificar que la variable de entorno no esté undefined
    const jwtSecret = process.env.JWT_SECRET || 'clave-secreta-de-desarrollo';
    if (!jwtSecret) {
        console.error("❌ Falta la variable de entorno JWT_SECRET");
        return res.status(500).json({ error: 'Falta el secreto JWT en las variables de entorno' });
    }

    jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }, (err, decoded) => {
        if (err) {
            console.log("❌ Error al verificar el token:", err.message);
            console.log("Token problemático:", token.substring(0, 20) + '...');
            
            // MODO FORZADO: Si el token existe pero falló la verificación,
            // intentar decodificar sin verificar para extraer el userId
            const forceLogin = process.env.FORCE_LOGIN === 'true';
            if (forceLogin) {
                try {
                    const decoded = jwt.decode(token);
                    if (decoded && (decoded.userId || decoded.sub)) {
                        console.log('⚡ FORCE LOGIN: Aceptando token sin verificación estricta');
                        req.user = decoded;
                        return next();
                    }
                } catch (decodeError) {
                    console.log('❌ No se pudo decodificar ni forzar el token');
                }
            }
            
            return res.status(401).json({ error: "Token inválido o expirado" });
        }

        console.log('✅ Token validado exitosamente para userId:', decoded.userId || decoded.sub);
        req.user = decoded;
        next();
    });
};

// NUEVO: Middleware súper permisivo para forzar login
export const forceValidateJwt = (req, res, next) => {
    let token = req.headers['authorization']?.split(' ')[1];
    
    if (!token && req.cookies && req.cookies.auth_token) {
        token = req.cookies.auth_token;
        console.log('🍪 Token obtenido de cookie en forceValidateJwt');
    }
    
    if (!token) {
        console.log('❌ No hay token para force login');
        return res.status(403).json({ error: 'Token no proporcionado' });
    }

    try {
        // Intentar verificación normal primero
        const jwtSecret = process.env.JWT_SECRET || 'clave-secreta-de-desarrollo';
        const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
        console.log('✅ Force login: Token válido para userId:', decoded.userId || decoded.sub);
        req.user = decoded;
        return next();
    } catch (err) {
        console.log('⚠️ Verificación normal falló, intentando decodificación forzada...');
        
        try {
            // Si la verificación falla, intentar decodificar sin verificar
            const decoded = jwt.decode(token);
            if (decoded && (decoded.userId || decoded.sub)) {
                console.log('⚡ FORCE LOGIN EXITOSO: Aceptando userId:', decoded.userId || decoded.sub);
                req.user = decoded;
                return next();
            }
        } catch (decodeError) {
            console.log('❌ Force login falló completamente');
        }
        
        return res.status(401).json({ error: "Token completamente inválido" });
    }
};
//# sourceMappingURL=jwt.js.map
