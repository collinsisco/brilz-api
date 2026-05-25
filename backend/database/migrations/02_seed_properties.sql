-- ============================================================
-- BRILZ 2.0 — Migration 02: Seed Properties (Accommodation)
-- Run after 01_create_tables.sql
-- ============================================================

INSERT INTO properties (name, description, property_type, location, address, price_per_night, bedrooms, bathrooms, max_guests, amenities, image_url, is_available) VALUES

('Luxury Westlands Apartment',
 'Stunning 2-bedroom apartment in the heart of Westlands with panoramic city views. Fully furnished with modern finishes, high-speed WiFi and secure underground parking.',
 'apartment', 'Westlands, Nairobi', 'Westlands Road, Nairobi', 4500, 2, 2, 4,
 ARRAY['WiFi','Parking','Air Conditioning','Smart TV','Washing Machine','24hr Security','Elevator','City View'],
 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800', TRUE),

('Karen Garden Villa',
 'Spacious 4-bedroom villa with a private pool and lush garden in the leafy Karen suburb. Perfect for families and groups. Chef available on request.',
 'villa', 'Karen, Nairobi', 'Karen Road, Karen', 12000, 4, 3, 8,
 ARRAY['WiFi','Parking','Pool','Garden','BBQ','Chef on request','24hr Security','Pet Friendly'],
 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800', TRUE),

('Kilimani Studio Suite',
 'Chic and modern studio suite ideal for solo travellers and couples. Walking distance to Yaya Centre, restaurants and nightlife.',
 'studio', 'Kilimani, Nairobi', 'Argwings Kodhek Rd, Kilimani', 2800, 1, 1, 2,
 ARRAY['WiFi','Air Conditioning','Smart TV','Kitchenette','Gym Access','Rooftop'],
 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800', TRUE),

('Runda Luxury Cottage',
 'Private 3-bedroom cottage in the prestigious Runda estate. Surrounded by nature with a wraparound veranda, fireplace and private driveway.',
 'cottage', 'Runda, Nairobi', 'Runda Estate, Nairobi', 8500, 3, 2, 6,
 ARRAY['WiFi','Parking','Fireplace','Garden','BBQ','24hr Security','Housekeeping'],
 'https://images.unsplash.com/photo-1449844908441-8829872d2607?w=800', TRUE),

('Lavington Family Home',
 'Beautiful 5-bedroom family home with a large garden, children''s play area and double garage. Close to international schools.',
 'house', 'Lavington, Nairobi', 'James Gichuru Rd, Lavington', 15000, 5, 3, 10,
 ARRAY['WiFi','Parking','Garden','Play Area','Gym','24hr Security','Housekeeping','Pet Friendly'],
 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800', TRUE),

('Kiambu Road Airbnb',
 'Cosy 2-bedroom apartment perfect for weekend getaways. Quiet neighbourhood, 20 minutes from the CBD.',
 'airbnb', 'Kiambu Road, Nairobi', 'Kiambu Road, Nairobi', 3200, 2, 1, 4,
 ARRAY['WiFi','Parking','Kitchen','Smart TV'],
 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800', TRUE),

('Riverside Drive Penthouse',
 'Executive penthouse on the 18th floor with unobstructed Nairobi skyline views. Perfect for corporate stays.',
 'apartment', 'Westlands, Nairobi', 'Riverside Drive, Westlands', 18000, 3, 3, 6,
 ARRAY['WiFi','Parking','Pool','Gym','Concierge','City View','Air Conditioning','Smart TV'],
 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800', TRUE),

('Ngong Hills Retreat',
 'Peaceful 3-bedroom retreat in the Ngong Hills with fresh air and stunning views. Ideal for a nature escape.',
 'cottage', 'Ngong, Kajiado', 'Ngong Hills, Kajiado', 5500, 3, 2, 6,
 ARRAY['WiFi','Parking','Garden','Fireplace','Hiking Trails','BBQ'],
 'https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=800', TRUE)

ON CONFLICT DO NOTHING;

SELECT COUNT(*) AS properties_seeded FROM properties;
