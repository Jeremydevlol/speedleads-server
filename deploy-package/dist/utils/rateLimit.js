/**
 * Rate limiting utility para evitar spam y posibles baneos
 * Separado del controlador para evitar imports circulares
 */

// Rate limiting para envíos masivos
const userSendLimits = new Map(); // userId -> { count, resetTime }
const RATE_LIMIT_MESSAGES = 30; // mensajes por minuto
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minuto en ms

/**
 * Verifica si el usuario puede enviar un mensaje (rate limiting)
 * @param {string} userId - ID del usuario
 * @throws {Error} Si se excede el límite
 * @returns {boolean} true si puede enviar
 */
export function checkRateLimit(userId) {
  const now = Date.now();
  const userLimit = userSendLimits.get(userId);
  
  if (!userLimit || now > userLimit.resetTime) {
    // Crear o resetear límite
    userSendLimits.set(userId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW
    });
    console.log(`📊 Rate limit iniciado para usuario ${userId}: 1/${RATE_LIMIT_MESSAGES}`);
    return true;
  }
  
  if (userLimit.count >= RATE_LIMIT_MESSAGES) {
    const remainingTime = Math.ceil((userLimit.resetTime - now) / 1000);
    console.warn(`🚦 Rate limit excedido para usuario ${userId}: ${userLimit.count}/${RATE_LIMIT_MESSAGES}`);
    throw new Error(`Rate limit excedido. Intenta de nuevo en ${remainingTime} segundos.`);
  }
  
  userLimit.count++;
  console.log(`📊 Rate limit actualizado para usuario ${userId}: ${userLimit.count}/${RATE_LIMIT_MESSAGES}`);
  return true;
}

/**
 * Obtiene el estado actual del rate limit para un usuario
 * @param {string} userId - ID del usuario
 * @returns {object} Estado del rate limit
 */
export function getRateLimitStatus(userId) {
  const now = Date.now();
  const userLimit = userSendLimits.get(userId);
  
  if (!userLimit || now > userLimit.resetTime) {
    return {
      count: 0,
      limit: RATE_LIMIT_MESSAGES,
      remaining: RATE_LIMIT_MESSAGES,
      resetTime: null,
      canSend: true
    };
  }
  
  return {
    count: userLimit.count,
    limit: RATE_LIMIT_MESSAGES,
    remaining: RATE_LIMIT_MESSAGES - userLimit.count,
    resetTime: userLimit.resetTime,
    canSend: userLimit.count < RATE_LIMIT_MESSAGES
  };
}

/**
 * Resetea el rate limit para un usuario (uso administrativo)
 * @param {string} userId - ID del usuario
 */
export function resetRateLimit(userId) {
  userSendLimits.delete(userId);
  console.log(`🔄 Rate limit reseteado para usuario ${userId}`);
}

/**
 * Limpia rate limits expirados (mantenimiento)
 */
export function cleanExpiredRateLimits() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [userId, limit] of userSendLimits.entries()) {
    if (now > limit.resetTime) {
      userSendLimits.delete(userId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Limpiados ${cleaned} rate limits expirados`);
  }
}

// Limpieza automática cada 5 minutos
setInterval(cleanExpiredRateLimits, 5 * 60 * 1000);
