// src/app-google-calendar-integration.js
// Este archivo contiene las modificaciones necesarias para integrar Google Calendar en app.js

import { cleanupGoogleCalendar, initializeGoogleCalendar } from './integrations/googleCalendarIntegration.js';

/**
 * Función para integrar Google Calendar en la aplicación principal
 * Esta función debe ser llamada en app.js después de configurar Express
 */
export async function setupGoogleCalendarIntegration(app) {
  try {
    console.log('🗓️ Configurando integración de Google Calendar...');
    
    // Inicializar Google Calendar
    const success = await initializeGoogleCalendar(app);
    
    if (success) {
      console.log('✅ Google Calendar integrado exitosamente');
      
      // Configurar shutdown graceful
      process.on('SIGTERM', async () => {
        console.log('📤 SIGTERM recibido, limpiando Google Calendar...');
        await cleanupGoogleCalendar();
      });
      
      process.on('SIGINT', async () => {
        console.log('📤 SIGINT recibido, limpiando Google Calendar...');
        await cleanupGoogleCalendar();
      });
      
    } else {
      console.log('⚠️ Google Calendar no se pudo inicializar');
    }
    
    return success;
    
  } catch (error) {
    console.error('❌ Error configurando Google Calendar:', error);
    return false;
  }
}

/**
 * Middleware adicional para Google Calendar (opcional)
 */
export function addGoogleCalendarMiddleware(app) {
  // Middleware para agregar headers de CORS específicos para webhooks de Google
  app.use('/webhooks/google/calendar', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'https://calendar.google.com');
    res.header('Access-Control-Allow-Headers', 'X-Goog-Channel-Id, X-Goog-Resource-Id, X-Goog-Resource-State, X-Goog-Channel-Token');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    
    next();
  });
}

/**
 * Endpoint de salud específico para Google Calendar
 */
export function addGoogleCalendarHealthCheck(app) {
  app.get('/api/health/google-calendar', async (req, res) => {
    try {
      const { getGoogleCalendarStats } = await import('./integrations/googleCalendarIntegration.js');
      const stats = await getGoogleCalendarStats();
      
      res.json({
        status: 'OK',
        service: 'google-calendar',
        timestamp: new Date().toISOString(),
        stats
      });
    } catch (error) {
      res.status(500).json({
        status: 'ERROR',
        service: 'google-calendar',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
}

// Instrucciones para integrar en app.js:
/*
AGREGAR AL FINAL DEL ARCHIVO app.js, ANTES DE app.listen():

// =============================================
// GOOGLE CALENDAR INTEGRATION
// =============================================
import { setupGoogleCalendarIntegration, addGoogleCalendarMiddleware, addGoogleCalendarHealthCheck } from './src/app-google-calendar-integration.js';

// Configurar middleware adicional
addGoogleCalendarMiddleware(app);

// Agregar endpoint de salud
addGoogleCalendarHealthCheck(app);

// Inicializar Google Calendar
await setupGoogleCalendarIntegration(app);

*/

export default {
  setupGoogleCalendarIntegration,
  addGoogleCalendarMiddleware,
  addGoogleCalendarHealthCheck
};

