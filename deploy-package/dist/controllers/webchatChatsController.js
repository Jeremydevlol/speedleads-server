import pool from '../config/db.js';  // Asegúrate de que la ruta a tu archivo db.js sea correcta

// -----------------------------------------------------------------------------
// Obtener todas las sesiones de Webchat
// GET /api/WebchatChats/all
// -----------------------------------------------------------------------------
export const getAllWebchatSessions = async (req, res) => {
  try {
    // Obtener el user_id desde los headers
    const userId = req.headers['user_id'];

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'user_id header is required',
      });
    }

    // Realizar la consulta para obtener las sesiones de Webchat del user_id dado
    const query = `
      SELECT * FROM webchat_sessions
      WHERE user_id = $1
      GROUP BY session_id
    `;

    const { rows } = await pool.query(query, [userId]);

    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching webchat_sessions:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener las sesiones de Webchat',
    });
  }
};

// -----------------------------------------------------------------------------
// Obtener los mensajes de una sesión específica de Webchat
// GET /api/WebchatChats?session_id=<ID>
// -----------------------------------------------------------------------------
export const getWebchatMessagesBySession = async (req, res) => {
  try {
    const { session_id } = req.query;
    console.log(session_id+"BUENAAAAAS")

    // Verificación básica
    if (!session_id) {
      return res.status(400).json({
        success: false,
        message: 'Falta el parámetro session_id en la query',
      });
    }

    // Consulta a la base de datos para esa sesión en concreto
    // Ajusta la tabla y columnas a tu estructura real
    const query = `
      SELECT *
      FROM webchat_sessions
      WHERE session_id = $1
      ORDER BY created_at ASC
    `;
    const { rows } = await pool.query(query, [session_id]);

    // Devolver los mensajes obtenidos
    return res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error('Error fetching webchat messages by session:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener los mensajes de la sesión de Webchat',
    });
  }
};
