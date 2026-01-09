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
import { auth } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/verify-payment/:reference
 * Verify Paystack payment and activate premium subscription
 * 
 * Params:
 *   - reference (string): Paystack transaction reference
 * 
 * Headers:
 *   - Authorization: Bearer {token}
 * 
 * Returns:
 *   - success (boolean): Whether verification was successful
 *   - message (string): Response message
 *   - user (object): Updated user data
 */
router.get('/verify-payment/:reference', auth, async (req, res) => {
  try {
    const { reference } = req.params;
    const userId = req.user.id; // From auth middleware

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
      monthly: 999900, // ₦9,999 in kobo
      annual: 9999900  // ₦99,999 in kobo
    };

    const plan = transaction.metadata?.plan || 'monthly';
    const expectedAmount = expectedAmounts[plan];

    if (transaction.amount !== expectedAmount) {
      return res.status(400).json({
        success: false,
        message: 'Payment amount mismatch'
      });
    }

    // Verify user matches
    if (transaction.metadata?.userId !== userId) {
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
    console.error('Payment verification error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/paystack-webhook
 * Receive and process webhook events from Paystack
 * 
 * Body: Paystack webhook event (JSON)
 * 
 * Events processed:
 *   - charge.success: Update user premium status
 *   - charge.failed: Log payment failure
 */
router.post('/paystack-webhook', express.json(), async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    const body = JSON.stringify(req.body);

    // Verify webhook signature
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(body)
      .digest('hex');

    if (hash !== signature) {
      console.error('Invalid webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body;

    // Handle charge.success event
    if (event.event === 'charge.success') {
      const transaction = event.data;
      const userId = transaction.metadata?.userId;
      const plan = transaction.metadata?.plan || 'monthly';

      if (!userId) {
        console.error('No userId in webhook metadata');
        return res.status(400).json({ error: 'Missing userId' });
      }

      // Calculate expiry date
      let expiryDate = new Date();
      if (plan === 'monthly') {
        expiryDate.setMonth(expiryDate.getMonth() + 1);
      } else {
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      }

      // Update user
      await User.findByIdAndUpdate(userId, {
        isPremium: true,
        subscriptionPlan: plan,
        subscriptionExpiresAt: expiryDate,
        subscriptionStartedAt: new Date(),
        paystackReference: transaction.reference,
        lastPaymentAmount: transaction.amount / 100
      });

      console.log(`✅ Webhook: Payment successful for user ${userId} - Reference: ${transaction.reference}`);
    }

    // Handle charge.failed event
    if (event.event === 'charge.failed') {
      console.log(`❌ Webhook: Payment failed - Reference: ${event.data.reference}`);
    }

    // Always return success to acknowledge receipt
    res.json({ status: 'success', message: 'Webhook processed' });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/subscription-status
 * Get current user's subscription status
 * 
 * Headers:
 *   - Authorization: Bearer {token}
 * 
 * Returns:
 *   - isPremium (boolean): Current premium status
 *   - subscriptionPlan (string): 'monthly' or 'annual'
 *   - subscriptionExpiresAt (date): When subscription expires
 *   - daysRemaining (number): Days until expiration
 */
router.get('/subscription-status', auth, async (req, res) => {
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
    console.error('Subscription status error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/cancel-subscription
 * Cancel user's premium subscription
 * 
 * Headers:
 *   - Authorization: Bearer {token}
 * 
 * Returns:
 *   - success (boolean): Whether cancellation was successful
 *   - message (string): Confirmation message
 */
router.post('/cancel-subscription', auth, async (req, res) => {
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
    console.error('Subscription cancellation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
