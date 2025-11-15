-- Migration 015: Create Coupon System
-- Description: Add comprehensive coupon/discount code system with usage tracking and analytics

-- =====================================================
-- Table: coupons
-- =====================================================
CREATE TABLE IF NOT EXISTS coupons (
  coupon_id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Discount configuration
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value DECIMAL(10, 2) NOT NULL CHECK (discount_value > 0),

  -- Applicability
  applies_to VARCHAR(20) DEFAULT 'all' CHECK (applies_to IN ('all', 'monthly', 'annual')),

  -- Usage limits
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0), -- NULL means unlimited
  current_uses INTEGER DEFAULT 0 CHECK (current_uses >= 0),
  max_uses_per_user INTEGER DEFAULT 1 CHECK (max_uses_per_user > 0),

  -- Validity period
  valid_from TIMESTAMP,
  valid_until TIMESTAMP,

  -- User restrictions
  user_specific BOOLEAN DEFAULT FALSE,
  allowed_user_ids UUID[], -- Array of user IDs, NULL if not user-specific

  -- Tier/category for organization
  tier VARCHAR(50), -- e.g., 'vip', 'affiliate', 'promotion', 'referral'

  -- Status flags
  is_active BOOLEAN DEFAULT TRUE,
  is_archived BOOLEAN DEFAULT FALSE,

  -- Audit trail
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_at TIMESTAMP,
  archived_by UUID REFERENCES users(user_id),

  -- Constraints
  CONSTRAINT valid_date_range CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_from < valid_until),
  CONSTRAINT valid_percentage CHECK (discount_type != 'percentage' OR discount_value <= 100)
);

-- =====================================================
-- Table: coupon_usage
-- =====================================================
CREATE TABLE IF NOT EXISTS coupon_usage (
  usage_id SERIAL PRIMARY KEY,
  coupon_id INTEGER NOT NULL REFERENCES coupons(coupon_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id),

  -- Order/subscription information
  subscription_type VARCHAR(20) CHECK (subscription_type IN ('trial', 'monthly', 'annual')),
  original_price DECIMAL(10, 2) NOT NULL,
  discount_amount DECIMAL(10, 2) NOT NULL,
  final_price DECIMAL(10, 2) NOT NULL,

  -- Stripe integration
  stripe_subscription_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  stripe_coupon_id VARCHAR(255), -- If using Stripe's coupon system

  -- Usage metadata
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address INET,
  user_agent TEXT,

  -- Success tracking
  payment_successful BOOLEAN DEFAULT TRUE,

  CONSTRAINT valid_prices CHECK (
    original_price >= 0 AND
    discount_amount >= 0 AND
    final_price >= 0 AND
    discount_amount <= original_price AND
    final_price = original_price - discount_amount
  )
);

-- =====================================================
-- Indexes for Performance
-- =====================================================

-- Coupons table indexes
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active, is_archived);
CREATE INDEX IF NOT EXISTS idx_coupons_validity ON coupons(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_coupons_tier ON coupons(tier);
CREATE INDEX IF NOT EXISTS idx_coupons_created_at ON coupons(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupons_user_specific ON coupons(user_specific);

-- Coupon usage table indexes
CREATE INDEX IF NOT EXISTS idx_coupon_usage_coupon ON coupon_usage(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_user ON coupon_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_date ON coupon_usage(used_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_subscription ON coupon_usage(subscription_type);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_successful ON coupon_usage(payment_successful);

-- Composite index for user coupon usage count queries
CREATE INDEX IF NOT EXISTS idx_coupon_usage_user_coupon ON coupon_usage(user_id, coupon_id);

-- =====================================================
-- Trigger: Update coupon usage count
-- =====================================================
CREATE OR REPLACE FUNCTION increment_coupon_usage()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE coupons
  SET current_uses = current_uses + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE coupon_id = NEW.coupon_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_coupon_usage
AFTER INSERT ON coupon_usage
FOR EACH ROW
EXECUTE FUNCTION increment_coupon_usage();

-- =====================================================
-- Trigger: Update updated_at timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_coupons_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_coupons_timestamp
BEFORE UPDATE ON coupons
FOR EACH ROW
EXECUTE FUNCTION update_coupons_updated_at();

-- =====================================================
-- Sample Data (Optional - for testing)
-- =====================================================

-- Note: Sample coupons can be created through the admin interface
-- To create sample data manually, replace NULL with your admin user UUID:
--
-- INSERT INTO coupons (code, name, description, discount_type, discount_value, applies_to, tier, created_by)
-- VALUES (
--   'VIP20',
--   'VIP Member Discount',
--   '20% discount for VIP members',
--   'percentage',
--   20.00,
--   'all',
--   'vip',
--   NULL  -- Replace with admin user UUID
-- ) ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- Verification
-- =====================================================
SELECT 'Migration 015 completed successfully' AS status;

-- Display created tables
SELECT 'coupons' AS table_name, COUNT(*) AS row_count FROM coupons
UNION ALL
SELECT 'coupon_usage' AS table_name, COUNT(*) AS row_count FROM coupon_usage;
