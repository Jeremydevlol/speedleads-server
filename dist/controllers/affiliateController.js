// src/controllers/affiliateController.js
import { createStripeAccountLink, getStripeAccountStatus } from '../services/affiliateService.js';

export const createConnectAccount  = async (req, res) => {
  try {
    const { authUid, email } = req.body;

    if (!authUid || !email) {
      return res.status(400).json({ error: 'authUid y email son obligatorios.' });
    }

    const accountLink = await createStripeAccountLink(authUid, email);
    return res.status(200).json({ url: accountLink });
  } catch (error) {
    console.error('❌ Error creando cuenta connect:', error);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

export const getAccountStatus  = async (req, res) => {
  try {
    const { authUid } = req.params;

    if (!authUid) {
      return res.status(400).json({ error: 'authUid es requerido.' });
    }

    const account = await getStripeAccountStatus(authUid);
    return res.status(200).json({ account });
  } catch (error) {
    console.error('❌ Error obteniendo estado de cuenta connect:', error);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};
