-- ============================================================
-- BRILZ 2.0 — Migration 05: Product Images (multiple per product)
-- ============================================================

CREATE TABLE IF NOT EXISTS product_images (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  alt_text    TEXT,
  sort_order  INTEGER DEFAULT 0,
  is_primary  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);

-- Ensure only one primary image per product
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_primary
  ON product_images(product_id)
  WHERE is_primary = TRUE;

ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_images_public_read" ON product_images FOR SELECT USING (TRUE);

-- Helper view: product with all images
CREATE OR REPLACE VIEW products_with_images AS
SELECT
  p.*,
  COALESCE(
    json_agg(
      json_build_object(
        'id', pi.id,
        'url', pi.url,
        'alt_text', pi.alt_text,
        'sort_order', pi.sort_order,
        'is_primary', pi.is_primary
      ) ORDER BY pi.sort_order
    ) FILTER (WHERE pi.id IS NOT NULL),
    '[]'::json
  ) AS images
FROM products p
LEFT JOIN product_images pi ON pi.product_id = p.id
GROUP BY p.id;

SELECT 'Migration 05 complete: product_images table created' AS status;
