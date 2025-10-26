import pool from '../config/db.js'; // Importar el pool de conexiones
import { getUserIdFromToken } from './authController.js'; // Para obtener el ID del usuario autenticado

// -----------------------------------------------------------------------------
// Función para guardar la configuración de DealCar
// POST /api/dealcar/save_config
// ----------------------------------------------------------------------------- 
export const saveDealcarConfig = async (req, res) => {
  try {
    // Obtén el ID del usuario autenticado
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
    }
    // Inserta en la tabla Dealcar
    const { rows, error } = await pool.query(
      `INSERT INTO dealcar (user_id, numero_api, numero_apikey)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id)
       DO UPDATE
         SET numero_api    = EXCLUDED.numero_api,
             numero_apikey = EXCLUDED.numero_apikey
       RETURNING *`,
      [userId, req.body.apiNumber, req.body.apiKey]
    );

    if (error) {
      throw new Error(error.message);
    }

    // Devuelve el éxito con los datos insertados
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error al guardar la configuración de DealCar:', error);
    return res.status(500).json({ success: false, message: 'Error al guardar la configuración de DealCar' });
  }
  
};

export const getDealcarStock = async (req , res) =>{
  
  const status = "AVAILABLE";
  const size = 223;
  const page = 1;
  const baseUrl = "https://api.dealcar.io/stock";
  const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
    }
    // Inserta en la tabla Dealcar
    const { rows } = await pool.query(
       `SELECT numero_api, numero_apikey
     FROM dealcar
     WHERE user_id = $1`,
      [userId]
    );

    if (!rows.length) {
      throw new Error(rows.message);
    }
    const apiNumber=rows[0].numero_api;
    const apiKey=rows[0].numero_apikey;

  const url = `${baseUrl}?dealerId=${apiNumber}&status=${status}&size=${size}&page=${page}`;
    
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        "X-API-KEY": apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      mode: 'cors'
    });

    console.log(response)

    if (response.statusText !== 'OK') {
      const errorData = await response.text();
      return {
        success: false,
        error: errorData,
        status: response.status,
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: data,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: 500,
    };
  }

}
export async function getDealcarCredencial (userId){
  
  const status = "AVAILABLE";
  const size = 223;
  const page = 1;
  const baseUrl = "https://api.dealcar.io/stock";
  
    // Inserta en la tabla Dealcar
    const { rows } = await pool.query(
       `SELECT numero_api, numero_apikey
     FROM dealcar
     WHERE user_id = $1`,
      [userId]
    );

    if (!rows.length) {
      throw new Error(rows.message);
    }
    const apiNumber=rows[0].numero_api;
    const apiKey=rows[0].numero_apikey;

  const url = `${baseUrl}?dealerId=${apiNumber}&status=${status}&size=${size}&page=${page}`;
    
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        "X-API-KEY": apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      mode: 'cors'
    });

    console.log(response)

    if (response.statusText !== 'OK') {
      const errorData = await response.text();
      return {
        success: false,
        error: errorData,
        status: response.status,
      };
    }

    const data = await response.json();
    return {
      numero_api:apiNumber,
      numero_apikey:apiKey
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: 500,
    };
  }

}