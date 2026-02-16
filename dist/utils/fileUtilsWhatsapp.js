import fs from "fs";
import path from "path";
import { __dirname } from "../app.js";
import pool from "../config/db.js";
import { Poppler } from "node-poppler";
import { analyzeImageBufferWithVision, analyzePdfBufferWithVision } from "../config/vision.js";
import { transcribeAudioBuffer } from "../services/openaiService.js";
import pdfParse from 'pdf-parse-debugging-disabled';

/** Guarda un archivo en base64 en disco */
export function saveBase64File(base64Data, extension) {
  const uploadsDir = path.join(__dirname, "../uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const fileName = `file-${Date.now()}.${extension}`;
  const filePath = path.join(uploadsDir, fileName);
  fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
  return filePath;
}

/** OCR en PDF escaneado: páginas → PNG → Vision OCR */
async function ocrPdfScaneado(pdfPath) {
  const poppler = new Poppler();
  const info = await poppler.pdfInfo(pdfPath);
  const pageCount = typeof info.pages === "number" ? info.pages : 1;
  const outputBase = pdfPath.replace(/\.pdf$/i, "");

  await poppler.pdfToCairo(pdfPath, outputBase, {
    firstPageToConvert: 1,
    lastPageToConvert: pageCount,
    pngFile: true,
  });

  let texto = "";
  for (let i = 1; i <= pageCount; i++) {
    const imgPath = `${outputBase}-${i}.png`;
    const buf = fs.readFileSync(imgPath);
    texto += (await analyzeImageBufferWithVision(buf)) + "\n";
    fs.unlinkSync(imgPath);
  }
  return texto.trim();
}

/** Función para resumir texto largo (recorta a 8192 tokens) */
function summarizeText(text) {
  const MAX_TOKENS = 8192; // Máximo número de tokens permitidos por OpenAI
  const tokens = text.split(" ");

  if (tokens.length > MAX_TOKENS) {
    // Cortar el texto a un máximo de MAX_TOKENS tokens
    return tokens.slice(0, MAX_TOKENS).join(" ") + "... [Texto resumido]"; // Indicando que es un resumen
  }

  return text;
}

async function extractTextFromPdf(pdfPath) {
  try {
    const dataBuffer = fs.readFileSync(pdfPath); // Leemos el PDF
    const data = await pdfParse(dataBuffer); // Usamos pdf-parse para extraer el texto
    return data.text.trim(); // Devolvemos el texto extraído del PDF
  } catch (error) {
    console.error('Error al extraer texto del PDF:', error.message);
    throw new Error('No se pudo extraer el texto del PDF');
  }
}

/**
 * Procesa el archivo recibido, dependiendo de su tipo (PDF, imagen, audio)
 */
export async function processMediaArray(
  mediaArray,
  conversationId,
  messageId,
  mediaType,
  userId
) {
  if (!Array.isArray(mediaArray)) return;

  for (const m of mediaArray) {
    if (!m.type || !m.data) continue;

    // 1) Decodificar base64 a Buffer y guardar
    const buffer = Buffer.from(m.data, "base64");
    const isPdf = m.type === "pdf";
    const isImage = m.type === "image";
    const isAudio = m.type === "audio";

    let ext =
      isPdf
        ? "pdf"
        : isImage
        ? m.mimeType.split("/")[1]
        : isAudio
        ? m.mimeType.split("/")[1]
        : "bin";
    const filePath = saveBase64File(m.data, ext);

    // 2) Extraer texto
    let extractedText = "";
    if (isPdf) {
      try {
        // Intentamos extraer el texto del PDF usando pdf-parse
        extractedText = await extractTextFromPdf(filePath);
        if (!extractedText) {
          // Si no se extrae texto, intentamos con OCR
          console.log("No se extrajo texto del PDF, usando OCR...");
          extractedText = await ocrPdfScaneado(filePath);
        }
      } catch (err) {
        console.error("Error extrayendo texto del PDF:", err.message);
        // Si pdf-parse falla, usamos OCR (si el PDF es una imagen escaneada)
        extractedText = await ocrPdfScaneado(filePath);
      }
      if (mediaType === "chat") {
               extractedText += "\nFinal del PDF";
               
            }
      
    } else if (isImage) {
      extractedText = (await analyzeImageBufferWithVision(buffer)) || "";
      extractedText += "\nFinal de la imagen";  // Indicamos que la imagen ha terminado de ser procesada
    } else if (isAudio) {
      extractedText = (await transcribeAudioBuffer(filePath)) || "";
      extractedText += "\nFinal del audio";  // Indicamos que el audio ha terminado de ser procesado
    }
    if (mediaType === "chat") {
           extractedText += "\nQuiero que seas conciso y hagas un análisis con la información que contiene cada archivo";
         }
    // Resumir si el texto es demasiado largo
    extractedText = summarizeText(extractedText);

    console.log(
      `Media [${m.filename}] → extractedText (${extractedText.length} chars):`,
      extractedText
    );

    // 3) Insertar en BBDD
    await pool.query(
         `INSERT INTO media
            (users_id, media_type, message_id, personality_instruction_id, image_url, filename, mime_type, extracted_text, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
         [
           userId,
           mediaType,
           mediaType === "chat" ? messageId : null,
           mediaType === "instruction" ? messageId : null,
           filePath,
           m.filename,
           m.mimeType,      
           extractedText
         ]
       )
    // 5) Limpiar fichero original
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
}

async function saveMessage(userId, conversationId, senderType, content) {
  const { rows } = await pool.query(
    `INSERT INTO messages_new
       (user_id, conversation_id, sender_type, message_type, text_content, created_at)
     VALUES ($1, $2, $3, 'text', $4, NOW())
     RETURNING id`,
    [userId, conversationId, senderType, content]
  );
  return rows[0].id;
}
