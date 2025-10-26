// services/visionService.ts
import visionClient from '../config/vision.js';
/**
 * Analiza un buffer de imagen usando Google Cloud Vision API
 * @param imageBuffer - Buffer de la imagen a analizar
 * @returns Texto detectado en la imagen (cadena vacía si no se encuentra texto)
 */
export async function analyzeImageBufferWithVision(imageBuffer) {
    try {
        // Verificar si Google Vision está disponible
        if (!visionClient) {
            console.warn('⚠️ Google Vision no está disponible. Retornando texto vacío.');
            return '';
        }
        
        console.log('🖼️ Iniciando análisis de imagen con Google Vision...');
        const [result] = await visionClient.textDetection(imageBuffer);
        const text = result.fullTextAnnotation
            ? result.fullTextAnnotation.text
            : '';
        
        console.log(`✅ Análisis de imagen completado. Texto extraído: ${text.length} caracteres`);
        return text?.trim() ?? '';
    }
    catch (error) {
        console.error('❌ Error al analizar la imagen (buffer):', error);
        
        // Manejo específico de errores comunes
        if (error.code === 3 && error.message.includes('Invalid image data')) {
            throw new Error('Formato de imagen no válido');
        }
        if (error.code === 7 && error.message.includes('Permission denied')) {
            throw new Error('No se tienen permisos para acceder al servicio de Vision');
        }
        if (error.code === 16 && error.message.includes('Unauthenticated')) {
            throw new Error('Credenciales de Google Vision no válidas');
        }
        if (error.code === 'ENOTFOUND' || error.message.includes('network')) {
            throw new Error('Error de conexión con Google Vision API');
        }
        
        // Error genérico para otros casos
        console.error('Detalles del error:', {
            code: error.code,
            message: error.message,
            stack: error.stack?.split('\n')[0]
        });
        
        throw new Error('Error al procesar la imagen con Google Vision');
    }
}
/**
 * Versión alternativa para analizar imágenes desde URL
 * @param imageUrl - URL pública de la imagen
 * @returns Texto detectado en la imagen
 */
export async function analyzeImageUrlWithVision(imageUrl) {
    try {
        if (!visionClient) {
            console.warn('⚠️ Google Vision no está disponible. Retornando texto vacío.');
            return '';
        }
        const [result] = await visionClient.textDetection(imageUrl);
        const text = result.fullTextAnnotation
            ? result.fullTextAnnotation.text
            : '';
        return text?.trim() ?? '';
    }
    catch (error) {
        console.error('Error al analizar la imagen (URL):', error);
        throw new Error('Error al procesar la imagen desde URL');
    }
}
/**
 * Detecta si una imagen contiene contenido explícito
 * @param imageBuffer - Buffer de la imagen
 * @returns True si la imagen es segura
 */
export async function isImageSafe(imageBuffer) {
    try {
        if (!visionClient) {
            console.warn('⚠️ Google Vision no está disponible. Asumiendo imagen segura.');
            return true;
        }
        const [result] = await visionClient.safeSearchDetection(imageBuffer);
        const detections = result.safeSearchAnnotation || {};
        return (detections.adult === 'VERY_UNLIKELY' &&
            detections.violence === 'VERY_UNLIKELY' &&
            detections.racy === 'VERY_UNLIKELY');
    }
    catch (error) {
        console.error('Error en detección de contenido seguro:', error);
        return false;
    }
}

export async function analyzePdfBufferWithVision(buffer) {
    try {
        if (!visionClient) {
            console.warn('⚠️ Google Vision no está disponible. No se puede analizar PDF.');
            return 'PDF no procesado: Google Vision no está configurado';
        }
        
        console.log('📄 Iniciando análisis de PDF con Google Vision...');
        console.log(`📄 Tamaño del PDF: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
        
        // Convertir buffer a base64 para Google Vision
        const base64Buffer = buffer.toString('base64');
        
        // Usar documentTextDetection que es más apropiado para PDFs
        const [result] = await visionClient.documentTextDetection({
            image: { 
                content: base64Buffer
            }
        });
        
        console.log('📄 Respuesta de Google Vision recibida');
        
        // Extraer texto de diferentes maneras
        let extractedText = '';
        
        // Método 1: fullTextAnnotation (más completo)
        if (result.fullTextAnnotation?.text) {
            extractedText = result.fullTextAnnotation.text.trim();
            console.log(`✅ Texto extraído con fullTextAnnotation: ${extractedText.length} caracteres`);
        }
        // Método 2: textAnnotations (fallback)
        else if (result.textAnnotations && result.textAnnotations.length > 0) {
            extractedText = result.textAnnotations[0].description?.trim() || '';
            console.log(`✅ Texto extraído con textAnnotations: ${extractedText.length} caracteres`);
        }
        // Método 3: páginas individuales
        else if (result.pages && result.pages.length > 0) {
            const pageTexts = [];
            for (const page of result.pages) {
                if (page.blocks) {
                    for (const block of page.blocks) {
                        if (block.paragraphs) {
                            for (const paragraph of block.paragraphs) {
                                if (paragraph.words) {
                                    const words = paragraph.words.map(word => 
                                        word.symbols ? word.symbols.map(s => s.text).join('') : ''
                                    ).join(' ');
                                    pageTexts.push(words);
                                }
                            }
                        }
                    }
                }
            }
            extractedText = pageTexts.join(' ').trim();
            console.log(`✅ Texto extraído con páginas: ${extractedText.length} caracteres`);
        }
        
        if (!extractedText || extractedText.length === 0) {
            console.log('⚠️ No se encontró texto en el PDF');
            console.log('📄 Estructura de respuesta:', JSON.stringify(result, null, 2).substring(0, 500) + '...');
            return 'PDF procesado pero no se encontró texto legible. Puede ser un PDF de solo imágenes o con texto no reconocible.';
        }
        
        console.log(`✅ Análisis de PDF completado exitosamente. Texto extraído: ${extractedText.length} caracteres`);
        console.log(`📄 Muestra del texto: ${extractedText.substring(0, 200)}...`);
        
        return extractedText;
        
    } catch (error) {
        console.error('❌ Error al analizar el PDF:', error);
        
        // Manejo específico de errores para PDFs
        if (error.code === 3) {
            console.error('❌ Error de formato: PDF no válido o corrupto');
            return 'PDF procesado pero el formato no es válido o está corrupto';
        }
        if (error.code === 7) {
            console.error('❌ Error de permisos: No autorizado para procesar PDFs');
            return 'PDF procesado pero no se tienen permisos para acceder al contenido';
        }
        if (error.code === 16) {
            console.error('❌ Error de autenticación: Credenciales no válidas');
            return 'PDF procesado pero las credenciales de Google Vision no son válidas';
        }
        if (error.message.includes('network') || error.code === 'ENOTFOUND') {
            console.error('❌ Error de red: Conexión con Google Vision falló');
            return 'PDF procesado pero hubo un error de conexión con el servicio de análisis';
        }
        if (error.message.includes('quota') || error.message.includes('limit')) {
            console.error('❌ Error de cuota: Límite excedido');
            return 'PDF procesado pero se excedió el límite de procesamiento';
        }
        
        console.error('Detalles del error de PDF:', {
            code: error.code,
            message: error.message,
            name: error.name,
            stack: error.stack?.split('\n')[0]
        });
        
        return `PDF procesado pero no se pudo extraer texto: ${error.message}`;
    }
}
/**
 * Análisis visual completo de una imagen usando Google Vision API
 * Incluye: objetos, marcas, caras, colores, etiquetas, texto, etc.
 * @param imageBuffer - Buffer de la imagen a analizar
 * @returns Objeto con análisis completo de la imagen
 */
export async function analyzeImageComplete(imageBuffer) {
    try {
        if (!visionClient) {
            console.warn('⚠️ Google Vision no está disponible. Retornando análisis vacío.');
            return {
                timestamp: new Date().toISOString(),
                imageSize: imageBuffer.length,
                text: '',
                objects: [],
                labels: [],
                logos: [],
                faces: [],
                colors: [],
                safety: {},
                landmarks: [],
                summary: 'Análisis no disponible: Google Vision no configurado',
                confidence: 0
            };
        }
        
        console.log('🔍 Iniciando análisis visual completo con Google Vision...');
        console.log(`📊 Tamaño de imagen: ${(imageBuffer.length / 1024).toFixed(2)}KB`);
        
        // Realizar múltiples tipos de análisis en paralelo
        const analysisPromises = [
            // 1. Detección de texto (OCR)
            visionClient.textDetection(imageBuffer).catch(err => ({ error: 'text', details: err.message })),
            
            // 2. Detección de objetos
            visionClient.objectLocalization(imageBuffer).catch(err => ({ error: 'objects', details: err.message })),
            
            // 3. Detección de etiquetas/categorías
            visionClient.labelDetection(imageBuffer).catch(err => ({ error: 'labels', details: err.message })),
            
            // 4. Detección de marcas/logos
            visionClient.logoDetection(imageBuffer).catch(err => ({ error: 'logos', details: err.message })),
            
            // 5. Detección de caras
            visionClient.faceDetection(imageBuffer).catch(err => ({ error: 'faces', details: err.message })),
            
            // 6. Propiedades de imagen (colores dominantes)
            visionClient.imageProperties(imageBuffer).catch(err => ({ error: 'properties', details: err.message })),
            
            // 7. Detección de contenido seguro
            visionClient.safeSearchDetection(imageBuffer).catch(err => ({ error: 'safety', details: err.message })),
            
            // 8. Detección de puntos de referencia
            visionClient.landmarkDetection(imageBuffer).catch(err => ({ error: 'landmarks', details: err.message }))
        ];
        
        console.log('🔄 Ejecutando 8 tipos de análisis en paralelo...');
        const results = await Promise.all(analysisPromises);
        
        // Procesar resultados
        const analysis = {
            timestamp: new Date().toISOString(),
            imageSize: imageBuffer.length,
            text: '',
            objects: [],
            labels: [],
            logos: [],
            faces: [],
            colors: [],
            safety: {},
            landmarks: [],
            summary: '',
            confidence: 0
        };
        
        // 1. Procesar texto (OCR)
        if (results[0] && !results[0].error) {
            const [textResult] = results[0];
            analysis.text = textResult.fullTextAnnotation?.text?.trim() || '';
            console.log(`📝 Texto extraído: ${analysis.text.length} caracteres`);
        }
        
        // 2. Procesar objetos detectados
        if (results[1] && !results[1].error) {
            const [objectResult] = results[1];
            analysis.objects = (objectResult.localizedObjectAnnotations || []).map(obj => ({
                name: obj.name,
                confidence: Math.round(obj.score * 100),
                boundingBox: obj.boundingPoly
            }));
            console.log(`📦 Objetos detectados: ${analysis.objects.length}`);
        }
        
        // 3. Procesar etiquetas/categorías
        if (results[2] && !results[2].error) {
            const [labelResult] = results[2];
            analysis.labels = (labelResult.labelAnnotations || []).map(label => ({
                description: label.description,
                confidence: Math.round(label.score * 100),
                topicality: Math.round((label.topicality || 0) * 100)
            })).filter(label => label.confidence > 50); // Solo etiquetas con alta confianza
            console.log(`🏷️ Etiquetas detectadas: ${analysis.labels.length}`);
        }
        
        // 4. Procesar marcas/logos
        if (results[3] && !results[3].error) {
            const [logoResult] = results[3];
            analysis.logos = (logoResult.logoAnnotations || []).map(logo => ({
                description: logo.description,
                confidence: Math.round(logo.score * 100),
                boundingBox: logo.boundingPoly
            }));
            console.log(`🏢 Marcas/logos detectados: ${analysis.logos.length}`);
        }
        
        // 5. Procesar caras detectadas
        if (results[4] && !results[4].error) {
            const [faceResult] = results[4];
            analysis.faces = (faceResult.faceAnnotations || []).map(face => ({
                confidence: Math.round(face.detectionConfidence * 100),
                emotions: {
                    joy: face.joyLikelihood,
                    sorrow: face.sorrowLikelihood,
                    anger: face.angerLikelihood,
                    surprise: face.surpriseLikelihood
                },
                boundingBox: face.boundingPoly,
                landmarks: face.landmarks?.length || 0
            }));
            console.log(`😊 Caras detectadas: ${analysis.faces.length}`);
        }
        
        // 6. Procesar colores dominantes
        if (results[5] && !results[5].error) {
            const [propertiesResult] = results[5];
            analysis.colors = (propertiesResult.imagePropertiesAnnotation?.dominantColors?.colors || []).map(color => ({
                red: Math.round(color.color.red || 0),
                green: Math.round(color.color.green || 0),
                blue: Math.round(color.color.blue || 0),
                hex: `#${Math.round(color.color.red || 0).toString(16).padStart(2, '0')}${Math.round(color.color.green || 0).toString(16).padStart(2, '0')}${Math.round(color.color.blue || 0).toString(16).padStart(2, '0')}`,
                percentage: Math.round(color.pixelFraction * 100),
                score: Math.round(color.score * 100)
            })).slice(0, 5); // Top 5 colores
            console.log(`🎨 Colores dominantes: ${analysis.colors.length}`);
        }
        
        // 7. Procesar seguridad del contenido
        if (results[6] && !results[6].error) {
            const [safetyResult] = results[6];
            const safety = safetyResult.safeSearchAnnotation || {};
            analysis.safety = {
                adult: safety.adult || 'UNKNOWN',
                violence: safety.violence || 'UNKNOWN',
                racy: safety.racy || 'UNKNOWN',
                medical: safety.medical || 'UNKNOWN',
                spoof: safety.spoof || 'UNKNOWN',
                isSafe: (safety.adult === 'VERY_UNLIKELY' && safety.violence === 'VERY_UNLIKELY' && safety.racy === 'VERY_UNLIKELY')
            };
            console.log(`🛡️ Contenido seguro: ${analysis.safety.isSafe ? 'SÍ' : 'NO'}`);
        }
        
        // 8. Procesar puntos de referencia
        if (results[7] && !results[7].error) {
            const [landmarkResult] = results[7];
            analysis.landmarks = (landmarkResult.landmarkAnnotations || []).map(landmark => ({
                description: landmark.description,
                confidence: Math.round(landmark.score * 100),
                location: landmark.locations?.[0]?.latLng
            }));
            console.log(`🏔️ Puntos de referencia: ${analysis.landmarks.length}`);
        }
        
        // Generar resumen inteligente
        analysis.summary = generateImageSummary(analysis);
        analysis.confidence = calculateOverallConfidence(analysis);
        
        console.log(`✅ Análisis visual completo terminado`);
        console.log(`📊 Confianza general: ${analysis.confidence}%`);
        console.log(`📝 Resumen: ${analysis.summary.substring(0, 100)}...`);
        
        return analysis;
        
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
 * Genera un resumen inteligente basado en el análisis visual
 */
function generateImageSummary(analysis) {
    const parts = [];
    
    // Objetos principales
    if (analysis.objects.length > 0) {
        const mainObjects = analysis.objects
            .filter(obj => obj.confidence > 70)
            .map(obj => obj.name)
            .slice(0, 3);
        if (mainObjects.length > 0) {
            parts.push(`Objetos: ${mainObjects.join(', ')}`);
        }
    }
    
    // Etiquetas principales
    if (analysis.labels.length > 0) {
        const mainLabels = analysis.labels
            .filter(label => label.confidence > 80)
            .map(label => label.description)
            .slice(0, 3);
        if (mainLabels.length > 0) {
            parts.push(`Categorías: ${mainLabels.join(', ')}`);
        }
    }
    
    // Marcas detectadas
    if (analysis.logos.length > 0) {
        const brands = analysis.logos.map(logo => logo.description).slice(0, 2);
        parts.push(`Marcas: ${brands.join(', ')}`);
    }
    
    // Caras
    if (analysis.faces.length > 0) {
        parts.push(`${analysis.faces.length} cara${analysis.faces.length > 1 ? 's' : ''} detectada${analysis.faces.length > 1 ? 's' : ''}`);
    }
    
    // Colores dominantes
    if (analysis.colors.length > 0) {
        const topColor = analysis.colors[0];
        parts.push(`Color dominante: ${topColor.hex}`);
    }
    
    // Texto
    if (analysis.text && analysis.text.length > 10) {
        parts.push(`Contiene texto (${analysis.text.length} caracteres)`);
    }
    
    // Puntos de referencia
    if (analysis.landmarks.length > 0) {
        const landmarks = analysis.landmarks.map(l => l.description).slice(0, 2);
        parts.push(`Lugares: ${landmarks.join(', ')}`);
    }
    
    return parts.length > 0 
        ? parts.join('. ') + '.'
        : 'Imagen analizada sin elementos destacables detectados.';
}

/**
 * Calcula la confianza general del análisis
 */
function calculateOverallConfidence(analysis) {
    const confidences = [];
    
    if (analysis.objects.length > 0) {
        confidences.push(Math.max(...analysis.objects.map(o => o.confidence)));
    }
    
    if (analysis.labels.length > 0) {
        confidences.push(Math.max(...analysis.labels.map(l => l.confidence)));
    }
    
    if (analysis.logos.length > 0) {
        confidences.push(Math.max(...analysis.logos.map(l => l.confidence)));
    }
    
    if (analysis.faces.length > 0) {
        confidences.push(Math.max(...analysis.faces.map(f => f.confidence)));
    }
    
    if (analysis.text && analysis.text.length > 0) {
        confidences.push(85); // OCR suele ser bastante confiable
    }
    
    return confidences.length > 0 
        ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
        : 0;
}

//# sourceMappingURL=googleVisionService.js.map