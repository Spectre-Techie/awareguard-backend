/**
 * Payment Routes - Paystack Integration
 * Location: awareguard-backend/routes/payments.js
 * 
 * Handles all payment-related operations:
 * - Payment initialization
 * - Payment verification
 * - Webhook events
 * - Subscription management
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const authenticateToken = require('../middleware/auth');
const User = require('../models/User');

/**
 * POST /api/payments/initialize
 * Initialize a Paystack payment
 * 
 * Body:
 *   - amount (number): Amount in NGN
 *   - plan (string): 'monthly' or 'annual'
 * 
 * Returns:
 *   - authorization_url (string): URL to redirect user
 *   - access_code (string): Paystack access code
 *   - reference (string): Transaction reference
 */
router.post('/initialize', authenticateToken, async (req, res) => {
  try {
    const { amount, plan } = req.body;
    const user = req.user;

    // Validate input
    if (!amount || !plan) {
      return res.status(400).json({
        success: false,
        message: 'Amount and plan are required'
      });
    }

    if (!['monthly', 'annual'].includes(plan)) {
      return res.status(400).json({
        success: false,
        message: 'Plan must be monthly or annual'
      });
    }

    // Validate amount matches expected pricing
    const expectedAmounts = {
      monthly: 9999,
      annual: 99999
    };

    if (amount !== expectedAmounts[plan]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount for selected plan'
      });
    }

    // Generate unique reference
    const reference = `premium_${plan}_${user._id}_${Date.now()}`;

    // Initialize Paystack transaction
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: user.email,
        amount: amount * 100, // Convert to kobo
        currency: 'NGN',
        reference: reference,
        metadata: {
          userId: user._id.toString(),
          plan: plan,
          email: user.email
        }
      })
    });

    const data = await response.json();

    if (!data.status) {
      return res.status(400).json({
        success: false,
        message: 'Failed to initialize payment',
        error: data.message
      });
    }

    res.json({
      success: true,
      data: {
        authorization_url: data.data.authorization_url,
        access_code: data.data.access_code,
        reference: data.data.reference
      }
    });

  } catch (error) {
    console.error('Payment initialization error:', error);
    res.status(500).json({
      success: false,
      message: 'Error initializing payment',
      error: error.message
    });
  }
});

/**
 * GET /api/payments/verify/:reference
 * Verify Paystack payment and activate premium
 * 
 * Params:
 *   - reference (string): Paystack transaction reference
 * 
 * Returns:
 *   - success (boolean): Whether verification was successful
 *   - user (object): Updated user data
 */
router.get('/verify/:reference', authenticateToken, async (req, res) => {
  try {
    const { reference } = req.params;
    const userId = req.user._id;

    // Verify with Paystack API
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const paystackData = await response.json();

    if (!paystackData.status) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    const transaction = paystackData.data;

    // Verify transaction status
    if (transaction.status !== 'success') {
      return res.status(400).json({
        success: false,
        message: 'Payment was not successful',
        status: transaction.status
      });
    }

    // Verify user matches
    if (transaction.metadata?.userId !== userId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'User mismatch - payment does not match your account'
      });
    }

    // Verify amount matches expected
    const plan = transaction.metadata?.plan || 'monthly';
    const expectedAmounts = {
      monthly: 999900, // ₦9,999 in kobo
      annual: 9999900  // ₦99,999 in kobo
    };

    if (transaction.amount !== expectedAmounts[plan]) {
      return res.status(400).json({
        success: false,
        message: 'Payment amount mismatch'
      });
    }

    // Calculate subscription expiry
    let subscriptionExpiresAt = new Date();
    if (plan === 'monthly') {
      subscriptionExpiresAt.setMonth(subscriptionExpiresAt.getMonth() + 1);
    } else {
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
        lastPaymentAmount: transaction.amount / 100, // Store in Naira
        $push: {
          paymentHistory: {
            reference: reference,
            amount: transaction.amount / 100,
            date: new Date(),
            status: 'success',
            plan: plan
          }
        }
      },
      { new: true, select: 'email isPremium subscriptionPlan subscriptionExpiresAt' }
    );

    res.json({
      success: true,
      message: 'Premium subscription activated successfully!',
      data: {
        user: {
          email: updatedUser.email,
          isPremium: updatedUser.isPremium,
          subscriptionPlan: updatedUser.subscriptionPlan,
          subscriptionExpiresAt: updatedUser.subscriptionExpiresAt
        }
      }
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying payment',
      error: error.message
    });
  }
});

/**
 * POST /api/payments/webhook
 * Handle Paystack webhook events
 * 
 * Events processed:
 *   - charge.success
 *   - charge.failed
 */
router.post('/webhook', express.json(), async (req, res) => {
  try {
    // Verify webhook signature
    const signature = req.headers['x-paystack-signature'];
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== signature) {
      console.error('Invalid webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body;

    // Handle charge.success
    if (event.event === 'charge.success') {
      const transaction = event.data;
      const userId = transaction.metadata?.userId;
      const plan = transaction.metadata?.plan;

      if (!userId) {
        console.error('No userId in webhook metadata');
        return res.status(400).json({ error: 'Missing userId' });
      }

      // Calculate expiry
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
        lastPaymentAmount: transaction.amount / 100,
        $push: {
          paymentHistory: {
            reference: transaction.reference,
            amount: transaction.amount / 100,
            date: new Date(),
            status: 'success',
            plan: plan
          }
        }
      });

      console.log(`✅ Webhook: Payment successful for user ${userId}`);
    }

    // Handle charge.failed
    if (event.event === 'charge.failed') {
      const transaction = event.data;
      const userId = transaction.metadata?.userId;

      if (userId) {
        await User.findByIdAndUpdate(userId, {
          $push: {
            paymentHistory: {
              reference: transaction.reference,
              amount: transaction.amount / 100,
              date: new Date(),
              status: 'failed',
              plan: transaction.metadata?.plan
            }
          }
        });
      }

      console.log(`❌ Webhook: Payment failed - Reference: ${transaction.reference}`);
    }

    res.json({ status: 'success' });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/payments/subscription-status
 * Get current user subscription status
 * 
 * Returns:
 *   - isPremium (boolean)
 *   - subscriptionPlan (string)
 *   - subscriptionExpiresAt (date)
 *   - daysRemaining (number)
 */
router.get('/subscription-status', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      'isPremium subscriptionPlan subscriptionExpiresAt'
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if subscription expired
    if (user.isPremium && user.subscriptionExpiresAt) {
      if (new Date() > user.subscriptionExpiresAt) {
        user.isPremium = false;
        user.subscriptionPlan = 'none';
        await user.save();
      }
    }

    // Calculate days remaining
    let daysRemaining = 0;
    if (user.isPremium && user.subscriptionExpiresAt) {
      const msPerDay = 1000 * 60 * 60 * 24;
      daysRemaining = Math.ceil((user.subscriptionExpiresAt - new Date()) / msPerDay);
    }

    res.json({
      success: true,
      data: {
        isPremium: user.isPremium,
        subscriptionPlan: user.subscriptionPlan,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        daysRemaining: Math.max(0, daysRemaining)
      }
    });

  } catch (error) {
    console.error('Subscription status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching subscription status',
      error: error.message
    });
  }
});

/**
 * POST /api/payments/cancel-subscription
 * Cancel user premium subscription
 * 
 * Returns:
 *   - success (boolean)
 *   - message (string)
 */
router.post('/cancel-subscription', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        isPremium: false,
        subscriptionPlan: 'none',
        subscriptionExpiresAt: null,
        $push: {
          paymentHistory: {
            reference: `cancel_${req.user._id}_${Date.now()}`,
            date: new Date(),
            status: 'cancelled',
            amount: 0
          }
        }
      },
      { new: true, select: 'email isPremium subscriptionPlan' }
    );

    res.json({
      success: true,
      message: 'Subscription cancelled successfully',
      data: {
        user: {
          email: user.email,
          isPremium: user.isPremium,
          subscriptionPlan: user.subscriptionPlan
        }
      }
    });

  } catch (error) {
    console.error('Subscription cancellation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling subscription',
      error: error.message
    });
  }
});

export default router;
