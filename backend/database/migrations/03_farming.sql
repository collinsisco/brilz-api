-- ============================================================
-- BRILZ 2.0 — Migration 03: Farming Categories & Products
-- Run after 01_create_tables.sql
-- ============================================================

-- ──────────────────────────────────────────
-- FARMING CATEGORIES
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS farming_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  icon        TEXT,
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE
);

INSERT INTO farming_categories (name, slug, icon, sort_order) VALUES
  ('Vegetables',  'vegetables',  '🥦', 1),
  ('Fruits',      'fruits',      '🍊', 2),
  ('Grains',      'grains',      '🌾', 3),
  ('Dairy',       'dairy',       '🥛', 4),
  ('Poultry',     'poultry',     '🐔', 5),
  ('Livestock',   'livestock',   '🐄', 6),
  ('Seeds',       'seeds',       '🌱', 7),
  ('Fertilizers', 'fertilizers', '🧪', 8),
  ('Machinery',   'machinery',   '🚜', 9),
  ('Equipment',   'equipment',   '🔧', 10)
ON CONFLICT (slug) DO NOTHING;

-- ──────────────────────────────────────────
-- FARMING PRODUCTS (extends products table)
-- ──────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS farming_category_id UUID REFERENCES farming_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS harvest_date         DATE,
  ADD COLUMN IF NOT EXISTS expiry_date          DATE,
  ADD COLUMN IF NOT EXISTS origin               TEXT,             -- e.g. 'Limuru', 'Meru'
  ADD COLUMN IF NOT EXISTS is_organic           BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_for_hire          BOOLEAN DEFAULT FALSE;  -- for machinery

-- ──────────────────────────────────────────
-- SEED FARMING PRODUCTS
-- ──────────────────────────────────────────
-- First get farming category IDs
DO $$
DECLARE
  v_veg   UUID; v_fruits UUID; v_grains UUID; v_dairy UUID;
  v_poultry UUID; v_seeds UUID; v_fert UUID; v_mach UUID; v_equip UUID;
BEGIN
  SELECT id INTO v_veg    FROM farming_categories WHERE slug='vegetables';
  SELECT id INTO v_fruits FROM farming_categories WHERE slug='fruits';
  SELECT id INTO v_grains FROM farming_categories WHERE slug='grains';
  SELECT id INTO v_dairy  FROM farming_categories WHERE slug='dairy';
  SELECT id INTO v_poultry FROM farming_categories WHERE slug='poultry';
  SELECT id INTO v_seeds  FROM farming_categories WHERE slug='seeds';
  SELECT id INTO v_fert   FROM farming_categories WHERE slug='fertilizers';
  SELECT id INTO v_mach   FROM farming_categories WHERE slug='machinery';
  SELECT id INTO v_equip  FROM farming_categories WHERE slug='equipment';

  INSERT INTO products (name, description, price, stock, product_type, unit, min_order, farming_category_id, origin, is_organic, is_active) VALUES
    -- Vegetables
    ('Fresh Sukuma Wiki',    'Freshly harvested kale from Limuru farms. Rich in vitamins.',          80,   500, 'farming', 'bunch',        5,  v_veg,    'Limuru',  TRUE,  TRUE),
    ('Organic Tomatoes',     'Sun-ripened organic tomatoes from Kirinyaga County.',                 120,   300, 'farming', 'kg',           2,  v_veg,    'Kirinyaga',TRUE, TRUE),
    ('Spinach (Mchicha)',    'Fresh spinach, 500g bunches. Harvested daily.',                        60,   400, 'farming', 'bunch',        3,  v_veg,    'Kiambu',  FALSE, TRUE),
    ('Cabbage',              'Large fresh cabbages from Tigoni.',                                    80,   200, 'farming', 'head',         5,  v_veg,    'Tigoni',  FALSE, TRUE),
    ('Onions',               'Red onions, 1kg. Ideal for cooking and wholesale.',                    90,   600, 'farming', 'kg',          10,  v_veg,    'Karatina',FALSE, TRUE),
    ('Carrots',              'Sweet carrots from Nyandarua County.',                                 70,   350, 'farming', 'kg',           2,  v_veg,    'Nyandarua',FALSE,TRUE),
    -- Fruits
    ('Avocados (Hass)',      'Creamy Hass avocados from Muranga. Ready to eat.',                    200,   150, 'farming', 'tray (24pcs)', 1,  v_fruits, 'Muranga', TRUE,  TRUE),
    ('Passion Fruits',       'Sweet passion fruits from Mt Kenya region.',                          150,   200, 'farming', 'kg',           2,  v_fruits, 'Mt Kenya',FALSE, TRUE),
    ('Bananas (Matoke)',     'Green cooking bananas, 1 bunch approx 10kg.',                         350,   100, 'farming', 'bunch',        1,  v_fruits, 'Kisii',   FALSE, TRUE),
    ('Mangoes (Apple)',      'Juicy Apple mangoes from Coastal Kenya.',                              180,   250, 'farming', 'kg',           2,  v_fruits, 'Kilifi',  FALSE, TRUE),
    -- Grains
    ('Maize (Dry)',          '90kg bag of Grade 1 dry maize. Suitable for posho mills.',          4500,    50, 'farming', '90kg bag',     1,  v_grains, 'Trans Nzoia',FALSE,TRUE),
    ('Wheat Flour',          '50kg bag of premium wheat flour.',                                  3200,    80, 'farming', '50kg bag',     1,  v_grains, 'Njoro',   FALSE, TRUE),
    ('Rice (Pishori)',       'Premium Mwea Pishori rice. 50kg bag.',                             6500,    40, 'farming', '50kg bag',     1,  v_grains, 'Mwea',    FALSE, TRUE),
    ('Beans (Nyayo)',        'Dried Nyayo beans. 90kg bag.',                                      7500,    35, 'farming', '90kg bag',     1,  v_grains, 'Machakos',FALSE, TRUE),
    -- Dairy
    ('Fresh Milk',           'Raw fresh milk delivered daily from Kiambu dairy farms.',              60,   999, 'farming', 'litre',       10,  v_dairy,  'Kiambu',  FALSE, TRUE),
    ('Yoghurt (Plain)',      'Natural yoghurt from grass-fed cows. No additives.',                 180,   200, 'farming', 'litre',        2,  v_dairy,  'Kiambu',  TRUE,  TRUE),
    ('Butter',               'Creamy farm butter, 500g.',                                          350,   100, 'farming', '500g',         2,  v_dairy,  'Naivasha', FALSE,TRUE),
    -- Poultry
    ('Free Range Eggs',      'Organic free-range eggs from healthy hens.',                         550,   300, 'farming', 'tray (30)',    2,  v_poultry,'Thika',   TRUE,  TRUE),
    ('Live Chicken (Kienyeji)','Indigenous kienyeji chicken, approx 2kg live weight.',           1200,    80, 'farming', 'bird',         1,  v_poultry,'Kiambu',  FALSE, TRUE),
    ('Dressed Chicken',      'Ready-to-cook dressed chicken, 1.5–2kg.',                           950,   100, 'farming', 'kg',           2,  v_poultry,'Thika',   FALSE, TRUE),
    -- Seeds
    ('Hybrid Maize Seeds',   'Certified DK8031 hybrid maize seeds. 10kg bag.',                  2800,    60, 'farming', '10kg bag',     1,  v_seeds,  'Kenya',   FALSE, TRUE),
    ('Tomato Seedlings',     'F1 hybrid tomato seedlings, 50-tray.',                             1500,    40, 'farming', 'tray (50)',    1,  v_seeds,  'Kenya',   FALSE, TRUE),
    -- Fertilizers
    ('CAN Fertilizer',       'Calcium Ammonium Nitrate 50kg. Top dressing.',                     4200,    50, 'farming', '50kg bag',     1,  v_fert,   'Kenya',   FALSE, TRUE),
    ('DAP Fertilizer',       'Di-Ammonium Phosphate 50kg. Basal application.',                   5500,    45, 'farming', '50kg bag',     1,  v_fert,   'Kenya',   FALSE, TRUE),
    -- Machinery (for hire)
    ('Tractor (Per Day)',    'Modern tractor with driver. Ploughing, harrowing, planting.',     15000,     5, 'equipment','day',          1,  v_mach,   'Nairobi', FALSE, TRUE),
    ('Maize Sheller',        'Electric maize sheller, 2-tonne/day capacity. Available for hire.',8000,    3, 'equipment','day',          1,  v_equip,  'Nairobi', FALSE, TRUE),
    ('Sprayer (Boom)',        'Boom sprayer for large-scale pesticide application.',              5000,     4, 'equipment','day',          1,  v_equip,  'Nairobi', FALSE, TRUE)
  ON CONFLICT DO NOTHING;
END $$;

SELECT COUNT(*) AS farming_products_seeded FROM products WHERE product_type IN ('farming','equipment');
