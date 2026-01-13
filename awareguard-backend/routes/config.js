// awareguard-backend/routes/config.js
import express from 'express';

const router = express.Router();

/**
 * GET /api/config/paystack
 * Returns public Paystack configuration for frontend
 * This is safe to expose publicly
 */
router.get('/paystack', (req, res) => {
    res.json({
        publicKey: process.env.PAYSTACK_PUBLIC_KEY,
        monthlyAmount: 9999,
        annualAmount: 99999
    });
});

export default router;
