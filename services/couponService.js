/**
 * Coupon Service
 *
 * Business logic layer for coupon management and validation
 * Handles all database operations and validation rules for coupons
 */

const db = require('../db'); // Database connection

// =====================================================
// Subscription Price Configuration
// =====================================================
const SUBSCRIPTION_PRICES = {
  monthly: 11.00,
  annual: 99.00,
  trial: 0.00
};

// =====================================================
// Coupon Validation
// =====================================================

/**
 * Validate a coupon code for a specific user and subscription type
 * @param {string} code - Coupon code to validate
 * @param {number} userId - User ID attempting to use the coupon
 * @param {string} subscriptionType - 'monthly' or 'annual'
 * @returns {Object} Validation result with discount details or error
 */
async function validateCoupon(code, userId, subscriptionType) {
  try {
    // Fetch coupon from database
    const result = await db.query(
      `SELECT * FROM coupons
       WHERE UPPER(code) = UPPER($1)
       AND is_active = true
       AND is_archived = false`,
      [code]
    );

    if (result.rows.length === 0) {
      return { valid: false, error: 'Invalid coupon code' };
    }

    const coupon = result.rows[0];

    // Check validity period
    const now = new Date();
    if (coupon.valid_from && now < new Date(coupon.valid_from)) {
      return {
        valid: false,
        error: `Coupon is not valid until ${new Date(coupon.valid_from).toLocaleDateString()}`
      };
    }
    if (coupon.valid_until && now > new Date(coupon.valid_until)) {
      return {
        valid: false,
        error: 'Coupon has expired'
      };
    }

    // Check global usage limits
    if (coupon.max_uses && coupon.current_uses >= coupon.max_uses) {
      return {
        valid: false,
        error: 'Coupon usage limit has been reached'
      };
    }

    // Check user-specific restrictions
    if (coupon.user_specific) {
      if (!coupon.allowed_user_ids || !coupon.allowed_user_ids.includes(userId)) {
        return {
          valid: false,
          error: 'This coupon is not available to your account'
        };
      }
    }

    // Check per-user usage limit
    const userUsageCount = await getUserCouponUsageCount(coupon.coupon_id, userId);
    if (userUsageCount >= coupon.max_uses_per_user) {
      return {
        valid: false,
        error: 'You have already used this coupon the maximum number of times'
      };
    }

    // Check subscription type applicability
    if (coupon.applies_to !== 'all' && coupon.applies_to !== subscriptionType) {
      return {
        valid: false,
        error: `This coupon only applies to ${coupon.applies_to} subscriptions`
      };
    }

    // Calculate discount
    const originalPrice = SUBSCRIPTION_PRICES[subscriptionType] || 0;
    let discountAmount;

    if (coupon.discount_type === 'percentage') {
      discountAmount = (originalPrice * parseFloat(coupon.discount_value)) / 100;
    } else { // 'fixed'
      discountAmount = parseFloat(coupon.discount_value);
    }

    // Ensure discount doesn't exceed price
    discountAmount = Math.min(discountAmount, originalPrice);
    discountAmount = Math.round(discountAmount * 100) / 100; // Round to 2 decimals

    const finalPrice = Math.max(0, originalPrice - discountAmount);

    return {
      valid: true,
      coupon: {
        id: coupon.coupon_id,
        code: coupon.code,
        name: coupon.name,
        description: coupon.description,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value
      },
      pricing: {
        original_price: originalPrice,
        discount_amount: discountAmount,
        final_price: finalPrice
      }
    };

  } catch (error) {
    console.error('Error validating coupon:', error);
    throw new Error('Failed to validate coupon');
  }
}

/**
 * Get the number of times a user has used a specific coupon
 */
async function getUserCouponUsageCount(couponId, userId) {
  const result = await db.query(
    `SELECT COUNT(*) as count
     FROM coupon_usage
     WHERE coupon_id = $1 AND user_id = $2`,
    [couponId, userId]
  );
  return parseInt(result.rows[0].count);
}

/**
 * Record coupon usage after successful payment
 */
async function recordCouponUsage(couponId, userId, subscriptionType, pricing, stripeData, metadata = {}) {
  try {
    await db.query(
      `INSERT INTO coupon_usage (
        coupon_id, user_id, subscription_type,
        original_price, discount_amount, final_price,
        stripe_subscription_id, stripe_payment_intent_id, stripe_coupon_id,
        ip_address, user_agent, payment_successful
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        couponId,
        userId,
        subscriptionType,
        pricing.original_price,
        pricing.discount_amount,
        pricing.final_price,
        stripeData.subscription_id || null,
        stripeData.payment_intent_id || null,
        stripeData.coupon_id || null,
        metadata.ip_address || null,
        metadata.user_agent || null,
        true
      ]
    );

    return { success: true };
  } catch (error) {
    console.error('Error recording coupon usage:', error);
    throw new Error('Failed to record coupon usage');
  }
}

// =====================================================
// Coupon CRUD Operations
// =====================================================

/**
 * Get all coupons with optional filters
 */
async function getCoupons(filters = {}, pagination = {}) {
  const { page = 1, limit = 50 } = pagination;
  const offset = (page - 1) * limit;

  let whereConditions = [];
  let params = [];
  let paramCount = 1;

  // Build WHERE conditions
  if (filters.search) {
    whereConditions.push(`(UPPER(code) LIKE UPPER($${paramCount}) OR UPPER(name) LIKE UPPER($${paramCount}))`);
    params.push(`%${filters.search}%`);
    paramCount++;
  }

  if (filters.tier) {
    whereConditions.push(`tier = $${paramCount}`);
    params.push(filters.tier);
    paramCount++;
  }

  if (filters.active !== undefined) {
    whereConditions.push(`is_active = $${paramCount}`);
    params.push(filters.active);
    paramCount++;
  }

  if (filters.archived !== undefined) {
    whereConditions.push(`is_archived = $${paramCount}`);
    params.push(filters.archived);
    paramCount++;
  }

  if (filters.user_specific !== undefined) {
    whereConditions.push(`user_specific = $${paramCount}`);
    params.push(filters.user_specific);
    paramCount++;
  }

  const whereClause = whereConditions.length > 0
    ? 'WHERE ' + whereConditions.join(' AND ')
    : '';

  // Get total count
  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM coupons ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total);

  // Get coupons
  const result = await db.query(
    `SELECT c.*, u.username as created_by_username
     FROM coupons c
     LEFT JOIN users u ON c.created_by = u.user_id
     ${whereClause}
     ORDER BY c.created_at DESC
     LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
    [...params, limit, offset]
  );

  return {
    coupons: result.rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

/**
 * Get a single coupon by ID
 */
async function getCouponById(couponId) {
  const result = await db.query(
    `SELECT c.*, u.username as created_by_username
     FROM coupons c
     LEFT JOIN users u ON c.created_by = u.user_id
     WHERE c.coupon_id = $1`,
    [couponId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Create a new coupon
 */
async function createCoupon(couponData, createdBy) {
  const {
    code, name, description, discount_type, discount_value,
    applies_to, max_uses, max_uses_per_user, valid_from, valid_until,
    user_specific, allowed_user_ids, tier
  } = couponData;

  // Validation
  if (!code || !name || !discount_type || !discount_value) {
    throw new Error('Missing required fields');
  }

  if (discount_type === 'percentage' && (discount_value < 0 || discount_value > 100)) {
    throw new Error('Percentage discount must be between 0 and 100');
  }

  if (discount_type === 'fixed' && discount_value < 0) {
    throw new Error('Fixed discount cannot be negative');
  }

  try {
    const result = await db.query(
      `INSERT INTO coupons (
        code, name, description, discount_type, discount_value,
        applies_to, max_uses, max_uses_per_user, valid_from, valid_until,
        user_specific, allowed_user_ids, tier, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        code.toUpperCase(),
        name,
        description || null,
        discount_type,
        discount_value,
        applies_to || 'all',
        max_uses || null,
        max_uses_per_user || 1,
        valid_from || null,
        valid_until || null,
        user_specific || false,
        allowed_user_ids || null,
        tier || null,
        createdBy
      ]
    );

    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') { // Unique constraint violation
      throw new Error('A coupon with this code already exists');
    }
    throw error;
  }
}

/**
 * Update an existing coupon
 */
async function updateCoupon(couponId, couponData) {
  const {
    name, description, discount_type, discount_value,
    applies_to, max_uses, max_uses_per_user, valid_from, valid_until,
    user_specific, allowed_user_ids, tier, is_active
  } = couponData;

  const result = await db.query(
    `UPDATE coupons SET
      name = COALESCE($1, name),
      description = COALESCE($2, description),
      discount_type = COALESCE($3, discount_type),
      discount_value = COALESCE($4, discount_value),
      applies_to = COALESCE($5, applies_to),
      max_uses = $6,
      max_uses_per_user = COALESCE($7, max_uses_per_user),
      valid_from = $8,
      valid_until = $9,
      user_specific = COALESCE($10, user_specific),
      allowed_user_ids = $11,
      tier = $12,
      is_active = COALESCE($13, is_active)
    WHERE coupon_id = $14
    RETURNING *`,
    [
      name, description, discount_type, discount_value,
      applies_to, max_uses, max_uses_per_user, valid_from, valid_until,
      user_specific, allowed_user_ids, tier, is_active, couponId
    ]
  );

  if (result.rows.length === 0) {
    throw new Error('Coupon not found');
  }

  return result.rows[0];
}

/**
 * Archive a coupon (soft delete)
 */
async function archiveCoupon(couponId, archivedBy) {
  const result = await db.query(
    `UPDATE coupons SET
      is_archived = true,
      is_active = false,
      archived_at = CURRENT_TIMESTAMP,
      archived_by = $1
    WHERE coupon_id = $2 AND is_archived = false
    RETURNING *`,
    [archivedBy, couponId]
  );

  if (result.rows.length === 0) {
    throw new Error('Coupon not found or already archived');
  }

  return result.rows[0];
}

/**
 * Restore an archived coupon
 */
async function restoreCoupon(couponId) {
  const result = await db.query(
    `UPDATE coupons SET
      is_archived = false,
      is_active = true,
      archived_at = NULL,
      archived_by = NULL
    WHERE coupon_id = $1 AND is_archived = true
    RETURNING *`,
    [couponId]
  );

  if (result.rows.length === 0) {
    throw new Error('Coupon not found or not archived');
  }

  return result.rows[0];
}

// =====================================================
// Coupon Statistics
// =====================================================

/**
 * Get detailed statistics for a specific coupon
 */
async function getCouponStatistics(couponId) {
  // Basic statistics
  const statsResult = await db.query(
    `SELECT
      COUNT(*) as total_uses,
      SUM(discount_amount) as total_discount_given,
      AVG(discount_amount) as avg_discount,
      MIN(used_at) as first_use,
      MAX(used_at) as last_use,
      COUNT(DISTINCT user_id) as unique_users
    FROM coupon_usage
    WHERE coupon_id = $1`,
    [couponId]
  );

  // Usage timeline (last 30 days)
  const timelineResult = await db.query(
    `SELECT
      DATE(used_at) as date,
      COUNT(*) as uses,
      SUM(discount_amount) as revenue_impact
    FROM coupon_usage
    WHERE coupon_id = $1
    GROUP BY DATE(used_at)
    ORDER BY date DESC
    LIMIT 30`,
    [couponId]
  );

  // Top users
  const topUsersResult = await db.query(
    `SELECT
      u.user_id,
      u.username,
      u.email,
      COUNT(*) as usage_count,
      SUM(cu.discount_amount) as total_discount
    FROM coupon_usage cu
    JOIN users u ON cu.user_id = u.user_id
    WHERE cu.coupon_id = $1
    GROUP BY u.user_id, u.username, u.email
    ORDER BY usage_count DESC
    LIMIT 10`,
    [couponId]
  );

  // Success rate
  const successResult = await db.query(
    `SELECT
      COUNT(*) FILTER (WHERE payment_successful = true) as successful,
      COUNT(*) FILTER (WHERE payment_successful = false) as failed
    FROM coupon_usage
    WHERE coupon_id = $1`,
    [couponId]
  );

  const stats = statsResult.rows[0];
  const success = successResult.rows[0];
  const totalAttempts = parseInt(success.successful) + parseInt(success.failed);
  const conversionRate = totalAttempts > 0
    ? (parseInt(success.successful) / totalAttempts * 100).toFixed(2)
    : 0;

  return {
    summary: {
      total_uses: parseInt(stats.total_uses) || 0,
      total_discount_given: parseFloat(stats.total_discount_given) || 0,
      avg_discount: parseFloat(stats.avg_discount) || 0,
      first_use: stats.first_use,
      last_use: stats.last_use,
      unique_users: parseInt(stats.unique_users) || 0,
      conversion_rate: parseFloat(conversionRate)
    },
    usage_timeline: timelineResult.rows,
    top_users: topUsersResult.rows
  };
}

/**
 * Get overview statistics for all coupons
 */
async function getCouponsOverview() {
  const activeResult = await db.query(
    `SELECT COUNT(*) as count FROM coupons
     WHERE is_active = true AND is_archived = false`
  );

  const usageResult = await db.query(
    `SELECT
      COUNT(*) as total_uses,
      SUM(discount_amount) as total_discount,
      COUNT(DISTINCT coupon_id) as coupons_used
    FROM coupon_usage`
  );

  const topCouponsResult = await db.query(
    `SELECT
      c.coupon_id,
      c.code,
      c.name,
      c.tier,
      COUNT(cu.usage_id) as uses,
      SUM(cu.discount_amount) as total_discount
    FROM coupons c
    LEFT JOIN coupon_usage cu ON c.coupon_id = cu.coupon_id
    WHERE c.is_active = true AND c.is_archived = false
    GROUP BY c.coupon_id, c.code, c.name, c.tier
    ORDER BY uses DESC
    LIMIT 5`
  );

  return {
    active_coupons: parseInt(activeResult.rows[0].count) || 0,
    total_uses: parseInt(usageResult.rows[0].total_uses) || 0,
    total_discount_given: parseFloat(usageResult.rows[0].total_discount) || 0,
    coupons_used: parseInt(usageResult.rows[0].coupons_used) || 0,
    top_coupons: topCouponsResult.rows
  };
}

// =====================================================
// Exports
// =====================================================

module.exports = {
  validateCoupon,
  recordCouponUsage,
  getCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  archiveCoupon,
  restoreCoupon,
  getCouponStatistics,
  getCouponsOverview
};
