import { Router } from "express";
import { validateJwt } from "../config/jwt.js"; // Middleware para validar el JWT
import { bulkSendMessages, createColumn, createLead, deleteColumn, deleteLead, getAutoCreateConfig, getColumns, moveLead, syncColumns, syncWhatsAppLeads, updateAutoCreateConfig, updateColumn, updateLead } from "../controllers/leadsController.js";

const router = Router();

// Rutas para columnas
router.post("/columns", validateJwt, createColumn);  // Crear columna
router.post("/sync_columns", validateJwt, syncColumns);  // Sincronizar columnas con BD
router.post("/sync_whatsapp_leads", validateJwt, syncWhatsAppLeads);  // Sincronizar contactos WhatsApp como leads
router.get("/columns", validateJwt, getColumns);    // Obtener todas las columnas
router.put("/columns/:columnId", validateJwt, updateColumn);
router.delete("/columns/:columnId", validateJwt, deleteColumn);
// Rutas para leads
router.post("/leads", validateJwt, createLead);      // Crear un nuevo lead
router.post("/move", validateJwt, moveLead);  // Mover lead entre columnas (usando body)
router.post("/bulk_send", validateJwt, bulkSendMessages);  // Envío masivo de mensajes
router.delete("/leads/:leadId", validateJwt, deleteLead);  // Eliminar lead
router.put("/leads/:leadId", validateJwt, updateLead);

// Configuración de auto-creación de leads
router.get("/auto_create_config", validateJwt, getAutoCreateConfig);
router.put("/auto_create_config", validateJwt, updateAutoCreateConfig);

export default router;
