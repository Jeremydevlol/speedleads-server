// dist/controllers/paymentController.js
import pool, { getUserById } from '../config/db.js';
import { stripe } from '../config/stripe.js';
import { getUserIdFromToken } from './authController.js';

/**
 * GET /api/payment/status
 */
export async function checkUserPaid(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  // 1) Usar nuestro propio sistema de autenticación JWT
  const userId = getUserIdFromToken(req);
  if (!userId) {
    return res.status(401).json({ error: 'No autenticado' })
  }

  // Forzar acceso permitido a funcionalidades (desactivar alerta de suscripción)
  return res.status(200).json({ hasPaid: true })

  try {
    // 2) Obtener usuario por ID usando nuestro sistema
    const { user } = await getUserById(userId);
    if (!user?.email) {
      console.error('Usuario no encontrado o sin email');
      return res.status(401).json({ error: 'Usuario no válido' });
    }
    const userEmail = user.email;

    // 3) Consulta SQL con manejo de errores específico para FDW
    let customerId = null;
    
    try {
      const { rows } = await pool.query(
        'SELECT id FROM public.customers WHERE email = $1 LIMIT 1',
        [userEmail]
      )
      
      if (rows.length > 0) {
        customerId = rows[0].id
      }
    } catch (dbError) {
      // Si es un error de FDW/vault, usar fallback de Stripe directo
      if (dbError.code === 'HV000' || dbError.message?.includes('vault')) {
        console.log('⚠️ FDW error, consultando Stripe directamente:', dbError.message)
        
        // Buscar customer directamente en Stripe por email
        const customers = await stripe.customers.list({
          email: userEmail,
          limit: 1
        })
        
        if (customers.data.length > 0) {
          customerId = customers.data[0].id
        }
      } else {
        throw dbError; // Re-lanzar si no es error de FDW
      }
    }

    if (!customerId) {
      console.log(`No existe un customer con email ${userEmail}`)
      return res.status(200).json({ hasPaid: false })
    }

    // 4) Listar suscripciones en Stripe
    const { data: subs } = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
    })

    // 5) Comprobar si alguna está activa o en trial
    const hasPaid = subs.some(s => ['active', 'trialing'].includes(s.status))

    return res.status(200).json({ hasPaid })
  } catch (err) {
    console.error('Error en checkUserPaid:', err)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}