import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'clave-secreta-de-desarrollo';
/**
 * Extrae el userId del token JWT presente en los headers de autorización
 * @param req - Objeto Request de Express
 * @returns userId extraído del token
 */
export function getUserIdFromToken(req) {
    try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.split(' ')[1];
        if (!token)
            throw new Error('No token provided');
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded.userId)
            throw new Error('userId no encontrado en el token');
        return decoded.userId;
    }
    catch (err) {
        throw new Error('Token inválido o expirado.');
    }
}
/**
 * Genera un token JWT con el userId
 * @param userId - ID del usuario
 * @returns token firmado
 */
export function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}
//# sourceMappingURL=jwtUtils.js.map