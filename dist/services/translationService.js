import axios from 'axios';
import { readFileSync } from 'fs';
import { GoogleAuth } from 'google-auth-library';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Si usas service account como en googleService.js
const jsonPath = join(__dirname, "../credentials/arched-router.json");

let auth;
try {
  const key = JSON.parse(readFileSync(jsonPath, "utf-8"));
  auth = new GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/cloud-translation']
  });
} catch (error) {
  console.log('Service account not found, will use API key for translation');
}

/**
 * Detecta si un string contiene texto traducible (no solo números, URLs, emails, etc.)
 */
function isTranslatable(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  
  // No traducir si es solo números, precios, fechas
  if (/^\d+[\d\s\-\.,€$£¥₹]*$/.test(text.trim())) return false;
  
  // No traducir URLs
  if (/^https?:\/\//.test(text.trim())) return false;
  
  // No traducir emails
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim())) return false;
  
  // No traducir códigos (CSS, HTML classes, etc.)
  if (/^[\w\-\.#]+$/.test(text.trim()) && text.length < 30) return false;
  
  // Si contiene al menos una letra, es traducible
  return /[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(text);
}

/**
 * Extrae automáticamente todos los textos traducibles de cualquier estructura
 */
function extractTranslatableTexts(obj, path = '') {
  const textValues = [];
  const textKeys = [];
  
  function extract(item, currentPath) {
    if (typeof item === 'string' && isTranslatable(item)) {
      textValues.push(item);
      textKeys.push(currentPath);
    } else if (Array.isArray(item)) {
      item.forEach((subItem, index) => {
        extract(subItem, `${currentPath}[${index}]`);
      });
    } else if (typeof item === 'object' && item !== null) {
      for (const [key, value] of Object.entries(item)) {
        const newPath = currentPath ? `${currentPath}.${key}` : key;
        extract(value, newPath);
      }
    }
  }
  
  extract(obj, path);
  return { textValues, textKeys };
}

/**
 * Traduce un array de textos usando Google Translate API
 * @param {string[]} texts - Array de textos a traducir
 * @param {string} targetLanguage - Código de idioma destino (ej: 'en', 'zh', 'ar')
 * @param {string} sourceLanguage - Código de idioma origen (opcional, por defecto 'es')
 * @returns {Promise<Object>} - Objeto con los textos traducidos
 */
export async function translateTexts(texts, targetLanguage, sourceLanguage = 'es') {
  try {
    // Si el idioma destino es el mismo que el origen, no traducir
    if (targetLanguage === sourceLanguage) {
      return {
        success: true,
        translations: texts.map(text => ({ translatedText: text, originalText: text })),
        targetLanguage,
        sourceLanguage
      };
    }

    // Filtrar solo textos traducibles
    const translatableTexts = texts.filter(text => isTranslatable(text));
    
    if (translatableTexts.length === 0) {
      return {
        success: true,
        translations: texts.map(text => ({ translatedText: text, originalText: text })),
        targetLanguage,
        sourceLanguage,
        message: 'No translatable text found (only numbers, URLs, codes, etc.)'
      };
    }

    const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY;
    
    if (!GOOGLE_TRANSLATE_API_KEY) {
      throw new Error('GOOGLE_TRANSLATE_API_KEY no está configurada en las variables de entorno');
    }

    const url = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_TRANSLATE_API_KEY}`;
    
    const requestBody = {
      q: translatableTexts,
      target: targetLanguage,
      source: sourceLanguage,
      format: 'text'
    };

    const response = await axios.post(url, requestBody, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Mapear respuestas a todos los textos originales
    const translations = [];
    let translationIndex = 0;
    
    for (const originalText of texts) {
      if (isTranslatable(originalText)) {
        const translation = response.data.data.translations[translationIndex];
        translations.push({
          originalText,
          translatedText: translation.translatedText,
          detectedSourceLanguage: translation.detectedSourceLanguage || sourceLanguage,
          wasTranslated: true
        });
        translationIndex++;
      } else {
        translations.push({
          originalText,
          translatedText: originalText, // No cambiar
          detectedSourceLanguage: sourceLanguage,
          wasTranslated: false,
          reason: 'Not translatable (number, URL, code, etc.)'
        });
      }
    }

    return {
      success: true,
      translations,
      targetLanguage,
      sourceLanguage,
      totalTexts: texts.length,
      translatableTexts: translatableTexts.length,
      skippedTexts: texts.length - translatableTexts.length
    };

  } catch (error) {
    console.error('Error en translateTexts:', error.response?.data || error.message);
    
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message,
      targetLanguage,
      sourceLanguage,
      totalTexts: texts.length
    };
  }
}

/**
 * Traduce AUTOMÁTICAMENTE cualquier estructura de datos
 * Detecta y traduce solo el contenido traducible
 * @param {any} data - Cualquier estructura: string, array, objeto, anidado, etc.
 * @param {string} targetLanguage - Código de idioma destino
 * @param {string} sourceLanguage - Código de idioma origen (opcional)
 * @returns {Promise<Object>} - Estructura traducida
 */
export async function translateAny(data, targetLanguage, sourceLanguage = 'es') {
  try {
    // Caso simple: string directo
    if (typeof data === 'string') {
      const result = await translateTexts([data], targetLanguage, sourceLanguage);
      return {
        ...result,
        translatedData: result.success ? result.translations[0].translatedText : data
      };
    }
    
    // Caso simple: array de strings
    if (Array.isArray(data) && data.every(item => typeof item === 'string')) {
      const result = await translateTexts(data, targetLanguage, sourceLanguage);
      return {
        ...result,
        translatedData: result.success ? result.translations.map(t => t.translatedText) : data
      };
    }
    
    // Caso complejo: cualquier estructura
    return await translateObject(data, targetLanguage, sourceLanguage);
    
  } catch (error) {
    console.error('Error en translateAny:', error);
    return {
      success: false,
      error: error.message,
      translatedData: data, // Devolver original en caso de error
      targetLanguage,
      sourceLanguage
    };
  }
}

/**
 * Traduce un objeto con múltiples campos de texto AUTOMÁTICAMENTE
 * @param {Object} textObject - Objeto con campos de texto a traducir
 * @param {string} targetLanguage - Código de idioma destino
 * @param {string} sourceLanguage - Código de idioma origen (opcional)
 * @returns {Promise<Object>} - Objeto traducido
 */
export async function translateObject(textObject, targetLanguage, sourceLanguage = 'es') {
  try {
    // Extraer automáticamente todos los textos traducibles
    const { textValues, textKeys } = extractTranslatableTexts(textObject);
    
    if (textValues.length === 0) {
      return {
        success: true,
        translatedObject: textObject,
        message: 'No translatable text found in object',
        targetLanguage,
        sourceLanguage,
        totalTextsTranslated: 0,
        skippedTexts: 0
      };
    }

    // Traducir todos los textos
    const translationResult = await translateTexts(textValues, targetLanguage, sourceLanguage);
    
    if (!translationResult.success) {
      return {
        ...translationResult,
        translatedObject: textObject // Devolver original en caso de error
      };
    }

    // Reconstruir el objeto con las traducciones
    const translatedObject = JSON.parse(JSON.stringify(textObject));
    
    function setTranslatedValue(obj, path, translatedText) {
      const keys = path.split('.');
      let current = obj;
      
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        const arrayMatch = key.match(/^(.+)\[(\d+)\]$/);
        
        if (arrayMatch) {
          const [, arrayKey, index] = arrayMatch;
          current = current[arrayKey][parseInt(index)];
        } else {
          current = current[key];
        }
      }
      
      const lastKey = keys[keys.length - 1];
      const arrayMatch = lastKey.match(/^(.+)\[(\d+)\]$/);
      
      if (arrayMatch) {
        const [, arrayKey, index] = arrayMatch;
        current[arrayKey][parseInt(index)] = translatedText;
      } else {
        current[lastKey] = translatedText;
      }
    }
    
    translationResult.translations.forEach((translation, index) => {
      if (translation.wasTranslated !== false) {
        setTranslatedValue(translatedObject, textKeys[index], translation.translatedText);
      }
    });

    return {
      success: true,
      translatedObject,
      targetLanguage,
      sourceLanguage,
      totalTextsTranslated: translationResult.translatableTexts || textValues.length,
      skippedTexts: translationResult.skippedTexts || 0,
      translationDetails: translationResult.translations
    };

  } catch (error) {
    console.error('Error en translateObject:', error);
    return {
      success: false,
      error: error.message,
      translatedObject: textObject, // Devolver original en caso de error
      targetLanguage,
      sourceLanguage
    };
  }
} 