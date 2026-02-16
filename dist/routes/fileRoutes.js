import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { __dirname } from '../app.js';

const router = Router();

/**
 * Servir archivos PDF con headers apropiados para iframe embedding
 * GET /uploads/pdfs/:filename
 */
router.get('/pdfs/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    
    // Validar nombre de archivo para prevenir path traversal
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Nombre de archivo inválido' });
    }

    // Construir ruta del archivo
    const uploadsDir = path.join(__dirname, '../uploads');
    const filePath = path.join(uploadsDir, filename);

    // Verificar que el archivo existe
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    // Obtener estadísticas del archivo
    const stats = fs.statSync(filePath);
    
    // Verificar que es un archivo (no directorio)
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Recurso no válido' });
    }

    // Detectar tipo MIME basado en extensión
    const ext = path.extname(filename).toLowerCase();
    let mimeType = 'application/octet-stream';
    
    switch (ext) {
      case '.pdf':
        mimeType = 'application/pdf';
        break;
      case '.jpg':
      case '.jpeg':
        mimeType = 'image/jpeg';
        break;
      case '.png':
        mimeType = 'image/png';
        break;
      case '.gif':
        mimeType = 'image/gif';
        break;
      case '.webp':
        mimeType = 'image/webp';
        break;
      case '.mp3':
        mimeType = 'audio/mpeg';
        break;
      case '.wav':
        mimeType = 'audio/wav';
        break;
      case '.ogg':
        mimeType = 'audio/ogg';
        break;
    }

    // Headers para permitir iframe embedding y caching
    res.set({
      'Content-Type': mimeType,
      'Content-Length': stats.size,
      'Content-Disposition': `inline; filename="${filename}"`,
      'X-Frame-Options': 'SAMEORIGIN', // Permitir iframe en el mismo origen
      'Cache-Control': 'public, max-age=86400', // Cache por 24 horas
      'ETag': `"${stats.mtime.getTime()}-${stats.size}"`,
      'Last-Modified': stats.mtime.toUTCString(),
      // CORS headers para desarrollo
      'Access-Control-Allow-Origin': process.env.NODE_ENV === 'production' 
        ? 'https://uniclick.io' 
        : '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });

    // Manejar conditional requests (304 Not Modified)
    const ifModifiedSince = req.headers['if-modified-since'];
    const ifNoneMatch = req.headers['if-none-match'];
    
    if (ifModifiedSince && new Date(ifModifiedSince) >= stats.mtime) {
      return res.status(304).end();
    }
    
    if (ifNoneMatch && ifNoneMatch === `"${stats.mtime.getTime()}-${stats.size}"`) {
      return res.status(304).end();
    }

    // Crear stream para archivos grandes
    const stream = fs.createReadStream(filePath);
    
    // Manejar errores del stream
    stream.on('error', (error) => {
      console.error('Error leyendo archivo:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error leyendo archivo' });
      }
    });

    // Enviar archivo
    stream.pipe(res);
    
    console.log(`📄 Sirviendo archivo: ${filename} (${mimeType}, ${(stats.size / 1024).toFixed(2)} KB)`);
    
  } catch (error) {
    console.error('Error sirviendo archivo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * Servir archivos de cualquier tipo desde uploads
 * GET /uploads/:filename
 */
router.get('/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    
    // Validar nombre de archivo
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Nombre de archivo inválido' });
    }

    // Construir ruta del archivo
    const uploadsDir = path.join(__dirname, '../uploads');
    const filePath = path.join(uploadsDir, filename);

    // Verificar que el archivo existe
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    // Obtener estadísticas del archivo
    const stats = fs.statSync(filePath);
    
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Recurso no válido' });
    }

    // Detectar tipo MIME
    const ext = path.extname(filename).toLowerCase();
    let mimeType = 'application/octet-stream';
    
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.xml': 'application/xml'
    };

    mimeType = mimeTypes[ext] || mimeType;

    // Headers apropiados
    res.set({
      'Content-Type': mimeType,
      'Content-Length': stats.size,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'public, max-age=86400',
      'ETag': `"${stats.mtime.getTime()}-${stats.size}"`,
      'Last-Modified': stats.mtime.toUTCString(),
      'Access-Control-Allow-Origin': process.env.NODE_ENV === 'production' 
        ? 'https://uniclick.io' 
        : '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });

    // Conditional requests
    const ifModifiedSince = req.headers['if-modified-since'];
    const ifNoneMatch = req.headers['if-none-match'];
    
    if (ifModifiedSince && new Date(ifModifiedSince) >= stats.mtime) {
      return res.status(304).end();
    }
    
    if (ifNoneMatch && ifNoneMatch === `"${stats.mtime.getTime()}-${stats.size}"`) {
      return res.status(304).end();
    }

    // Enviar archivo
    const stream = fs.createReadStream(filePath);
    
    stream.on('error', (error) => {
      console.error('Error leyendo archivo:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error leyendo archivo' });
      }
    });

    stream.pipe(res);
    
    console.log(`📁 Sirviendo archivo: ${filename} (${mimeType}, ${(stats.size / 1024).toFixed(2)} KB)`);
    
  } catch (error) {
    console.error('Error sirviendo archivo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
