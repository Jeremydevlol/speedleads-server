// userSettingsService.js
import { supabaseAdmin } from '../config/db.js';

/**
 * Obtiene la configuración de un usuario (IA global y personalidad por defecto).
 * @param {string} userId - ID del usuario
 * @returns {Object} Configuración del usuario
 */
export async function getUserSettings(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_settings')
      .select('global_personality_id, ai_global_active, updated_at')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No se encontró configuración, retornar valores por defecto
        // ✅ Por defecto la IA global está ACTIVADA
        return {
          ai_global_active: true, // por defecto
          global_personality_id: null,
          updated_at: null
        };
      }
      console.error('Error getUserSettings:', error);
      throw error;
    }

    return { ...data, ai_global_active: data.ai_global_active ?? true };
  } catch (error) {
    console.error('Error getUserSettings:', error);
    throw error;
  }
}

/**
 * Activa la IA global para un usuario, con una personalidad opcional.
 * @param {string} userId - ID del usuario
 * @param {string|null} personalityId - ID de personalidad (o null si no se requiere)
 */
export async function activateGlobalAI(userId, personalityId = null) {
  try {
    const { error } = await supabaseAdmin
      .from('user_settings')
      .upsert({
        user_id: userId,
        global_personality_id: personalityId != null ? String(personalityId) : null,
        ai_global_active: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      console.error('Error activateGlobalAI:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error activateGlobalAI:', error);
    throw error;
  }
}

/**
 * Desactiva la IA global para un usuario.
 * @param {string} userId - ID del usuario
 */
export async function deactivateGlobalAI(userId) {
  try {
    const { error } = await supabaseAdmin
      .from('user_settings')
      .upsert({
        user_id: userId,
        ai_global_active: false,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      console.error('Error deactivateGlobalAI:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error deactivateGlobalAI:', error);
    throw error;
  }
}

/**
 * Cambia la personalidad predeterminada (default_personality_id) de un usuario,
 * sin tocar ai_global_active. La columna real es global_personality_id.
 * @param {string} userId - ID del usuario
 * @param {string|null} personalityId - ID de personalidad (o null si quieres limpiar)
 */
export async function setDefaultPersonality(userId, personalityId) {
  try {
    const { error } = await supabaseAdmin
      .from('user_settings')
      .upsert({
        user_id: userId,
        global_personality_id: personalityId != null ? String(personalityId) : null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      console.error('Error setDefaultPersonality:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error setDefaultPersonality:', error);
    throw error;
  }
}
