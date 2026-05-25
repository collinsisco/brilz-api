-- ============================================================
-- BRILZ 2.0 — Migration 06: Reviews & Ratings
-- ============================================================

CREATE TABLE IF NOT EXISTS reviews (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       TEXT,
  body        TEXT,
  reviewer_name TEXT,          -- fallback if user not logged in
  is_verified BOOLEAN DEFAULT FALSE,  -- verified purchase
  is_approved BOOLEAN DEFAULT TRUE,   -- admin moderation
  helpful_count INTEGER DEFAULT 0,
  images      TEXT[],
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT review_item_check CHECK (
    (product_id IS NOT NULL AND property_id IS NULL) OR
    (product_id IS NULL AND property_id IS NOT NULL)
  ),
  -- One review per user per product/property
  UNIQUE(user_id, product_id),
  UNIQUE(user_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_product  ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_property ON reviews(property_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user     ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_approved ON reviews(is_approved);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_public_read"  ON reviews FOR SELECT USING (is_approved = TRUE);
CREATE POLICY "reviews_own_insert"   ON reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reviews_own_delete"   ON reviews FOR DELETE USING (auth.uid() = user_id);

-- Auto-update product rating_avg and rating_count after insert/update/delete
CREATE OR REPLACE FUNCTION update_product_rating()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    UPDATE products SET
      rating_avg   = (SELECT ROUND(AVG(rating)::NUMERIC, 2) FROM reviews WHERE product_id = NEW.product_id AND is_approved = TRUE),
      rating_count = (SELECT COUNT(*) FROM reviews WHERE product_id = NEW.product_id AND is_approved = TRUE)
    WHERE id = NEW.product_id;
  END IF;
  IF NEW.property_id IS NOT NULL THEN
    UPDATE properties SET
      rating_avg   = (SELECT ROUND(AVG(rating)::NUMERIC, 2) FROM reviews WHERE property_id = NEW.property_id AND is_approved = TRUE),
      rating_count = (SELECT COUNT(*) FROM reviews WHERE property_id = NEW.property_id AND is_approved = TRUE)
    WHERE id = NEW.property_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_review_rating AFTER INSERT OR UPDATE ON reviews
    FOR EACH ROW EXECUTE FUNCTION update_product_rating();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

SELECT 'Migration 06 complete: reviews table created' AS status;
