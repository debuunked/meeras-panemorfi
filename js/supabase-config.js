// ============================================================
// MEERAS PANEMORFI - SUPABASE CONFIGURATION
// Replace these values with your actual Supabase project credentials
// ============================================================

const SUPABASE_URL = 'https://uacomiyljswtsjzznlxp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhY29taXlsanN3dHNqenpubHhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTA0NjQsImV4cCI6MjA4ODk4NjQ2NH0.ylcfPFEncznnbtqmNWxO_PJGcvsN2APNuimyXS6jy5s';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// DATABASE SCHEMA - Run this SQL in your Supabase SQL Editor
// ============================================================
/*
-- PRODUCTS / INVENTORY TABLE
CREATE TABLE products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  sku TEXT UNIQUE,
  unit TEXT DEFAULT 'pcs',
  quantity INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 5,
  cost_price NUMERIC(10,2) DEFAULT 0,
  selling_price NUMERIC(10,2) DEFAULT 0,
  supplier TEXT,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SERVICES TABLE
CREATE TABLE services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER DEFAULT 60,
  price NUMERIC(10,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- STOCK TRANSACTIONS TABLE
CREATE TABLE stock_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('in', 'out', 'adjustment')),
  quantity INTEGER NOT NULL,
  notes TEXT,
  reference TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- APPOINTMENTS TABLE
CREATE TABLE appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL,
  client_phone TEXT,
  service_id UUID REFERENCES services(id),
  service_name TEXT,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled')),
  notes TEXT,
  amount NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SALES TABLE
CREATE TABLE sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID REFERENCES appointments(id),
  client_name TEXT NOT NULL,
  items JSONB DEFAULT '[]',
  subtotal NUMERIC(10,2) DEFAULT 0,
  discount NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  status TEXT DEFAULT 'completed',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SUPPLIERS TABLE
CREATE TABLE suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- STAFF TABLE
CREATE TABLE staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  email TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SEED DEFAULT SERVICES from price list
INSERT INTO services (name, category, price) VALUES
  ('Underarm Waxing', 'Waxing', 250),
  ('Half Leg Waxing', 'Waxing', 350),
  ('Full Leg Waxing', 'Waxing', 600),
  ('Bikini Waxing', 'Waxing', 400),
  ('Brazilian Waxing', 'Waxing', 800),
  ('Eyebrow Threading', 'Threading', 150),
  ('Upper Lips Threading', 'Threading', 150),
  ('Lower Lips Threading', 'Threading', 150),
  ('Eyebrow Tinting', 'Tinting', 150),
  ('Eyelash Tinting', 'Tinting', 150),
  ('Basic Facial', 'Facial', 400),
  ('Diamond Peel', 'Facial', 500),
  ('Glycopeel Facial', 'Facial', 800),
  ('Hydra Glow Facial', 'Facial', 1000),
  ('Black Crystal Carbon Peel', 'Facial', 1000),
  ('Anti Aging Facial', 'Facial', 1000),
  ('Korean BB Glow', 'Facial', 1000),
  ('Korean BB Slim', 'Facial', 1500),
  ('Korean Black Pearl', 'Facial', 1800),
  ('RF Face Tightening', 'Face Tightening', 500),
  ('RF Eye Bag Removal', 'Face Tightening', 300),
  ('Meso Acne', 'Meso Treatments', 1500),
  ('Meso Scar', 'Meso Treatments', 1500),
  ('Meso White', 'Meso Treatments', 1500),
  ('Exilis Whole Face', 'Exilis Treatments', 2000),
  ('Exilis Eye Bag', 'Exilis Treatments', 500),
  ('Exilis Cheeks', 'Exilis Treatments', 800),
  ('Exilis Double Chin', 'Exilis Treatments', 1000),
  ('Exilis Arms', 'Exilis Treatments', 1500),
  ('Exilis Legs', 'Exilis Treatments', 1500),
  ('Exilis Tummy', 'Exilis Treatments', 2000);
*/

export { supabase, SUPABASE_URL, SUPABASE_ANON_KEY };
