import { analyzeImageBufferWithVision, isImageSafe } from '../services/googleVisionService.js';
import { analyzePdfBufferWithVision } from '../services/googleVisionService.js';

export async function extractImageText(media) {
    try {
        // Verificar si es una imagen
        if (!media.type?.startsWith('image/')) {
            return "";
        }

        // Convertir base64 a buffer si es necesario
        let imageBuffer;
        if (media.data.startsWith('data:')) {
            const base64Data = media.data.split(',')[1];
            imageBuffer = Buffer.from(base64Data, 'base64');
        } else {
            imageBuffer = Buffer.from(media.data, 'base64');
        }

        // Verificar tamaño (máximo 2MB)
        if (imageBuffer.length > 2 * 1024 * 1024) {
            throw new Error('La imagen excede el tamaño máximo permitido de 2MB');
        }

        // Verificar si la imagen es segura
        const isSafe = await isImageSafe(imageBuffer);
        if (!isSafe) {
            throw new Error('La imagen contiene contenido inapropiado');
        }

        // Analizar la imagen y extraer texto
        const extractedText = await analyzeImageBufferWithVision(imageBuffer);
        return extractedText;

    } catch (error) {
        console.error('Error al procesar la imagen:', error);
        throw error;
    }
}

export async function extractPdfText(media) {
    try {
        // Verificar si es un PDF
        if (!media.type?.includes('pdf')) {
            return "";
        }

        // Convertir base64 a buffer si es necesario
        let pdfBuffer;
        if (media.data.startsWith('data:')) {
            const base64Data = media.data.split(',')[1];
            pdfBuffer = Buffer.from(base64Data, 'base64');
        } else {
            pdfBuffer = Buffer.from(media.data, 'base64');
        }

        // Verificar tamaño (máximo 10MB para PDFs)
        if (pdfBuffer.length > 10 * 1024 * 1024) {
            throw new Error('El PDF excede el tamaño máximo permitido de 10MB');
        }

        // Analizar el PDF y extraer texto
        const extractedText = await analyzePdfBufferWithVision(pdfBuffer);
        return extractedText;

    } catch (error) {
        console.error('Error al procesar el PDF:', error);
        throw error;
    }
} 