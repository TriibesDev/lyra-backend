const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// 💡 FIX: Destructure the import to get the authenticateToken function
const { authenticateToken } = require('../middleware/auth');
const db = require('../db'); // Assuming you have a db connection file

// POST /api/subscriptions/
// 💡 FIX: Use the authenticateToken function as middleware
router.post('/', authenticateToken, async (req, res) => {
  const { paymentMethodId, priceId, planType, specialAccessDuration } = req.body;
  const { user_id: userId, email } = req.user; // Get user_id and email from the token

  try {
    console.log('Creating subscription for user:', userId, 'Plan type:', planType);

    // Check if user already has a Stripe customer ID
    const userResult = await db.query('SELECT stripe_customer_id FROM users WHERE user_id = $1', [userId]);
    let customerId = userResult.rows[0]?.stripe_customer_id;

    // If no customer ID, create a new one in Stripe
    if (!customerId) {
        const customer = await stripe.customers.create({
            payment_method: paymentMethodId,
            email: email,
            invoice_settings: {
                default_payment_method: paymentMethodId,
            },
        });
        customerId = customer.id;
        // Save the new customer ID to your database
        await db.query('UPDATE users SET stripe_customer_id = $1 WHERE user_id = $2', [customerId, userId]);
    } else {
        // If customer exists, attach the new payment method
        await stripe.paymentMethods.attach(paymentMethodId, {
            customer: customerId,
        });
        await stripe.customers.update(customerId, {
            invoice_settings: {
                default_payment_method: paymentMethodId,
            },
        });
    }

    console.log('Using Stripe customer ID:', customerId);

    let subscriptionId = null;
    let clientSecret = null;
    let status = 'active';

    // Handle lifetime plans differently (one-time payment, no recurring subscription)
    if (planType === 'lifetime') {
      // Create a one-time payment intent instead of subscription
      const paymentIntent = await stripe.paymentIntents.create({
        amount: getPlanAmount(priceId), // You'll need to define this
        currency: 'usd',
        customer: customerId,
        payment_method: paymentMethodId,
        confirm: true,
        metadata: {
          user_id: userId,
          plan_type: 'lifetime'
        }
      });

      clientSecret = paymentIntent.client_secret;
      status = paymentIntent.status === 'succeeded' ? 'active' : paymentIntent.status;
    } else {
      // Create recurring subscription for other plan types
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          plan_type: planType
        }
      });

      subscriptionId = subscription.id;
      clientSecret = subscription.latest_invoice?.payment_intent?.client_secret;
      status = subscription.status;

      console.log('Created subscription:', subscription.id);
    }

    // Calculate special access end date for time-limited plans
    let specialAccessEndDate = null;
    if (['special', 'educator', 'student'].includes(planType) && specialAccessDuration) {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + specialAccessDuration); // duration in days
      specialAccessEndDate = endDate;
    }

    // Update user's subscription info in database
    const updateQuery = `
      UPDATE users
      SET subscription_status = $1,
          subscription_tier = $2,
          stripe_subscription_id = $3,
          stripe_price_id = $4,
          special_access_end_date = $5
      WHERE user_id = $6
    `;

    await db.query(updateQuery, [
      status,
      planType,
      subscriptionId,
      priceId,
      specialAccessEndDate,
      userId
    ]);

    console.log(`Updated user ${userId} to tier ${planType} with status ${status}`);

    res.json({
        subscriptionId,
        clientSecret,
        status,
        planType,
        specialAccessEndDate
    });

  } catch (error) {
    console.error('Stripe error:', error);
    res.status(400).send({ error: { message: error.message } });
  }
});

// Helper function to get plan amount (you'll need to configure this based on your pricing)
function getPlanAmount(priceId) {
  // Map price IDs to amounts (in cents)
  const priceMap = {
    // Add your Stripe price IDs and amounts here
    // Example: 'price_lifetime_id': 29900, // $299.00
  };
  return priceMap[priceId] || 0;
}

// GET /api/subscriptions/current
// Get current user's subscription details
router.get('/current', authenticateToken, async (req, res) => {
  const { user_id: userId } = req.user;

  try {
    const result = await db.query(`
      SELECT
        subscription_status,
        subscription_tier,
        stripe_subscription_id,
        stripe_price_id,
        special_access_end_date,
        trial_end_date,
        trial_started_at
      FROM users
      WHERE user_id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const subscription = result.rows[0];

    // Check if special access has expired
    if (subscription.special_access_end_date) {
      const now = new Date();
      const endDate = new Date(subscription.special_access_end_date);
      subscription.is_expired = now > endDate;
    }

    res.json(subscription);
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/subscriptions/cancel
// Cancel a subscription
router.post('/cancel', authenticateToken, async (req, res) => {
  const { user_id: userId } = req.user;

  try {
    const userResult = await db.query(
      'SELECT stripe_subscription_id, subscription_tier FROM users WHERE user_id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { stripe_subscription_id, subscription_tier } = userResult.rows[0];

    // Lifetime plans can't be cancelled (they're already paid)
    if (subscription_tier === 'lifetime') {
      return res.status(400).json({ error: 'Lifetime subscriptions cannot be cancelled' });
    }

    if (!stripe_subscription_id) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    // Cancel the Stripe subscription
    const subscription = await stripe.subscriptions.cancel(stripe_subscription_id);

    // Update database
    await db.query(
      'UPDATE users SET subscription_status = $1 WHERE user_id = $2',
      ['cancelled', userId]
    );

    res.json({ message: 'Subscription cancelled successfully', subscription });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/subscriptions/grant-special-access (Admin only)
// Grant special access to a user (educator, student, or special plan)
router.post('/grant-special-access', authenticateToken, async (req, res) => {
  const { user_id: adminUserId, role } = req.user;
  const { userId, planType, durationDays } = req.body;

  // Check if requester is admin
  if (role !== 'admin' && role !== 'superadmin') {
    return res.status(403).json({ error: 'Unauthorized. Admin access required.' });
  }

  // Validate plan type
  if (!['special', 'educator', 'student'].includes(planType)) {
    return res.status(400).json({ error: 'Invalid plan type for special access' });
  }

  try {
    // Calculate end date
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + durationDays);

    // Update user
    await db.query(`
      UPDATE users
      SET subscription_status = 'active',
          subscription_tier = $1,
          special_access_end_date = $2
      WHERE user_id = $3
    `, [planType, endDate, userId]);

    console.log(`Admin ${adminUserId} granted ${planType} access to user ${userId} until ${endDate}`);

    res.json({
      message: 'Special access granted successfully',
      planType,
      endDate
    });
  } catch (error) {
    console.error('Error granting special access:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/subscriptions/plans
// Get available subscription plans (configure this with your Stripe product/price IDs)
router.get('/plans', async (req, res) => {
  try {
    const plans = [
      {
        id: 'trial',
        name: 'Free Trial',
        description: '14-day free trial with full access',
        price: 0,
        duration: '14 days',
        features: ['Full access to all features', 'No credit card required']
      },
      {
        id: 'monthly',
        name: 'Monthly Plan',
        description: 'Billed monthly',
        price: 9.99,
        priceId: process.env.STRIPE_PRICE_MONTHLY, // Set this in your .env
        duration: 'per month',
        features: ['Full access to all features', 'Cancel anytime']
      },
      {
        id: 'annual',
        name: 'Annual Plan',
        description: 'Billed annually - Save 20%',
        price: 95.88,
        priceId: process.env.STRIPE_PRICE_ANNUAL, // Set this in your .env
        duration: 'per year',
        features: ['Full access to all features', '2 months free', 'Priority support']
      },
      {
        id: 'lifetime',
        name: 'Lifetime Access',
        description: 'One-time payment, lifetime access',
        price: 299,
        priceId: process.env.STRIPE_PRICE_LIFETIME, // Set this in your .env
        duration: 'one-time',
        features: ['Lifetime access', 'All future updates', 'Priority support', 'Best value']
      }
    ];

    res.json(plans);
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;