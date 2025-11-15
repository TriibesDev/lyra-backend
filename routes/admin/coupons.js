/**
 * Admin Coupon Routes
 *
 * All routes require authentication and admin privileges
 * Base path: /api/admin/coupons
 */

const express = require('express');
const router = express.Router();
const couponService = require('../../services/couponService');
const { authenticateToken, requireAdmin } = require('../../middleware/auth'); // Adjust path as needed

// Apply authentication and admin middleware to all routes
router.use(authenticateToken);
router.use(requireAdmin);

// =====================================================
// GET /api/admin/coupons
// List all coupons with filters and pagination
// =====================================================
router.get('/', async (req, res) => {
  try {
    const filters = {
      search: req.query.search,
      tier: req.query.tier,
      active: req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined,
      archived: req.query.archived === 'true' ? true : req.query.archived === 'false' ? false : undefined,
      user_specific: req.query.user_specific === 'true' ? true : req.query.user_specific === 'false' ? false : undefined
    };

    const pagination = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50
    };

    const result = await couponService.getCoupons(filters, pagination);

    res.json({
      success: true,
      data: result.coupons,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch coupons'
    });
  }
});

// =====================================================
// GET /api/admin/coupons/statistics/overview
// Get overview statistics for all coupons
// =====================================================
router.get('/statistics/overview', async (req, res) => {
  try {
    const overview = await couponService.getCouponsOverview();

    res.json({
      success: true,
      data: overview
    });
  } catch (error) {
    console.error('Error fetching coupon overview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch coupon overview'
    });
  }
});

// =====================================================
// GET /api/admin/coupons/:couponId
// Get single coupon with full details
// =====================================================
router.get('/:couponId', async (req, res) => {
  try {
    const couponId = parseInt(req.params.couponId);

    if (isNaN(couponId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid coupon ID'
      });
    }

    const coupon = await couponService.getCouponById(couponId);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        error: 'Coupon not found'
      });
    }

    res.json({
      success: true,
      data: coupon
    });
  } catch (error) {
    console.error('Error fetching coupon:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch coupon'
    });
  }
});

// =====================================================
// POST /api/admin/coupons
// Create new coupon
// =====================================================
router.post('/', async (req, res) => {
  try {
    const couponData = {
      code: req.body.code,
      name: req.body.name,
      description: req.body.description,
      discount_type: req.body.discount_type,
      discount_value: req.body.discount_value,
      applies_to: req.body.applies_to,
      max_uses: req.body.max_uses,
      max_uses_per_user: req.body.max_uses_per_user,
      valid_from: req.body.valid_from,
      valid_until: req.body.valid_until,
      user_specific: req.body.user_specific,
      allowed_user_ids: req.body.allowed_user_ids,
      tier: req.body.tier
    };

    const createdBy = req.user.user_id; // From auth middleware

    const newCoupon = await couponService.createCoupon(couponData, createdBy);

    res.status(201).json({
      success: true,
      data: newCoupon,
      message: 'Coupon created successfully'
    });
  } catch (error) {
    console.error('Error creating coupon:', error);

    if (error.message === 'Missing required fields') {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    if (error.message === 'A coupon with this code already exists') {
      return res.status(409).json({
        success: false,
        error: error.message
      });
    }

    if (error.message.includes('discount')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create coupon'
    });
  }
});

// =====================================================
// PUT /api/admin/coupons/:couponId
// Update existing coupon
// =====================================================
router.put('/:couponId', async (req, res) => {
  try {
    const couponId = parseInt(req.params.couponId);

    if (isNaN(couponId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid coupon ID'
      });
    }

    const couponData = {
      name: req.body.name,
      description: req.body.description,
      discount_type: req.body.discount_type,
      discount_value: req.body.discount_value,
      applies_to: req.body.applies_to,
      max_uses: req.body.max_uses,
      max_uses_per_user: req.body.max_uses_per_user,
      valid_from: req.body.valid_from,
      valid_until: req.body.valid_until,
      user_specific: req.body.user_specific,
      allowed_user_ids: req.body.allowed_user_ids,
      tier: req.body.tier,
      is_active: req.body.is_active
    };

    const updatedCoupon = await couponService.updateCoupon(couponId, couponData);

    res.json({
      success: true,
      data: updatedCoupon,
      message: 'Coupon updated successfully'
    });
  } catch (error) {
    console.error('Error updating coupon:', error);

    if (error.message === 'Coupon not found') {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update coupon'
    });
  }
});

// =====================================================
// DELETE /api/admin/coupons/:couponId
// Archive coupon (soft delete)
// =====================================================
router.delete('/:couponId', async (req, res) => {
  try {
    const couponId = parseInt(req.params.couponId);

    if (isNaN(couponId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid coupon ID'
      });
    }

    const archivedBy = req.user.user_id;

    const archivedCoupon = await couponService.archiveCoupon(couponId, archivedBy);

    res.json({
      success: true,
      data: archivedCoupon,
      message: 'Coupon archived successfully'
    });
  } catch (error) {
    console.error('Error archiving coupon:', error);

    if (error.message === 'Coupon not found or already archived') {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to archive coupon'
    });
  }
});

// =====================================================
// POST /api/admin/coupons/:couponId/restore
// Restore archived coupon
// =====================================================
router.post('/:couponId/restore', async (req, res) => {
  try {
    const couponId = parseInt(req.params.couponId);

    if (isNaN(couponId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid coupon ID'
      });
    }

    const restoredCoupon = await couponService.restoreCoupon(couponId);

    res.json({
      success: true,
      data: restoredCoupon,
      message: 'Coupon restored successfully'
    });
  } catch (error) {
    console.error('Error restoring coupon:', error);

    if (error.message === 'Coupon not found or not archived') {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to restore coupon'
    });
  }
});

// =====================================================
// GET /api/admin/coupons/:couponId/statistics
// Get detailed statistics for a specific coupon
// =====================================================
router.get('/:couponId/statistics', async (req, res) => {
  try {
    const couponId = parseInt(req.params.couponId);

    if (isNaN(couponId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid coupon ID'
      });
    }

    const statistics = await couponService.getCouponStatistics(couponId);

    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    console.error('Error fetching coupon statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch coupon statistics'
    });
  }
});

module.exports = router;
