import pool from '../config/db.js';  // Asegúrate de usar el pool de tu base de datos para hacer las consultas
import { validationResult } from 'express-validator';

// Función para manejar la creación de una nueva integración
export const createIntegration = async (req, res) => {
  const { userId, aplicacion } = req.body;

  // Validar los datos recibidos en la solicitud
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  console.log('Datos recibidos:', { userId, aplicacion });

  // Verificar que los campos userId y aplicacion estén presentes
  if (!userId || !aplicacion) {
    return res.status(400).json({
      message: 'El campo userId y aplicacion son requeridos',
    });
  }

  // Comprobar que userId sea un UUID válido
  const isValidUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(userId);
  if (!isValidUUID) {
    return res.status(400).json({
      message: 'userId debe ser un UUID válido',
    });
  }

  try {
    // Verificar si ya existe una integración instalada para el mismo usuario y aplicación
    const existingIntegration = await pool.query(
      `SELECT * FROM Integraciones WHERE user_id = $1 AND aplicacion = $2 AND instalado = true LIMIT 1`,
      [userId, aplicacion]
    );

    if (existingIntegration.rows.length > 0) {
      return res.status(400).json({
        message: `La integración con la aplicación ${aplicacion} ya está instalada para este usuario.`,
      });
    }

    // Insertar los datos en la tabla Integraciones
    const result = await pool.query(
      `INSERT INTO Integraciones (user_id, aplicacion, instalado) 
      VALUES ($1, $2, true) 
      RETURNING *`,
      [userId, aplicacion]
    );

    const newIntegration = result.rows[0];

    // Responder con la integración creada
    return res.status(201).json({
      message: 'Integración creada exitosamente',
      integration: newIntegration,
    });
  } catch (error) {
    console.error('Error al crear integración:', error);
    return res.status(500).json({ message: 'Error al crear la integración' });
  }
};

// Función para eliminar una integración existente
export const deleteIntegration = async (req, res) => {
  const { userId, aplicacion } = req.body;

  // Verificar que los campos userId y aplicacion estén presentes
  if (!userId || !aplicacion) {
    return res.status(400).json({
      message: 'El campo userId y aplicacion son requeridos',
    });
  }

  // Comprobar que userId sea un UUID válido
  const isValidUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(userId);
  if (!isValidUUID) {
    return res.status(400).json({
      message: 'userId debe ser un UUID válido',
    });
  }

  try {
    // Verificar si existe una integración instalada para el mismo usuario y aplicación
    const existingIntegration = await pool.query(
      `SELECT * FROM Integraciones WHERE user_id = $1 AND aplicacion = $2 AND instalado = true LIMIT 1`,
      [userId, aplicacion]
    );

    if (existingIntegration.rows.length === 0) {
      return res.status(404).json({
        message: `No se encontró una integración instalada con la aplicación ${aplicacion} para este usuario.`,
      });
    }

    // Eliminar la integración de la base de datos
    await pool.query(
      `DELETE FROM Integraciones WHERE user_id = $1 AND aplicacion = $2 AND instalado = true`,
      [userId, aplicacion]
    );

    // Responder con un mensaje de éxito
    return res.status(200).json({
      message: `La integración con la aplicación ${aplicacion} ha sido eliminada exitosamente.`,
    });
  } catch (error) {
    console.error('Error al eliminar la integración:', error);
    return res.status(500).json({ message: 'Error al eliminar la integración' });
  }
};


// Nueva función para obtener todas las aplicaciones instaladas del usuario
export const getInstalledIntegrations = async (req, res) => {
  const { userId } = req.body;

  // Verificar que el campo userId esté presente
  if (!userId) {
    return res.status(400).json({
      message: 'El campo userId es requerido',
    });
  }

  try {
    // Obtener todas las aplicaciones instaladas para el mismo usuario
    const installedApps = await pool.query(
      `SELECT aplicacion FROM Integraciones WHERE user_id = $1 AND instalado = true`,
      [userId]
    );

    // Si no se encuentran aplicaciones instaladas, responder con un mensaje
    if (installedApps.rows.length === 0) {
      return res.status(200).json({
        message: 'El usuario no tiene aplicaciones instaladas.',
        installedApps: [],
      });
    }

    // Responder con las aplicaciones instaladas
    return res.status(200).json({
      message: 'Aplicaciones instaladas obtenidas correctamente',
      installedApps: installedApps.rows.map(row => row.aplicacion), // Solo devolver el nombre de la aplicación
    });
  } catch (error) {
    console.error('Error al obtener las aplicaciones instaladas:', error);
    return res.status(500).json({ message: 'Error al obtener las aplicaciones instaladas' });
  }
};
