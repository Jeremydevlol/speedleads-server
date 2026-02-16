import express from 'express';

const router = express.Router();

// Webhook endpoints
router.post('/stripe', async (req, res) => {
  try {
    // Stripe webhook handling
    console.log('Stripe webhook received:', req.body);
    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

router.post('/telegram', async (req, res) => {
  try {
    // Telegram webhook handling
    console.log('Telegram webhook received:', req.body);
    res.json({ received: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router; 