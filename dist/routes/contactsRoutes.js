import { Router } from "express";
import multer from "multer";
import Papa from "papaparse";
import pdfParse from "pdf-parse-debugging-disabled";
import * as XLSX from "xlsx";
import { validateJwt } from "../config/jwt.js";

const router = Router();
const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB max
});

/**
 * Extrae números de teléfono de un texto
 */
function extractPhones(text = "") {
  const matches = text.match(/(\+?\d[\d\s\-\(\)]{6,19})/g) || [];
  return matches
    .map(m => m.replace(/[^\d+]/g, ""))
    .filter(p => p.length >= 7 && p.length <= 15);
}

/**
 * Construye lista de contactos desde filas de datos
 */
function buildContacts(rows) {
  const out = [];
  
  for (const r of rows) {
    // Buscar nombre en diferentes columnas posibles
    const name = (
      r.name || r.nombre || r.NOMBRE || r.fullname || r["Full Name"] || 
      r["Nombre"] || r["Nombre Completo"] || r["Name"] || r["CLIENT"] || 
      r.client || r.cliente || ""
    ).toString().trim();
    
    // Buscar teléfono en diferentes columnas posibles
    const phoneRaw = (
      r.phone || r.telefono || r["Teléfono"] || r["Phone"] || r["phone number"] || 
      r["Número"] || r["PHONE"] || r["TELEFONO"] || r.mobile || r.movil || 
      r.celular || r.whatsapp || r["WhatsApp"] || ""
    ).toString();

    const phones = extractPhones(phoneRaw);
    
    // Si encontramos al menos un teléfono, crear el contacto
    if (phones.length) {
      out.push({ 
        name: name || phones[0].split("@")[0], // Si no hay nombre, usar el número
        phone: phones[0] 
      });
    }
  }
  
  return out;
}

/**
 * POST /api/contacts/import
 * Importa contactos desde archivos CSV, XLSX, TXT o PDF
 * 
 * @body {file} file - Archivo a procesar
 * @returns {Array} contacts - Lista de contactos con { name, phone }
 */
router.post("/import", validateJwt, upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ 
        success: false, 
        message: "Archivo requerido" 
      });
    }

    let contacts = [];

    // Procesar según tipo de archivo
    if (file.mimetype.includes("csv") || file.originalname.toLowerCase().endsWith(".csv")) {
      // Procesar CSV
      const parsed = Papa.parse(file.buffer.toString("utf-8"), { 
        header: true, 
        skipEmptyLines: true,
        encoding: "utf-8"
      });
      
      if (parsed.errors && parsed.errors.length > 0) {
        console.warn("CSV parsing warnings:", parsed.errors);
      }
      
      contacts = buildContacts(parsed.data);
      
    } else if (
      file.mimetype.includes("sheet") ||
      file.originalname.toLowerCase().endsWith(".xlsx") ||
      file.originalname.toLowerCase().endsWith(".xls")
    ) {
      // Procesar Excel
      const wb = XLSX.read(file.buffer, { type: "buffer" });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      
      contacts = buildContacts(rows);
      
    } else if (
      file.mimetype === "text/plain" || 
      file.originalname.toLowerCase().endsWith(".txt")
    ) {
      // Procesar archivo de texto (solo números)
      const text = file.buffer.toString("utf-8");
      const phones = extractPhones(text);
      
      contacts = phones.map(p => ({ 
        name: "", // Sin nombre en archivos de texto
        phone: p 
      }));
      
    } else if (
      file.mimetype === "application/pdf" || 
      file.originalname.toLowerCase().endsWith(".pdf")
    ) {
      // Procesar PDF
      const pdf = await pdfParse(file.buffer);
      const phones = extractPhones(pdf.text || "");
      
      contacts = phones.map(p => ({ 
        name: "", // Sin nombre en PDFs
        phone: p 
      }));
      
    } else {
      return res.status(400).json({ 
        success: false, 
        message: "Formato de archivo no soportado. Use CSV, XLSX, TXT o PDF." 
      });
    }

    // Eliminar duplicados por teléfono
    const uniqueContacts = Array.from(
      new Map(contacts.map(c => [c.phone, { 
        name: c.name || "", 
        phone: c.phone 
      }])).values()
    );

    console.log(`Importados ${uniqueContacts.length} contactos únicos de ${file.originalname}`);

    return res.json({ 
      success: true, 
      contacts: uniqueContacts,
      total: uniqueContacts.length,
      filename: file.originalname
    });
    
  } catch (error) {
    console.error("contacts/import error:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Error importando contactos" 
    });
  }
});

export default router;
