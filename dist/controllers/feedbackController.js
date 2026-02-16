import sgMail from '@sendgrid/mail'; // Usamos import en lugar de require
import { validationResult } from 'express-validator';
import path from 'path';
import fs from 'fs';
import multer from 'multer'; // Para manejar los archivos

sgMail.setApiKey(process.env.SENDGRID_API_KEY || ''); // Configurar SENDGRID_API_KEY en .env

// Configuración de almacenamiento para archivos
export const storage = multer.memoryStorage(); 

const upload = multer({ storage: storage });

export const sendFeedback = async (req, res) => {
  const { title, description } = req.body;
  const files = req.files; // Archivos adjuntos enviados

  // Validar que los campos de texto estén presentes
  if (!title || !description) {
    return res.status(400).json({ message: 'El título y la descripción son requeridos.' });
  }

  try {
    // Crear el contenido del correo con los archivos adjuntos
    let attachments = [];
    if (files && files.length > 0) {
      // Si hay archivos, los agregamos a los adjuntos, pero sin guardarlos en el disco
      attachments = files.map((file) => ({
        filename: file.originalname,  // Nombre original del archivo
        content: file.buffer.toString('base64'), // Convertir el archivo a base64
        type: file.mimetype,  // Tipo MIME del archivo
        disposition: 'attachment', // Indicamos que es un archivo adjunto
      }));
    }

    const msg = {
      to: 'support@uniclick.io',   // Email de destino
      from: 'support@uniclick.io', // Remitente
      subject: `Feedback: ${title}`,  // Asunto del correo
      text: description,              // Descripción en texto
      html: `<p>${description}</p>`,   // Descripción en HTML
      attachments: attachments,       // Archivos adjuntos
    };

    // Enviar el correo
    await sgMail.send(msg);

    

    res.status(200).json({ message: 'Feedback enviado con éxito.' });
  } catch (error) {
    console.error('Error al enviar el correo:', error);
    res.status(500).json({ message: 'Hubo un problema al enviar el correo.' });
  }
};

// Exportar la función de carga de archivos y el controlador
export { upload };
