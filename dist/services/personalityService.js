// services/getSaludo.ts
import pool from '../config/db.js';
export const getSaludoFromDB = async (personalityId, userId) => {
    const query = `
    SELECT saludo 
    FROM personalities 
    WHERE id = $1 AND users_id = $2
    LIMIT 1
  `;
    const { rows } = await pool.query(query, [personalityId, userId]);
    if (rows.length === 0) {
        throw new Error("Personalidad no encontrada");
    }
    return rows[0].saludo || "¡Hola! ¿En qué puedo ayudarte?";
};
//# sourceMappingURL=personalityService.js.map