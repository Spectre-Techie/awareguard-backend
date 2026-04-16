/**
 * payments.js - Payment API Routes
 * Location: awareguard-backend/routes/api/payments.js
 * 
 * Endpoints:
 * GET  /api/verify-payment/:reference - Verify Paystack payment and activate premium
 * POST /api/paystack-webhook - Receive webhook events from Paystack
 * GET  /api/subscription-status - Get current user subscription status
 * POST /api/cancel-subscription - Cancel user subscription
 */

import express from 'express';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { PaymentTransaction } from '../models/PaymentTransaction.js';
import { authMiddleware } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/verify-payment/:reference
 * Verify Paystack payment and activate premium subscription
 */
router.get('/verify-payment/:reference', authMiddleware, async (req, res) => {
  try {
    const { reference } = req.params;
    const userId = req.user.id; // From auth middleware

    // ===== IDEMPOTENCY CHECK =====
    const existing = await PaymentTransaction.findOne({ reference });
    if (existing) {
      logger.info('Payment already processed (idempotent)', { reference, userId });
      return res.json({
        success: true,
        message: 'Payment already processed',
        idempotent: true
      });
    }

    // Verify with Paystack API
    const paystackResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    ).then(res => res.json());

    if (!paystackResponse.status) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    const transaction = paystackResponse.data;

    // Verify transaction status
    if (transaction.status !== 'success') {
      return res.status(400).json({
        success: false,
        message: 'Payment was not successful'
      });
    }

    // Verify amount (check if it matches expected)
    const expectedAmounts = {
      monthly: 500000, // ₦5,000 in kobo
      annual: 5000000  // ₦50,000 in kobo
    };

    const plan = transaction.metadata?.plan || 'monthly';
    const expectedAmount = expectedAmounts[plan];

    if (transaction.amount !== expectedAmount) {
      logger.warn('Payment amount mismatch', { expected: expectedAmount, actual: transaction.amount, reference });
      return res.status(400).json({
        success: false,
        message: 'Payment amount mismatch'
      });
    }

    // Verify user matches
    if (transaction.metadata?.userId && transaction.metadata.userId !== userId) {
      logger.warn('Payment user mismatch', { tokenUser: userId, paymentUser: transaction.metadata.userId, reference });
      return res.status(400).json({
        success: false,
        message: 'User mismatch - payment does not match your account'
      });
    }

    // Calculate subscription expiry date
    let subscriptionExpiresAt = new Date();
    if (plan === 'monthly') {
      subscriptionExpiresAt.setMonth(subscriptionExpiresAt.getMonth() + 1);
    } else if (plan === 'annual') {
      subscriptionExpiresAt.setFullYear(subscriptionExpiresAt.getFullYear() + 1);
    }

    // Update user with premium status
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        isPremium: true,
        subscriptionPlan: plan,
        subscriptionExpiresAt: subscriptionExpiresAt,
        subscriptionStartedAt: new Date(),
        paystackReference: reference,
        lastPaymentAmount: transaction.amount / 100 // Store in Naira
      },
      { new: true, select: 'id email isPremium subscriptionPlan subscriptionExpiresAt' }
    );

    // Record the transaction
    await PaymentTransaction.create({
      reference,
      userId,
      amount: transaction.amount,
      plan,
      status: 'success',
      source: 'verify',
      paystackData: transaction
    });

    logger.info('Payment verified and premium activated', { userId, reference, plan });

    res.json({
      success: true,
      message: 'Premium subscription activated successfully!',
      user: {
        id: updatedUser._id,
        email: updatedUser.email,
        isPremium: updatedUser.isPremium,
        subscriptionPlan: updatedUser.subscriptionPlan,
        subscriptionExpiresAt: updatedUser.subscriptionExpiresAt
      }
    });

  } catch (error) {
    logger.error('Payment verification error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Internal server error during verification'
    });
  }
});

/**
 * POST /api/paystack-webhook
 * Receive and process webhook events from Paystack
 */
router.post('/paystack-webhook', async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing signature' });
    }

    // Use raw body (Buffer) for accurate HMAC comparison
    const rawBody = req.body;
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(rawBody)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature))) {
      logger.warn('Invalid Paystack webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(rawBody.toString());

    // Check for idempotency (only for charge.success)
    if (event.event === 'charge.success') {
      const existing = await PaymentTransaction.findOne({ reference: event.data.reference });
      if (existing) {
        return res.status(200).send('Event already processed');
      }

      const { reference, metadata, amount } = event.data;
      const userId = metadata?.userId;
      const plan = metadata?.plan || 'monthly';

      // Store transaction first to prevent duplicate processing
      await PaymentTransaction.create({
        reference,
        userId: userId || null,
        amount,
        plan,
        status: 'success',
        source: 'webhook',
        paystackData: event.data
      });

      if (userId) {
        // Calculate expiry
        let subscriptionExpiresAt = new Date();
        if (plan === 'monthly') {
          subscriptionExpiresAt.setMonth(subscriptionExpiresAt.getMonth() + 1);
        } else if (plan === 'annual') {
          subscriptionExpiresAt.setFullYear(subscriptionExpiresAt.getFullYear() + 1);
        }

        // Update user
        await User.findByIdAndUpdate(userId, {
          isPremium: true,
          subscriptionPlan: plan,
          subscriptionExpiresAt,
          subscriptionStartedAt: new Date(),
          paystackReference: reference,
          lastPaymentAmount: amount / 100
        });

        logger.info('Webhook: Premium activated', { userId, reference });
      } else {
        logger.warn('Webhook: Missing userId in metadata', { reference });
      }
    } else if (event.event === 'charge.failed') {
      logger.info(`Webhook: Payment failed`, { reference: event.data.reference });
    }

    res.sendStatus(200);
  } catch (error) {
    logger.error('Webhook error', { error: error.message, stack: error.stack });
    res.sendStatus(500);
  }
});

/**
 * GET /api/subscription-status
 * Get current user's subscription status
 */
router.get('/subscription-status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select(
      'isPremium subscriptionPlan subscriptionExpiresAt'
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if subscription has expired
    if (user.isPremium && user.subscriptionExpiresAt) {
      if (new Date() > user.subscriptionExpiresAt) {
        // Subscription expired, downgrade user
        user.isPremium = false;
        await user.save();
      }
    }

    // Calculate days remaining
    let daysRemaining = 0;
    if (user.isPremium && user.subscriptionExpiresAt) {
      daysRemaining = Math.ceil(
        (user.subscriptionExpiresAt - new Date()) / (1000 * 60 * 60 * 24)
      );
    }

    res.json({
      isPremium: user.isPremium,
      subscriptionPlan: user.subscriptionPlan,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      daysRemaining: Math.max(0, daysRemaining)
    });

  } catch (error) {
    logger.error('Subscription status error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to fetch subscription status' });
  }
});

/**
 * POST /api/cancel-subscription
 * Cancel user's premium subscription
 */
router.post('/cancel-subscription', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        isPremium: false,
        subscriptionPlan: null,
        subscriptionExpiresAt: null
      },
      { new: true, select: 'id email isPremium' }
    );

    logger.info('Subscription cancelled', { userId });

    res.json({
      success: true,
      message: 'Subscription cancelled successfully',
      user: {
        id: user._id,
        email: user.email,
        isPremium: user.isPremium
      }
    });

  } catch (error) {
    logger.error('Subscription cancellation error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to cancel subscription'
    });
  }
});

export default router;
