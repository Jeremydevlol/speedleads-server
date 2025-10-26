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
      .select('*')
      .eq('users_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No se encontró configuración, retornar valores por defecto
        return {
          ai_global_active: false,
          default_personality_id: null,
          updated_at: null
        };
      }
      console.error('Error getUserSettings:', error);
      throw error;
    }

    return data;
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
        users_id: userId,
        default_personality_id: personalityId,
        ai_global_active: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'users_id'
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
        users_id: userId,
        ai_global_active: false,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'users_id'
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
 * sin tocar ai_global_active.
 * @param {string} userId - ID del usuario
 * @param {string|null} personalityId - ID de personalidad (o null si quieres limpiar)
 */
export async function setDefaultPersonality(userId, personalityId) {
  try {
    const { error } = await supabaseAdmin
      .from('user_settings')
      .upsert({
        users_id: userId,
        default_personality_id: personalityId,
        ai_global_active: false,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'users_id'
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
