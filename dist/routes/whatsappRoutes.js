import { Router } from 'express'
import multer from 'multer'
import { validateJwt } from '../config/jwt.js'
import whatsappController, { getQrCode } from '../controllers/whatsappController.js'

const router = Router()

// Configurar multer para el test de documentos Word
const storage = multer.memoryStorage()
const upload = multer({
  storage: storage,
  limits: { 
    fileSize: 50 * 1024 * 1024 // 50MB límite
  },
  fileFilter: (req, file, cb) => {
    // Permitir documentos Word y PDFs para testing
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/pdf',
      'application/msword'
    ]
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`), false)
    }
  }
})

// 2) Obtener info de un contacto
router.get('/get_contact/:id', validateJwt, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.sub || req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'No autenticado' })
    }
    const contactId = req.params.id
    const data = await whatsappController.getContactById(userId, contactId)
    return res.json({ success: true, data })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Error obteniendo contacto' })
  }
})

/**
 * GET /api/whatsapp/get_conversations
 * Retorna la lista de conversaciones + config global
 */
router.get('/get_conversations', validateJwt, whatsappController.getConversations)

/**
 * GET /api/whatsapp/get_contacts
 * Retorna la lista de contactos del usuario
 */
router.get('/get_contacts', validateJwt, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.sub || req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'No autenticado' })
    }
    
    const contacts = await whatsappController.getContacts(userId)
    return res.json({ 
      success: true, 
      contacts,
      total: contacts.length
    })
  } catch (err) {
    console.error('Error obteniendo contactos:', err);
    return res.status(200).json({ 
      success: false, 
      message: err.message || 'Error obteniendo contactos',
      contacts: [],
      total: 0
    })
  }
})

/**
 * GET /api/whatsapp/get_messages?conversationId=XXX
 * Retorna los mensajes de una conversación (external_id)
 */
router.get('/get_messages', validateJwt, whatsappController.getMessages)

/**
 * POST /api/whatsapp/set_conversation_personality
 * Asigna una personalidad a la conversación
 */


/**
 * POST /api/whatsapp/update_contact_preferences
 * Actualiza preferencias sobre un contacto o convers
 */
router.post('/update_contact_preferences', validateJwt, whatsappController.updateContactPreferences)

/**
 * GET /api/whatsapp/get_user_messages_count
 */
router.get('/get_user_messages_count', validateJwt, whatsappController.getUserMessagesCount)

/**
 * GET /api/whatsapp/get_ai_messages_count
 */
router.get('/get_ai_messages_count', validateJwt, whatsappController.getAiMessagesCount)

/**
+ * POST /api/whatsapp/activate_global_ai_all
+ * Activa IA Global a nivel de usuario
+ */
router.post('/activate_global_ai_all', validateJwt, whatsappController.activateGlobalAIAll)
router.post('/activate_global_personality', validateJwt, whatsappController.activateGlobalPersonality)
router.post('/set_conversation_personality', validateJwt, whatsappController.setConversationPersonality)
router.post('/set_contact_personality_boolean', validateJwt, whatsappController.setConversationPersonalityBoolean)
router.post('/set_conversation_prohibition', validateJwt, whatsappController.setGlobalProhibition)

router.post('/set_default_personality',validateJwt, whatsappController.setDefaultPersonality)

router.post('/unread',validateJwt, whatsappController.markConversationRead)

/**
 * GET /api/whatsapp/diagnose_audio
 * Ejecuta diagnóstico completo para problemas de audio
 */
router.get('/diagnose_audio', validateJwt, whatsappController.diagnoseAudio)

/**
 * GET /api/whatsapp/qr
 * Obtener código QR para conectar WhatsApp
 */
router.get('/qr', validateJwt, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.sub || req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'No autenticado' })
    }
    
    const result = await getQrCode(userId)
    
    if (result.connected) {
      return res.json({ 
        success: true, 
        message: result.message,
        connected: true,
        data: { qr: null }
      })
    } else {
      return res.json({ 
        success: true, 
        message: result.message,
        connected: false,
        data: { qr: result.qr }
      })
    }
  } catch (err) {
    console.error('Error en ruta QR:', err);
    return res.status(200).json({ 
      success: false, 
      message: err.message || 'QR no disponible', 
      needsQr: true,
      connected: false
    })
  }
})

/**
 * POST /api/whatsapp/send_message
 * Enviar mensaje de WhatsApp a una conversación existente
 */
router.post('/send_message', validateJwt, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.sub || req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'No autenticado' })
    }

    const { conversationId, textContent, attachments = [], senderType = 'you' } = req.body

    if (!conversationId || !textContent) {
      return res.status(400).json({
        success: false,
        message: 'Se requieren conversationId y textContent'
      })
    }

    const result = await whatsappController.sendMessage(
      userId, 
      conversationId, 
      textContent, 
      attachments, 
      senderType
    )

    return res.json({
      success: true,
      message: 'Mensaje enviado exitosamente',
      data: result
    })

  } catch (err) {
    console.error('Error enviando mensaje:', err)
    return res.status(500).json({
      success: false,
      message: err.message || 'Error al enviar mensaje'
    })
  }
})

/**
 * POST /api/whatsapp/send_message_to_number
 * Enviar mensaje de WhatsApp a un número específico (crea conversación si no existe)
 */
router.post('/send_message_to_number', validateJwt, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.sub || req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'No autenticado' })
    }

    const { phoneNumber, textContent, attachments = [], senderType = 'you', defaultCountry = '34' } = req.body

    if (!phoneNumber || !textContent) {
      return res.status(400).json({
        success: false,
        message: 'Se requieren phoneNumber y textContent'
      })
    }

    console.log(`📱 Solicitud de envío a número: ${phoneNumber}`);

    const result = await whatsappController.sendMessageToNumber(
      userId, 
      phoneNumber, // Ya no pre-formateamos, la función lo hace
      textContent, 
      attachments, 
      senderType,
      defaultCountry
    )

    return res.json({
      success: true,
      message: 'Mensaje enviado exitosamente',
      data: result
    })

  } catch (err) {
    console.error('Error enviando mensaje a número:', err)
    return res.status(500).json({
      success: false,
      message: err.message || 'Error al enviar mensaje'
    })
  }
})

/**
 * POST /api/whatsapp/send_ai_message
 * Generar y enviar mensaje de IA proactivamente
 */
router.post('/send_ai_message', validateJwt, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.sub || req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'No autenticado' })
    }

    const { phoneNumber, prompt, defaultCountry = '34', personalityId } = req.body

    if (!phoneNumber || !prompt) {
      return res.status(400).json({
        success: false,
        message: 'Se requieren phoneNumber y prompt'
      })
    }

    console.log(`🤖 Solicitud de mensaje IA a número: ${phoneNumber} con prompt: "${prompt.substring(0, 50)}..."`);

    const result = await whatsappController.sendAIMessage(
      userId, 
      phoneNumber, 
      prompt, 
      defaultCountry,
      personalityId
    )

    return res.json({
      success: true,
      message: 'Mensaje de IA generado y enviado exitosamente',
      data: result
    })

  } catch (err) {
    console.error('Error enviando mensaje de IA:', err)
    return res.status(500).json({
      success: false,
      message: err.message || 'Error al generar/enviar mensaje de IA'
    })
  }
})

/**
 * GET /api/whatsapp/rate_limit_status
 * Obtener estado actual del rate limit para el usuario
 */
router.get('/rate_limit_status', validateJwt, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.sub || req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'No autenticado' })
    }

    const { getRateLimitStatus } = await import('../utils/rateLimit.js')
    const status = getRateLimitStatus(userId)

    return res.json({
      success: true,
      data: status
    })

  } catch (err) {
    console.error('Error obteniendo estado de rate limit:', err)
    return res.status(500).json({
      success: false,
      message: err.message || 'Error obteniendo estado de rate limit'
    })
  }
})

/**
 * POST /api/whatsapp/test_word_document
 * Test de procesamiento de documentos Word
 */
router.post('/test_word_document', validateJwt, upload.single('document'), whatsappController.testWordDocument)

export default router
