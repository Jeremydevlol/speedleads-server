// src/jobs/renewWatch.js
import cron from 'node-cron';
import { supabaseAdmin } from '../db/supabase.js';
import { cleanupExpiredWatches, getExpiringWatches, renewWatch } from '../services/gcalWatch.js';

/**
 * Job de renovación automática de watch channels
 */
export function startWatchRenewalJob() {
  // Ejecutar cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    console.log('🔄 Starting watch renewal job...');
    
    try {
      // Buscar watches que expiran en menos de 60 minutos
      const expiringWatches = await getExpiringWatches(60);

      console.log(`📅 Found ${expiringWatches?.length || 0} expiring watches`);

      for (const watch of expiringWatches || []) {
        try {
          await renewWatch(
            watch.user_id, 
            watch.calendar_id, 
            watch.channel_id, 
            watch.resource_id
          );
          
          console.log(`✅ Renewed watch for user ${watch.user_id}, calendar ${watch.calendar_id}`);
        } catch (error) {
          console.error(`❌ Failed to renew watch for user ${watch.user_id}:`, error);
          
          // Marcar error
          await supabaseAdmin
            .from('google_watch_channels')
            .update({ 
              last_error: error.message,
              updated_at: new Date().toISOString()
            })
            .eq('id', watch.id);
        }
      }
    } catch (error) {
      console.error('❌ Watch renewal job failed:', error);
    }
  });

  console.log('✅ Watch renewal job scheduler started (every 5 minutes)');
}

/**
 * Job de limpieza de watches expirados
 */
export function startWatchCleanupJob() {
  // Ejecutar cada hora
  cron.schedule('0 * * * *', async () => {
    console.log('🧹 Starting watch cleanup job...');
    
    try {
      await cleanupExpiredWatches();
      console.log('✅ Watch cleanup job completed');
    } catch (error) {
      console.error('❌ Watch cleanup job failed:', error);
    }
  });

  console.log('✅ Watch cleanup job scheduler started (every hour)');
}

/**
 * Job de monitoreo de salud de watches
 */
export function startWatchHealthMonitor() {
  // Ejecutar cada 30 minutos
  cron.schedule('*/30 * * * *', async () => {
    console.log('🏥 Starting watch health monitor...');
    
    try {
      // Obtener estadísticas de watches
      const { data: stats } = await supabaseAdmin
        .from('google_watch_channels')
        .select('status')
        .then(result => {
          if (result.error) throw result.error;
          
          const statusCounts = result.data.reduce((acc, watch) => {
            acc[watch.status] = (acc[watch.status] || 0) + 1;
            return acc;
          }, {});
          
          return { data: statusCounts };
        });

      console.log('📊 Watch status summary:', stats);

      // Obtener watches con errores recientes
      const { data: errorWatches } = await supabaseAdmin
        .from('google_watch_channels')
        .select('user_id, calendar_id, last_error, updated_at')
        .not('last_error', 'is', null)
        .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // últimas 24 horas

      if (errorWatches && errorWatches.length > 0) {
        console.warn(`⚠️ Found ${errorWatches.length} watches with recent errors:`);
        errorWatches.forEach(watch => {
          console.warn(`   - User: ${watch.user_id}, Calendar: ${watch.calendar_id}, Error: ${watch.last_error}`);
        });
      }

      console.log('✅ Watch health monitor completed');
    } catch (error) {
      console.error('❌ Watch health monitor failed:', error);
    }
  });

  console.log('✅ Watch health monitor started (every 30 minutes)');
}

/**
 * Inicializar todos los jobs relacionados con watches
 */
export function initializeWatchJobs() {
  console.log('🚀 Initializing Google Calendar watch jobs...');
  
  // Solo inicializar si los webhooks están habilitados
  if (process.env.ENABLE_GCAL_WEBHOOKS === 'true') {
    startWatchRenewalJob();
    startWatchCleanupJob();
    startWatchHealthMonitor();
    
    console.log('✅ All Google Calendar watch jobs initialized');
  } else {
    console.log('⚠️ Google Calendar webhooks disabled, skipping watch jobs');
  }
}

/**
 * Job de sincronización periódica de respaldo
 * (En caso de que los webhooks fallen)
 */
export function startBackupSyncJob() {
  // Ejecutar cada 2 horas
  cron.schedule('0 */2 * * *', async () => {
    console.log('🔄 Starting backup sync job...');
    
    try {
      // Obtener usuarios con cuentas de Google activas
      const { data: activeAccounts } = await supabaseAdmin
        .from('google_accounts')
        .select('user_id')
        .gte('expiry_date', new Date().toISOString());

      if (!activeAccounts || activeAccounts.length === 0) {
        console.log('📭 No active Google accounts found for backup sync');
        return;
      }

      console.log(`🔄 Running backup sync for ${activeAccounts.length} users...`);

      // Importar dinámicamente para evitar dependencias circulares
      const { incrementalSync } = await import('../services/googleCalendar.service.js');

      let successCount = 0;
      let errorCount = 0;

      for (const account of activeAccounts) {
        try {
          await incrementalSync(account.user_id, 'primary');
          successCount++;
        } catch (error) {
          console.error(`❌ Backup sync failed for user ${account.user_id}:`, error);
          errorCount++;
        }
      }

      console.log(`✅ Backup sync completed: ${successCount} successful, ${errorCount} failed`);
    } catch (error) {
      console.error('❌ Backup sync job failed:', error);
    }
  });

  console.log('✅ Backup sync job started (every 2 hours)');
}

// Exportar función principal para inicializar en app.js
export default initializeWatchJobs;

