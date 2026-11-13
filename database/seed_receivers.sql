-- =============================================================================
-- Dynamic Food Clearing House Simulator (AIT-201)
-- Seed Data: receivers — Food Banks & Partner NGOs, Lembah Klang
-- Person 4 — Goal 9 (supports Person 5 OSRM dispatch engine)
-- =============================================================================
-- Realistic food bank / NGO directory for Kuala Lumpur & Selangor.
-- Lat/lng coordinates are real and usable with OSRM routing.
-- Capacity values are illustrative (kg per day).
--
-- Usage: Run AFTER schema.sql in Supabase SQL Editor.
-- =============================================================================

INSERT INTO public.receivers
    (receiver_id, name, type, address, lat, lng,
     capacity, accepted_categories, is_active)
VALUES

-- Kuala Lumpur
('RCV-001',
 'Kechara Soup Kitchen',
 'soup_kitchen',
 'Jalan Pudu, 55100 Kuala Lumpur',
 3.1431, 101.7108,
 300.0,
 ARRAY['Produce','Bakery','Pantry','Dairy','Meat'],
 TRUE),

('RCV-002',
 'The Lost Food Project',
 'food_bank',
 'PJ Trade Centre, Petaling Jaya, Selangor',
 3.1047, 101.6356,
 500.0,
 ARRAY['Produce','Bakery','Pantry','Dairy'],
 TRUE),

('RCV-003',
 'Food Aid Foundation',
 'food_bank',
 'Jalan Wan Kadir, Taman Tun Dr Ismail, 60000 KL',
 3.1538, 101.6303,
 400.0,
 ARRAY['Produce','Pantry','Dairy','Bakery','Meat'],
 TRUE),

('RCV-004',
 'Pertubuhan Kebajikan Al-Hidayah',
 'shelter',
 'Chow Kit, 50350 Kuala Lumpur',
 3.1649, 101.6983,
 150.0,
 ARRAY['Produce','Bakery','Pantry'],
 TRUE),

('RCV-005',
 'MERCY Malaysia Food Bank',
 'food_bank',
 'Jalan Ampang, 50450 Kuala Lumpur',
 3.1545, 101.7212,
 350.0,
 ARRAY['Produce','Dairy','Pantry','Bakery'],
 TRUE),

-- Petaling Jaya / Subang
('RCV-006',
 'Rumah Prihatin PJ',
 'shelter',
 'Jalan 14/1, 46100 Petaling Jaya, Selangor',
 3.1070, 101.6410,
 120.0,
 ARRAY['Produce','Bakery','Pantry'],
 TRUE),

('RCV-007',
 'Dapur Jalanan KL',
 'soup_kitchen',
 'Dataran Merdeka vicinity, 50000 KL',
 3.1468, 101.6939,
 200.0,
 ARRAY['Produce','Bakery','Pantry','Dairy'],
 TRUE),

('RCV-008',
 'Subang Jaya Community Pantry',
 'food_bank',
 'SS15, 47500 Subang Jaya, Selangor',
 3.0774, 101.5906,
 250.0,
 ARRAY['Produce','Pantry','Dairy','Bakery'],
 TRUE),

-- Ampang / Cheras
('RCV-009',
 'Rumah Hope',
 'shelter',
 'Jalan Ampang, 68000 Ampang, Selangor',
 3.1584, 101.7497,
 100.0,
 ARRAY['Produce','Pantry','Bakery'],
 TRUE),

('RCV-010',
 'Cheras Community Food Bank',
 'food_bank',
 'Jalan Cheras, 56000 Cheras, Kuala Lumpur',
 3.0944, 101.7391,
 280.0,
 ARRAY['Produce','Dairy','Pantry','Bakery','Meat'],
 TRUE),

-- Shah Alam / Klang
('RCV-011',
 'Shah Alam Food Bank',
 'food_bank',
 'Seksyen 7, 40150 Shah Alam, Selangor',
 3.0724, 101.5195,
 320.0,
 ARRAY['Produce','Pantry','Dairy','Bakery'],
 TRUE),

('RCV-012',
 'Klang Charity Kitchen',
 'soup_kitchen',
 'Klang Town, 41000 Klang, Selangor',
 3.0449, 101.4453,
 180.0,
 ARRAY['Produce','Bakery','Pantry'],
 TRUE),

('RCV-013',
 'Pusat Zakat Selangor — Agihan Makanan',
 'ngo',
 'Jalan Pudu Lama, 50200 Kuala Lumpur',
 3.1414, 101.7005,
 500.0,
 ARRAY['Produce','Pantry','Dairy','Bakery','Meat'],
 TRUE),

-- Kepong / Rawang
('RCV-014',
 'Kepong Community Fridge',
 'food_bank',
 'Jalan Kepong, 52100 Kuala Lumpur',
 3.2029, 101.6396,
 150.0,
 ARRAY['Produce','Dairy','Bakery'],
 TRUE),

('RCV-015',
 'Yayasan Sejahtera Food Programme',
 'ngo',
 'Bangsar, 59100 Kuala Lumpur',
 3.1245, 101.6712,
 400.0,
 ARRAY['Produce','Pantry','Dairy','Bakery','Meat'],
 TRUE)

ON CONFLICT (receiver_id) DO NOTHING;

