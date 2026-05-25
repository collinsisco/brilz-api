-- ============================================================
-- BRILZ 2.0 — Migration 04: Wishlists
-- ============================================================

CREATE TABLE IF NOT EXISTS wishlists (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  -- At least one of product_id or property_id must be set
  CONSTRAINT wishlist_item_check CHECK (
    (product_id IS NOT NULL AND property_id IS NULL) OR
    (product_id IS NULL AND property_id IS NOT NULL)
  ),
  -- No duplicate items per user
  UNIQUE(user_id, product_id),
  UNIQUE(user_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlists_user    ON wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_product ON wishlists(product_id);

ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wishlists_own" ON wishlists FOR ALL USING (auth.uid() = user_id);

SELECT 'Migration 04 complete: wishlists table created' AS status;
