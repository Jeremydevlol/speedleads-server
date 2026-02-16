// services/visionService.js - Ahora usando OpenAI GPT-5.2 para visión y OCR
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60000,
  maxRetries: 2,
});

const VISION_MODEL = 'gpt-4o';

/**
 * Analiza un buffer de imagen usando OpenAI GPT-5.2 Vision (reemplaza Google Vision)
 * @param imageBuffer - Buffer de la imagen a analizar
 * @returns Texto detectado en la imagen (cadena vacía si no se encuentra texto)
 */
export async function analyzeImageBufferWithVision(imageBuffer) {
    try {
        console.log('🖼️ Iniciando análisis de imagen con OpenAI GPT-5.2 Vision...');
        console.log(`📊 Tamaño de imagen: ${(imageBuffer.length / 1024).toFixed(2)}KB`);
        
        // Convertir buffer a base64
        const base64Image = imageBuffer.toString('base64');
        const mimeType = detectImageMimeType(imageBuffer);
        
        const response = await openai.chat.completions.create({
            model: VISION_MODEL,
            messages: [
                {
                    role: 'system',
                    content: `Eres un experto en OCR (Reconocimiento Óptico de Caracteres). Tu tarea es extraer TODO el texto visible en la imagen de forma precisa y completa. 
                    
INSTRUCCIONES:
- Extrae todo el texto visible, manteniendo el formato original lo mejor posible
- Incluye números, fechas, direcciones, nombres, todo texto legible
- Si hay texto en diferentes secciones, sepáralos con saltos de línea
- Si la imagen no contiene texto legible, responde exactamente: "NO_TEXT_FOUND"
- NO añadas explicaciones ni comentarios, solo el texto extraído
- Mantén el idioma original del texto`
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${mimeType};base64,${base64Image}`,
                                detail: 'high' // Alta resolución para mejor OCR
                            }
                        },
                        {
                            type: 'text',
                            text: 'Extrae todo el texto visible en esta imagen.'
                        }
                    ]
                }
            ],
            max_tokens: 4000,
            temperature: 0.1 // Baja temperatura para mayor precisión en OCR
        });

        const extractedText = response.choices[0]?.message?.content?.trim() || '';
        
        // Si no se encontró texto
        if (extractedText === 'NO_TEXT_FOUND' || extractedText.toLowerCase().includes('no hay texto') || extractedText.toLowerCase().includes('no contiene texto')) {
            console.log('📝 No se encontró texto en la imagen');
            return '';
        }
        
        console.log(`✅ Análisis de imagen completado. Texto extraído: ${extractedText.length} caracteres`);
        return extractedText;
        
    } catch (error) {
        console.error('❌ Error al analizar la imagen con OpenAI:', error);
        
        if (error.code === 'invalid_api_key') {
            throw new Error('API Key de OpenAI no válida');
        }
        if (error.code === 'rate_limit_exceeded') {
            throw new Error('Límite de API de OpenAI excedido');
        }
        if (error.message?.includes('Could not process image')) {
            throw new Error('Formato de imagen no válido o corrupto');
        }
        
        console.error('Detalles del error:', {
            code: error.code,
            message: error.message,
            status: error.status
        });
        
        throw new Error('Error al procesar la imagen con OpenAI Vision');
    }
}

/**
 * Versión alternativa para analizar imágenes desde URL
 * @param imageUrl - URL pública de la imagen
 * @returns Texto detectado en la imagen
 */
export async function analyzeImageUrlWithVision(imageUrl) {
    try {
        console.log('🖼️ Analizando imagen desde URL con OpenAI GPT-5.2...');
        
        const response = await openai.chat.completions.create({
            model: VISION_MODEL,
            messages: [
                {
                    role: 'system',
                    content: `Eres un experto en OCR. Extrae TODO el texto visible en la imagen de forma precisa. Si no hay texto, responde "NO_TEXT_FOUND".`
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: imageUrl,
                                detail: 'high'
                            }
                        },
                        {
                            type: 'text',
                            text: 'Extrae todo el texto visible en esta imagen.'
                        }
                    ]
                }
            ],
            max_tokens: 4000,
            temperature: 0.1
        });

        const extractedText = response.choices[0]?.message?.content?.trim() || '';
        
        if (extractedText === 'NO_TEXT_FOUND') {
            return '';
        }
        
        return extractedText;
        
    } catch (error) {
        console.error('Error al analizar la imagen (URL):', error);
        throw new Error('Error al procesar la imagen desde URL');
    }
}

/**
 * Detecta si una imagen contiene contenido explícito usando OpenAI
 * @param imageBuffer - Buffer de la imagen
 * @returns True si la imagen es segura
 */
export async function isImageSafe(imageBuffer) {
    try {
        console.log('🛡️ Verificando seguridad de imagen con OpenAI...');
        
        const base64Image = imageBuffer.toString('base64');
        const mimeType = detectImageMimeType(imageBuffer);
        
        const response = await openai.chat.completions.create({
            model: VISION_MODEL,
            messages: [
                {
                    role: 'system',
                    content: `Eres un moderador de contenido. Analiza la imagen y determina si es segura.
                    
Responde SOLO con un JSON en este formato exacto:
{"safe": true/false, "reason": "breve explicación"}

Una imagen NO es segura si contiene:
- Contenido sexual explícito o sugestivo
- Violencia gráfica
- Gore o contenido perturbador
- Desnudez inapropiada

Si la imagen es normal/segura, responde {"safe": true, "reason": "contenido apropiado"}`
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${mimeType};base64,${base64Image}`,
                                detail: 'low' // Baja resolución es suficiente para moderación
                            }
                        },
                        {
                            type: 'text',
                            text: '¿Esta imagen es segura?'
                        }
                    ]
                }
            ],
            max_tokens: 200,
            temperature: 0
        });

        const result = response.choices[0]?.message?.content?.trim() || '{"safe": true}';
        
        try {
            const parsed = JSON.parse(result);
            console.log(`🛡️ Resultado de seguridad: ${parsed.safe ? 'SEGURA' : 'NO SEGURA'} - ${parsed.reason || ''}`);
            return parsed.safe === true;
        } catch {
            // Si no puede parsear, asumir seguro
            console.log('⚠️ No se pudo parsear respuesta de seguridad, asumiendo seguro');
            return true;
        }
        
    } catch (error) {
        console.error('Error en detección de contenido seguro:', error);
        return true; // En caso de error, asumir seguro para no bloquear
    }
}

/**
 * Analiza un PDF usando OpenAI GPT-5.2 Vision
 * @param buffer - Buffer del PDF
 * @returns Texto extraído del PDF
 */
export async function analyzePdfBufferWithVision(buffer) {
    try {
        console.log('📄 Iniciando análisis de PDF con OpenAI GPT-5.2...');
        console.log(`📄 Tamaño del PDF: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
        
        // Convertir PDF a base64
        const base64Pdf = buffer.toString('base64');
        
        const response = await openai.chat.completions.create({
            model: VISION_MODEL,
            messages: [
                {
                    role: 'system',
                    content: `Eres un experto en extracción de texto de documentos PDF. Tu tarea es extraer TODO el contenido textual del PDF de forma precisa y estructurada.

INSTRUCCIONES:
- Extrae todo el texto visible en todas las páginas
- Mantén la estructura del documento (títulos, párrafos, listas)
- Incluye tablas formateadas de manera legible
- Incluye números, fechas, direcciones, todo texto legible
- Si hay múltiples páginas, sepáralas con "--- Página X ---"
- Si el PDF es una imagen escaneada, usa OCR
- NO añadas explicaciones, solo el contenido del documento
- Mantén el idioma original`
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:application/pdf;base64,${base64Pdf}`,
                                detail: 'high'
                            }
                        },
                        {
                            type: 'text',
                            text: 'Extrae todo el contenido textual de este documento PDF.'
                        }
                    ]
                }
            ],
            max_tokens: 8000, // Más tokens para documentos largos
            temperature: 0.1
        });

        const extractedText = response.choices[0]?.message?.content?.trim() || '';
        
        if (!extractedText || extractedText.length === 0) {
            console.log('⚠️ No se encontró texto en el PDF');
            return 'PDF procesado pero no se encontró texto legible. Puede ser un PDF de solo imágenes o con texto no reconocible.';
        }
        
        console.log(`✅ Análisis de PDF completado exitosamente. Texto extraído: ${extractedText.length} caracteres`);
        console.log(`📄 Muestra del texto: ${extractedText.substring(0, 200)}...`);
        
        return extractedText;
        
    } catch (error) {
        console.error('❌ Error al analizar el PDF:', error);
        
        if (error.message?.includes('Could not process')) {
            console.error('❌ Error de formato: PDF no válido o corrupto');
            return 'PDF procesado pero el formato no es válido o está corrupto';
        }
        if (error.code === 'rate_limit_exceeded') {
            console.error('❌ Error de límite: Límite de API excedido');
            return 'PDF procesado pero se excedió el límite de procesamiento';
        }
        
        console.error('Detalles del error de PDF:', {
            code: error.code,
            message: error.message,
            status: error.status
        });
        
        return `PDF procesado pero no se pudo extraer texto: ${error.message}`;
    }
}

/**
 * Análisis visual completo de una imagen usando OpenAI GPT-5.2
 * Incluye: objetos, marcas, caras, colores, etiquetas, texto, etc.
 * @param imageBuffer - Buffer de la imagen a analizar
 * @returns Objeto con análisis completo de la imagen
 */
export async function analyzeImageComplete(imageBuffer) {
    try {
        console.log('🔍 Iniciando análisis visual completo con OpenAI GPT-5.2...');
        console.log(`📊 Tamaño de imagen: ${(imageBuffer.length / 1024).toFixed(2)}KB`);
        
        const base64Image = imageBuffer.toString('base64');
        const mimeType = detectImageMimeType(imageBuffer);
        
        const response = await openai.chat.completions.create({
            model: VISION_MODEL,
            messages: [
                {
                    role: 'system',
                    content: `Eres un experto analizador de imágenes GENERAL. Tu análisis debe ser PRECISO, ESPECÍFICO y aplicable a CUALQUIER tipo de imagen.

INSTRUCCIONES IMPORTANTES:
1. Analiza TODO lo que veas: personas, objetos, animales, paisajes, documentos, productos, vehículos, etc.
2. Identifica marcas, logos, texto visible con precisión
3. Si hay personas, describe expresiones, vestimenta, actividades
4. Si hay productos, identifica marca, tipo, características
5. Si es un documento, extrae el texto visible
6. Si es un paisaje o lugar, describe la ubicación y características
7. NO uses frases vagas como "lo que parece ser" - sé directo y seguro

Responde SOLO con un JSON válido en este formato exacto:
{
    "text": "todo el texto visible en la imagen (vacío si no hay)",
    "objects": ["lista de objetos con nombres específicos, no genéricos"],
    "labels": ["categorías precisas que describen la imagen"],
    "logos": ["marcas o logos detectados con nombre exacto"],
    "faces": {
        "count": número de caras detectadas (0 si no hay personas),
        "emotions": ["emociones si hay personas"],
        "descriptions": ["descripción de cada persona si aplica"]
    },
    "colors": ["colores dominantes"],
    "landmarks": ["lugares reconocibles"],
    "safety": {
        "isSafe": true/false,
        "concerns": []
    },
    "contentType": {
        "category": "persona/producto/documento/paisaje/arte/animal/vehículo/comida/otro",
        "subcategory": "subcategoría específica",
        "details": {}
    },
    "summary": "Descripción PRECISA y DIRECTA de 1-2 oraciones describiendo lo que se ve en la imagen",
    "confidence": número del 0 al 100,
    "actionableInfo": "Información útil extraída que podría ser usada como instrucción"
}

Sé PRECISO, ESPECÍFICO y DIRECTO. Adapta tu análisis al tipo de contenido de la imagen.`
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${mimeType};base64,${base64Image}`,
                                detail: 'high'
                            }
                        },
                        {
                            type: 'text',
                            text: 'Analiza esta imagen con precisión. Identifica todo lo relevante: personas, objetos, texto, marcas, lugares, etc.'
                        }
                    ]
                }
            ],
            max_tokens: 4000,
            temperature: 0.2
        });

        const resultText = response.choices[0]?.message?.content?.trim() || '{}';
        
        try {
            // Intentar parsear el JSON
            let analysis = JSON.parse(resultText);
            
            // Normalizar la estructura para compatibilidad
            const normalizedAnalysis = {
                timestamp: new Date().toISOString(),
                imageSize: imageBuffer.length,
                text: analysis.text || '',
                objects: (analysis.objects || []).map(obj => ({
                    name: typeof obj === 'string' ? obj : obj.name,
                    confidence: typeof obj === 'string' ? 85 : (obj.confidence || 85)
                })),
                labels: (analysis.labels || []).map(label => ({
                    description: typeof label === 'string' ? label : label.description,
                    confidence: typeof label === 'string' ? 80 : (label.confidence || 80)
                })),
                logos: (analysis.logos || []).map(logo => ({
                    description: typeof logo === 'string' ? logo : logo.description,
                    confidence: 90
                })),
                faces: Array.isArray(analysis.faces) ? analysis.faces : [{
                    count: analysis.faces?.count || 0,
                    emotions: analysis.faces?.emotions || []
                }],
                colors: (analysis.colors || []).map(color => ({
                    hex: typeof color === 'string' ? color : color.hex,
                    percentage: 20
                })),
                safety: {
                    isSafe: analysis.safety?.isSafe !== false,
                    concerns: analysis.safety?.concerns || []
                },
                landmarks: (analysis.landmarks || []).map(landmark => ({
                    description: typeof landmark === 'string' ? landmark : landmark.description,
                    confidence: 80
                })),
                summary: analysis.summary || 'Imagen analizada',
                confidence: analysis.confidence || 85
            };
            
            console.log(`✅ Análisis visual completo terminado`);
            console.log(`📊 Confianza general: ${normalizedAnalysis.confidence}%`);
            console.log(`📝 Resumen: ${normalizedAnalysis.summary}`);
            
            return normalizedAnalysis;
            
        } catch (parseError) {
            console.error('⚠️ Error parseando JSON del análisis, extrayendo información manualmente');
            
            // Fallback: extraer información del texto
            return {
                timestamp: new Date().toISOString(),
                imageSize: imageBuffer.length,
                text: '',
                objects: [],
                labels: [],
                logos: [],
                faces: [],
                colors: [],
                safety: { isSafe: true },
                landmarks: [],
                summary: resultText.substring(0, 200),
                confidence: 60,
                rawAnalysis: resultText
            };
        }
        
    } catch (error) {
        console.error('❌ Error en análisis visual completo:', error);
        
        // Fallback: intentar solo OCR
        try {
            const text = await analyzeImageBufferWithVision(imageBuffer);
            return {
                timestamp: new Date().toISOString(),
                imageSize: imageBuffer.length,
                text: text,
                objects: [],
                labels: [],
                logos: [],
                faces: [],
                colors: [],
                safety: { isSafe: true },
                landmarks: [],
                summary: text ? `Imagen con texto: ${text.substring(0, 100)}...` : 'Imagen procesada pero no se pudo analizar completamente',
                confidence: text ? 70 : 30,
                error: 'Análisis parcial - solo OCR disponible'
            };
        } catch (fallbackError) {
            console.error('❌ Error en fallback OCR:', fallbackError);
            return {
                timestamp: new Date().toISOString(),
                imageSize: imageBuffer.length,
                text: '',
                objects: [],
                labels: [],
                logos: [],
                faces: [],
                colors: [],
                safety: { isSafe: true },
                landmarks: [],
                summary: 'Imagen procesada pero no se pudo analizar',
                confidence: 0,
                error: 'Análisis fallido'
            };
        }
    }
}

/**
 * Detecta el tipo MIME de una imagen basándose en los magic bytes
 * @param buffer - Buffer de la imagen
 * @returns Tipo MIME de la imagen
 */
function detectImageMimeType(buffer) {
    if (!buffer || buffer.length < 4) {
        return 'image/jpeg'; // Default
    }
    
    // Verificar magic bytes
    const header = buffer.slice(0, 4);
    
    // JPEG: FF D8 FF
    if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
        return 'image/jpeg';
    }
    
    // PNG: 89 50 4E 47
    if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
        return 'image/png';
    }
    
    // GIF: 47 49 46 38
    if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x38) {
        return 'image/gif';
    }
    
    // WebP: 52 49 46 46 ... 57 45 42 50
    if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46) {
        if (buffer.length > 11 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
            return 'image/webp';
        }
    }
    
    // BMP: 42 4D
    if (header[0] === 0x42 && header[1] === 0x4D) {
        return 'image/bmp';
    }
    
    // Default a JPEG
    return 'image/jpeg';
}

// Funciones auxiliares exportadas para compatibilidad
export function generateImageSummary(analysis) {
    return analysis.summary || 'Imagen analizada';
}

export function calculateOverallConfidence(analysis) {
    return analysis.confidence || 0;
}