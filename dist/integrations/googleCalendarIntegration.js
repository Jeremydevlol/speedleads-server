// src/integrations/googleCalendarIntegration.js
import { showGoogleCalendarConfigSummary, validateGoogleCalendarConfig } from '../config/googleCalendarConfig.js';
import { initializeWatchJobs, startBackupSyncJob } from '../jobs/renewWatch.js';

/**
 * Inicializar la integración completa de Google Calendar
 */
export async function initializeGoogleCalendar(app) {
  console.log('🗓️ Inicializando integración de Google Calendar...');
  
  try {
    // 1. Validar configuración
    if (!validateGoogleCalendarConfig()) {
      console.log('❌ Google Calendar: Configuración inválida, saltando inicialización');
      return false;
    }
    
    // 2. Mostrar resumen de configuración
    showGoogleCalendarConfigSummary();
    
    // 3. Registrar rutas de Google Calendar
    await registerGoogleCalendarRoutes(app);
    
    // 4. Inicializar jobs de mantenimiento
    initializeWatchJobs();
    startBackupSyncJob();
    
    // 5. Configurar middleware de Socket.IO para eventos en tiempo real
    setupSocketIOEvents(app);
    
    console.log('✅ Google Calendar integrado exitosamente');
    return true;
    
  } catch (error) {
    console.error('❌ Error inicializando Google Calendar:', error);
    return false;
  }
}

/**
 * Registrar rutas de Google Calendar
 */
async function registerGoogleCalendarRoutes(app) {
  try {
    // Importar rutas dinámicamente
    const googleCalendarRoutes = await import('../routes/googleCalendar.routes.js');
    
    // Registrar rutas principales de Google Calendar
    app.use('/api/google', googleCalendarRoutes.default);
    
    // Las rutas de webhook ya están registradas en webhooks.js
    console.log('✅ Rutas de Google Calendar registradas');
    
  } catch (error) {
    console.error('❌ Error registrando rutas de Google Calendar:', error);
    throw error;
  }
}

/**
 * Configurar eventos de Socket.IO para Google Calendar
 */
function setupSocketIOEvents(app) {
  try {
    // Los eventos de Socket.IO se manejan en el webhook handler
    // Aquí podemos agregar listeners adicionales si es necesario
    
    console.log('✅ Eventos de Socket.IO configurados para Google Calendar');
    
  } catch (error) {
    console.error('❌ Error configurando Socket.IO para Google Calendar:', error);
    throw error;
  }
}

/**
 * Función de limpieza para shutdown graceful
 */
export async function cleanupGoogleCalendar() {
  console.log('🧹 Limpiando recursos de Google Calendar...');
  
  try {
    // Aquí podemos agregar limpieza de recursos si es necesario
    // Por ejemplo, detener jobs activos, cerrar conexiones, etc.
    
    console.log('✅ Limpieza de Google Calendar completada');
    
  } catch (error) {
    console.error('❌ Error en limpieza de Google Calendar:', error);
  }
}

/**
 * Función helper para verificar si Google Calendar está habilitado
 */
export function isGoogleCalendarEnabled() {
  return validateGoogleCalendarConfig();
}

/**
 * Función helper para obtener estadísticas de Google Calendar
 */
export async function getGoogleCalendarStats() {
  try {
    const { supabaseAdmin } = await import('../db/supabase.js');
    
    // Obtener estadísticas básicas
    const [accountsResult, eventsResult, watchesResult] = await Promise.all([
      supabaseAdmin.from('google_accounts').select('id', { count: 'exact' }),
      supabaseAdmin.from('google_events').select('id', { count: 'exact' }),
      supabaseAdmin.from('google_watch_channels').select('status', { count: 'exact' })
    ]);
    
    const watchStatusCounts = watchesResult.data?.reduce((acc, watch) => {
      acc[watch.status] = (acc[watch.status] || 0) + 1;
      return acc;
    }, {}) || {};
    
    return {
      accounts: accountsResult.count || 0,
      events: eventsResult.count || 0,
      watches: {
        total: watchesResult.count || 0,
        byStatus: watchStatusCounts
      },
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas de Google Calendar:', error);
    return null;
  }
}

export default {
  initializeGoogleCalendar,
  cleanupGoogleCalendar,
  isGoogleCalendarEnabled,
  getGoogleCalendarStats
};

