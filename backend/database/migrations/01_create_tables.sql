-- ============================================================
-- BRILZ 2.0 — Migration 01: Core Tables
-- Run in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for full-text search

-- ──────────────────────────────────────────
-- USERS
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  phone         TEXT,
  password_hash TEXT,                    -- NULL for Google OAuth users
  role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin','vendor')),
  avatar_url    TEXT,
  address       TEXT,
  city          TEXT DEFAULT 'Nairobi',
  is_active     BOOLEAN DEFAULT TRUE,
  google_id     TEXT UNIQUE,
  push_token    TEXT,                    -- for web push notifications
  loyalty_points INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email  ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone  ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role   ON users(role);

-- ──────────────────────────────────────────
-- CATEGORIES
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  parent_id   UUID REFERENCES categories(id) ON DELETE SET NULL,
  icon        TEXT,
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed core categories
INSERT INTO categories (name, slug, icon, sort_order) VALUES
  ('Fashion',       'fashion',       '👗', 1),
  ('Dresses',       'dresses',       '👗', 2),
  ('Tops',          'tops',          '👚', 3),
  ('Bottoms',       'bottoms',       '👖', 4),
  ('Outerwear',     'outerwear',     '🧥', 5),
  ('Accessories',   'accessories',   '💍', 6),
  ('Shoes',         'shoes',         '👠', 7),
  ('Kids',          'kids',          '🧒', 8),
  ('Farming',       'farming',       '🌱', 9),
  ('Accommodation', 'accommodation', '🏡', 10)
ON CONFLICT (slug) DO NOTHING;

-- ──────────────────────────────────────────
-- PRODUCTS (Fashion + Farming)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  description      TEXT,
  price            NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  original_price   NUMERIC(12,2),
  stock            INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  sku              TEXT UNIQUE,
  category_id      UUID REFERENCES categories(id) ON DELETE SET NULL,
  image_url        TEXT,
  sizes            TEXT[],           -- e.g. ARRAY['XS','S','M','L','XL']
  colors           TEXT[],           -- e.g. ARRAY['Black','White','Red']
  is_new           BOOLEAN DEFAULT FALSE,
  is_hot           BOOLEAN DEFAULT FALSE,
  is_active        BOOLEAN DEFAULT TRUE,
  product_type     TEXT DEFAULT 'fashion' CHECK (product_type IN ('fashion','farming','equipment')),
  weight_kg        NUMERIC(8,2),
  unit             TEXT,             -- for farming: 'kg', 'bunch', 'litre'
  min_order        INTEGER DEFAULT 1,
  vendor_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  rating_avg       NUMERIC(3,2) DEFAULT 0,
  rating_count     INTEGER DEFAULT 0,
  sold_count       INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_category   ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_type       ON products(product_type);
CREATE INDEX IF NOT EXISTS idx_products_active     ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_price      ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm  ON products USING GIN(name gin_trgm_ops);

-- ──────────────────────────────────────────
-- PROPERTIES (Accommodation)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS properties (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           TEXT NOT NULL,
  description    TEXT,
  property_type  TEXT NOT NULL DEFAULT 'apartment' CHECK (property_type IN ('apartment','villa','cottage','studio','house','airbnb')),
  location       TEXT NOT NULL,
  address        TEXT,
  latitude       NUMERIC(10,7),
  longitude      NUMERIC(10,7),
  price_per_night NUMERIC(12,2) NOT NULL CHECK (price_per_night > 0),
  bedrooms       INTEGER DEFAULT 1,
  bathrooms      INTEGER DEFAULT 1,
  max_guests     INTEGER DEFAULT 2,
  amenities      TEXT[],            -- e.g. ARRAY['WiFi','Parking','Pool']
  images         TEXT[],            -- array of image URLs
  image_url      TEXT,              -- primary image
  is_available   BOOLEAN DEFAULT TRUE,
  is_active      BOOLEAN DEFAULT TRUE,
  owner_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  rating_avg     NUMERIC(3,2) DEFAULT 0,
  rating_count   INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_properties_available ON properties(is_available);
CREATE INDEX IF NOT EXISTS idx_properties_location  ON properties(location);
CREATE INDEX IF NOT EXISTS idx_properties_type      ON properties(property_type);
CREATE INDEX IF NOT EXISTS idx_properties_price     ON properties(price_per_night);

-- ──────────────────────────────────────────
-- ORDERS
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  order_type       TEXT NOT NULL DEFAULT 'fashion' CHECK (order_type IN ('fashion','accommodation','farming','mixed')),
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','confirmed','processing','shipped','delivered','cancelled','refunded')),
  total_amount     NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  delivery_fee     NUMERIC(12,2) DEFAULT 500,
  discount_amount  NUMERIC(12,2) DEFAULT 0,
  promo_code       TEXT,
  delivery_address TEXT,
  delivery_city    TEXT,
  customer_name    TEXT,
  customer_email   TEXT,
  customer_phone   TEXT,
  notes            TEXT,
  items            JSONB,           -- snapshot of cart items at order time
  nights           INTEGER,        -- for accommodation orders
  check_in         DATE,
  check_out        DATE,
  property_id      UUID REFERENCES properties(id) ON DELETE SET NULL,
  mpesa_ref        TEXT,
  checkout_request_id TEXT,
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id  ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_type     ON orders(order_type);
CREATE INDEX IF NOT EXISTS idx_orders_created  ON orders(created_at DESC);

-- ──────────────────────────────────────────
-- PAYMENTS
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id              UUID REFERENCES orders(id) ON DELETE CASCADE,
  user_id               UUID REFERENCES users(id) ON DELETE SET NULL,
  amount                NUMERIC(12,2) NOT NULL,
  phone                 TEXT NOT NULL,
  method                TEXT DEFAULT 'mpesa' CHECK (method IN ('mpesa','card','cash')),
  status                TEXT DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','cancelled','refunded')),
  mpesa_receipt         TEXT,
  checkout_request_id   TEXT UNIQUE,
  merchant_request_id   TEXT,
  result_code           INTEGER,
  result_desc           TEXT,
  transaction_date      TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id  ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status    ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_checkout  ON payments(checkout_request_id);

-- ──────────────────────────────────────────
-- BOOKINGS (Accommodation)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id  UUID REFERENCES properties(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  order_id     UUID REFERENCES orders(id) ON DELETE SET NULL,
  check_in     DATE NOT NULL,
  check_out    DATE NOT NULL,
  nights       INTEGER GENERATED ALWAYS AS (check_out - check_in) STORED,
  guests       INTEGER DEFAULT 1,
  total_amount NUMERIC(12,2) NOT NULL,
  status       TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled','completed')),
  guest_name   TEXT,
  guest_phone  TEXT,
  guest_email  TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_dates CHECK (check_out > check_in)
);

CREATE INDEX IF NOT EXISTS idx_bookings_property  ON bookings(property_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id   ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_dates     ON bookings(check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_bookings_status    ON bookings(status);

-- ──────────────────────────────────────────
-- AUTO UPDATE updated_at TRIGGER
-- ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_users_updated     BEFORE UPDATE ON users     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  CREATE TRIGGER trg_products_updated  BEFORE UPDATE ON products  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  CREATE TRIGGER trg_properties_updated BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  CREATE TRIGGER trg_orders_updated    BEFORE UPDATE ON orders    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  CREATE TRIGGER trg_payments_updated  BEFORE UPDATE ON payments  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  CREATE TRIGGER trg_bookings_updated  BEFORE UPDATE ON bookings  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ──────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- ──────────────────────────────────────────
ALTER TABLE users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE products   ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings   ENABLE ROW LEVEL SECURITY;

-- Products: anyone can read active products
CREATE POLICY "products_public_read" ON products FOR SELECT USING (is_active = TRUE);
-- Properties: anyone can read active properties
CREATE POLICY "properties_public_read" ON properties FOR SELECT USING (is_active = TRUE);
-- Orders: users see only their own
CREATE POLICY "orders_own" ON orders FOR ALL USING (auth.uid() = user_id);
-- Payments: users see only their own
CREATE POLICY "payments_own" ON payments FOR ALL USING (auth.uid() = user_id);
-- Users: read own profile only
CREATE POLICY "users_own" ON users FOR ALL USING (auth.uid() = id);
-- Bookings: users see own bookings
CREATE POLICY "bookings_own" ON bookings FOR ALL USING (auth.uid() = user_id);

-- Service role bypasses RLS (used by backend)
-- Backend uses SUPABASE_SERVICE_KEY which bypasses all RLS

SELECT 'Migration 01 complete: core tables created' AS status;
