import qrcode from 'qrcode'
import pkg from 'whatsapp-web.js'
import pool from '../config/db.js'
import { getUserIdFromToken } from './authController.js'
const { Client, LocalAuth } = pkg

// Configuración del cliente WhatsApp
const whatsappClient = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process',
      '--no-zygote',
      '--disable-gpu',
      '--disable-software-rasterizer',
    ],
    timeout: 60000,
  },
})

// Variables de estado
let isInitializing = false
let isClientReady = false
let qrCode = null

// Función de inicialización segura
const safeInitialize = async () => {
  if (isInitializing) return
  isInitializing = true

  try {
    await whatsappClient.initialize()
    console.log('✅ Cliente de WhatsApp inicializado')
  } catch (error) {
    console.error('❌ Error de inicialización:', error)
    await handleClientError(error)
    setTimeout(safeInitialize, 10000)
  } finally {
    isInitializing = false
  }
}

const handleClientError = async (error) => {
  try {
    await whatsappClient.destroy()
    console.log('🔁 Reiniciando cliente...')
  } catch (e) {
    console.error('❌ Error al destruir cliente:', e)
  }
}

whatsappClient.on('disconnected', async (reason) => {
  console.warn('⚠️ Cliente desconectado:', reason)
  isClientReady = false
  await safeInitialize()
})

whatsappClient.on('qr', (qr) => {
  qrCode = qr
  console.log('🔑 Nuevo código QR generado')
})

whatsappClient.on('ready', () => {
  isClientReady = true
  console.log('✅ WhatsApp conectado y listo')
})

whatsappClient.on('auth_failure', (msg) => {
  console.error('❌ Fallo de autenticación:', msg)
  isClientReady = false
})

// Inicializar al cargar el controlador
safeInitialize().catch((error) => {
  console.error('❌ Error en inicialización inicial:', error)
})

// -----------------------------------------
// CONTROLADORES
// -----------------------------------------

// Obtener código QR
export const getQrCode = async (req, res) => {
  try {
    // ✅ CORREGIDO: Primero verificar si hay QR disponible
    if (qrCode) {
      // Hay QR disponible - enviarlo
      const qrImage = await qrcode.toDataURL(qrCode)
      return res.json({
        success: true,
        data: { qr: qrImage },
        message: 'Escanea este código QR con WhatsApp'
      })
    }

    // Si no hay QR pero el cliente está listo = ya conectado
    if (isClientReady) {
      return res.json({
        success: true,
        message: 'WhatsApp ya está conectado',
        data: { qr: null },
      })
    }

    // Si no hay QR y cliente no está listo = inicializando
    return res.status(503).json({
      success: false,
      message: 'Cliente de WhatsApp inicializando. Intente en unos segundos.',
    })
    
  } catch (error) {
    console.error('📵 Error QR:', error)
    res.status(500).json({
      success: false,
      message: 'Error al generar código QR',
    })
  }
}

// Obtener todas las conversaciones
export const getConversations = async (req, res) => {
  try {
    if (!isClientReady) {
      return res.status(503).json({
        success: false,
        message: 'Cliente de WhatsApp no disponible',
      })
    }

    const chats = await whatsappClient.getChats()
    const simplified = chats.map((chat) => ({
      id: chat.id._serialized,
      name: chat.name || chat.formattedTitle || chat.id.user,
    }))

    res.json({
      success: true,
      data: simplified,
    })
  } catch (error) {
    console.error('💬 Error obteniendo conversaciones:', error)
    res.status(500).json({
      success: false,
      message: 'Error al obtener conversaciones',
    })
  }
}

// Obtener mensajes de una conversación
export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.query  // Ajusta según tu front (query param)

    if (!isClientReady) {
      return res.status(503).json({
        success: false,
        message: 'Cliente de WhatsApp no disponible',
      })
    }

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere ID de conversación',
      })
    }

    const chat = await whatsappClient.getChatById(conversationId)
    const messages = await chat.fetchMessages({ limit: 50 })

    const formatted = messages.map((msg) => ({
      id: msg.id._serialized,
      fromMe: msg.fromMe,
      body: msg.body,
      timestamp: msg.timestamp,
    }))

    res.json({
      success: true,
      data: formatted,
    })
  } catch (error) {
    console.error('📨 Error obteniendo mensajes:', error)
    res.status(500).json({
      success: false,
      message: 'Error al obtener mensajes',
    })
  }
}

// Enviar mensaje
export const sendMessage = async (req, res) => {
  try {
    const { to, text, media, personalityId } = req.body

    if (!isClientReady) {
      return res.status(503).json({
        success: false,
        message: 'Cliente de WhatsApp no disponible',
      })
    }

    if (!to || !text) {
      return res.status(400).json({
        success: false,
        message: 'Se requieren el destino (to) y el texto (text)',
      })
    }

    // Aquí podrías usar personalityId para lógica extra (IA), si corresponde
    // Por ejemplo, buscar la personalidad en tu DB y generar respuesta
    // Sin embargo, la implementación exacta depende de tu flujo.

    // Enviar mensaje de texto simple (o con media)
    // Si hubiera archivos, usar processMediaArray y client.sendMessage con media.
    const sentMessage = await whatsappClient.sendMessage(to, text)
    // (Podrías manejar attachments también)

    res.json({
      success: true,
      data: { message: sentMessage.body },
    })
  } catch (error) {
    console.error('✉️ Error enviando mensaje:', error)
    res.status(500).json({
      success: false,
      message: 'Error al enviar mensaje',
    })
  }
}

// Eliminar conversación
export const deleteConversation = async (req, res) => {
  try {
    const userId = getUserIdFromToken(req)
    const { conversationId } = req.body

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere ID de conversación',
      })
    }

    // Elimina registros de tu BD
    await pool.query('DELETE FROM messages_new WHERE conversation_id = $1 AND user_id = $2', [
      conversationId,
      userId,
    ])

    res.json({
      success: true,
      message: 'Conversación eliminada correctamente',
    })
  } catch (error) {
    console.error('🗑️ Error eliminando conversación:', error)
    res.status(500).json({
      success: false,
      message: 'Error al eliminar conversación',
    })
  }
}

// Activar IA
export const activateAI = (req, res) => {
  res.json({
    success: true,
    message: 'IA activada para la conversación',
  })
}

// Desactivar IA
export const deactivateAI = (req, res) => {
  res.json({
    success: true,
    message: 'IA desactivada para la conversación',
  })
}

export default {
  getQrCode,
  getConversations,
  getMessages,
  sendMessage,
  deleteConversation,
  activateAI,
  deactivateAI,
}

