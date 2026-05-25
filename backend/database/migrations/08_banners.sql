-- ============================================================
-- BRILZ 2.0 — Migration 08: Homepage Banners/Slider
-- ============================================================
CREATE TABLE IF NOT EXISTS banners (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT NOT NULL,
  subtitle    TEXT,
  image_url   TEXT,
  cta_label   TEXT DEFAULT 'Shop Now',
  cta_url     TEXT DEFAULT '/categories.html',
  bg_color    TEXT DEFAULT '#0A0705',
  text_color  TEXT DEFAULT '#F5F0E8',
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  starts_at   TIMESTAMPTZ,
  ends_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "banners_public_read" ON banners FOR SELECT USING (is_active = TRUE);

INSERT INTO banners (title, subtitle, cta_label, cta_url, bg_color, sort_order) VALUES
  ('New Fashion Collection', 'Summer 2026 — Shop Women, Men & Kids', 'Shop Fashion', '/categories.html?cat=fashion', 'linear-gradient(135deg,#0A0705,#2A1A08)', 1),
  ('Book a Stay in Nairobi', 'Fully furnished stays in Westlands, Kilimani & Kiambu', 'View Stays', '/accommodation.html', 'linear-gradient(135deg,#0A1628,#1A3060)', 2),
  ('Fresh Farm Produce', 'Delivered to your door — order before noon for same-day', 'Shop Farming', '/farming.html', 'linear-gradient(135deg,#061208,#0D2B10)', 3)
ON CONFLICT DO NOTHING;

SELECT 'Migration 08 complete: banners table created' AS status;
