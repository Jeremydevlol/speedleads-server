
import { Router } from 'express'
import {
  getConversations,
  getMessages,
  deleteConversation,
} from '../controllers/chatController.js'
import { setConversationPersonality } from '../controllers/personalityController.js'
import { validateJwt } from '../middlewares/authMiddleware.js'

const router = Router()

// Rutas de chat/WhatsApp
router.get(
  '/get_conversations',
  validateJwt,
  (req, res) => getConversations(req, res)
)
router.get(
  '/get_messages',
  validateJwt,
  (req, res) => getMessages(req, res)
)
router.post(
  '/delete_conversation',
  validateJwt,
  (req, res) => deleteConversation(req, res)
)

// Nueva ruta para asignar personalidad a la conversación
router.post(
  '/set_conversation_personality',
  validateJwt,
  (req, res) => setConversationPersonality(req, res)
)

export default router
