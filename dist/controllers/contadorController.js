

import pool from "../config/db.js";

// Método para obtener el total de usuarios
export async function getTotalUsers(req, res) {
  try {
    // Realizar la consulta SQL directamente
    const result = await pool.query('SELECT COUNT(*) AS total_users FROM auth.users');

    // Extraer el número total de usuarios
    const totalUsers = result.rows[0].total_users;

    res.json({ totalUsers });
  } catch (error) {
    console.error('Error al obtener el total de usuarios:', error);
    res.status(500).json({ message: 'Error al obtener el total de usuarios', error: error.message });
  }
}

// Método para obtener los usuarios registrados hoy
export async function getUsersRegisteredToday(req, res) {
  try {
    // Obtener la fecha de hoy
    const today = new Date().toISOString().split('T')[0]; // Solo la fecha en formato YYYY-MM-DD

    // Realizar la consulta SQL para obtener los usuarios registrados hoy
    const result = await pool.query(`
      SELECT COUNT(*) AS new_users_today 
      FROM auth.users 
      WHERE created_at::DATE = $1
    `, [today]);

    // Extraer el número de usuarios registrados hoy
    const newUsersToday = result.rows[0].new_users_today;

    res.json({ newUsersToday });
  } catch (error) {
    console.error('Error al obtener los usuarios registrados hoy:', error);
    res.status(500).json({ message: 'Error al obtener los usuarios registrados hoy', error: error.message });
  }
}

export default {
    getUsersRegisteredToday,
    getTotalUsers,
}