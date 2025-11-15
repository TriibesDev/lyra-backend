/**
 * Public Coupon Routes
 *
 * Routes for coupon validation and application during checkout
 * Base path: /api/coupons
 */

const express = require('express');
const router = express.Router();
const couponService = require('../services/couponService');
const { authenticateToken } = require('../middleware/auth'); // Adjust path as needed

// =====================================================
// POST /api/coupons/validate
// Validate a coupon code for the current user
// =====================================================
router.post('/validate', authenticateToken, async (req, res) => {
  try {
    const { code, subscription_type } = req.body;
    const userId = req.user.user_id; // From auth middleware

    // Validation
    if (!code || !subscription_type) {
      return res.status(400).json({
        success: false,
        error: 'Coupon code and subscription type are required'
      });
    }

    if (!['monthly', 'annual'].includes(subscription_type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid subscription type. Must be "monthly" or "annual"'
      });
    }

    // Validate the coupon
    const validationResult = await couponService.validateCoupon(
      code,
      userId,
      subscription_type
    );

    if (!validationResult.valid) {
      return res.status(400).json({
        success: false,
        valid: false,
        error: validationResult.error
      });
    }

    // Return successful validation with pricing details
    res.json({
      success: true,
      valid: true,
      coupon: validationResult.coupon,
      pricing: validationResult.pricing
    });

  } catch (error) {
    console.error('Error validating coupon:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate coupon'
    });
  }
});

// =====================================================
// POST /api/coupons/apply
// Apply coupon to subscription during checkout
// Records usage and returns final pricing
// =====================================================
router.post('/apply', authenticateToken, async (req, res) => {
  try {
    const {
      code,
      subscription_type,
      stripe_subscription_id,
      stripe_payment_intent_id,
      stripe_coupon_id
    } = req.body;

    const userId = req.user.user_id;

    // Validation
    if (!code || !subscription_type) {
      return res.status(400).json({
        success: false,
        error: 'Coupon code and subscription type are required'
      });
    }

    if (!['monthly', 'annual'].includes(subscription_type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid subscription type. Must be "monthly" or "annual"'
      });
    }

    // First validate the coupon
    const validationResult = await couponService.validateCoupon(
      code,
      userId,
      subscription_type
    );

    if (!validationResult.valid) {
      return res.status(400).json({
        success: false,
        error: validationResult.error
      });
    }

    // Record the coupon usage
    const stripeData = {
      subscription_id: stripe_subscription_id,
      payment_intent_id: stripe_payment_intent_id,
      coupon_id: stripe_coupon_id
    };

    const metadata = {
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent')
    };

    await couponService.recordCouponUsage(
      validationResult.coupon.id,
      userId,
      subscription_type,
      validationResult.pricing,
      stripeData,
      metadata
    );

    // Return success with final pricing
    res.json({
      success: true,
      message: 'Coupon applied successfully',
      coupon: validationResult.coupon,
      pricing: validationResult.pricing
    });

  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to apply coupon'
    });
  }
});

module.exports = router;
