-- =========================================================
-- HR Summit 2026 Registration Portal — PostgreSQL / Supabase Schema
-- =========================================================

-- Enable trigram extension for high-performance fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Table: hr_guests
CREATE TABLE IF NOT EXISTS hr_guests (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    designation VARCHAR(255),
    company_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    mobile_number VARCHAR(50),
    address TEXT,
    role VARCHAR(100) DEFAULT 'Delegate',
    attendance_dates VARCHAR(100) DEFAULT '22 Aug 2026',
    invited_by VARCHAR(255) DEFAULT 'MIT Summit Team',
    status VARCHAR(50) DEFAULT 'Registered',
    remarks TEXT,
    is_walk_in BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: check_ins
CREATE TABLE IF NOT EXISTS check_ins (
    id SERIAL PRIMARY KEY,
    hr_guest_id INT NOT NULL REFERENCES hr_guests(id) ON DELETE CASCADE,
    hr_name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    designation VARCHAR(255),
    check_in_date VARCHAR(50) NOT NULL,
    check_in_time VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    operator VARCHAR(255) DEFAULT 'Desk Operator'
);

-- Table: check_outs
CREATE TABLE IF NOT EXISTS check_outs (
    id SERIAL PRIMARY KEY,
    hr_guest_id INT NOT NULL REFERENCES hr_guests(id) ON DELETE CASCADE,
    hr_name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    designation VARCHAR(255),
    check_out_date VARCHAR(50) NOT NULL,
    check_out_time VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    operator VARCHAR(255) DEFAULT 'Desk Operator'
);

-- Trigram Indexes for Fuzzy & Fast Search across Name, Company, Email, Mobile
CREATE INDEX IF NOT EXISTS idx_hr_guests_name_trgm ON hr_guests USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hr_guests_company_trgm ON hr_guests USING gin (company_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hr_guests_email ON hr_guests(email);
CREATE INDEX IF NOT EXISTS idx_hr_guests_mobile ON hr_guests(mobile_number);
CREATE INDEX IF NOT EXISTS idx_check_ins_hr_guest_id ON check_ins(hr_guest_id);
CREATE INDEX IF NOT EXISTS idx_check_outs_hr_guest_id ON check_outs(hr_guest_id);

-- =========================================================
-- Row Level Security (RLS) Policies (RLS Remains ENABLED)
-- =========================================================

ALTER TABLE hr_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_outs ENABLE ROW LEVEL SECURITY;

-- Grant permissions to anon, authenticated, and service_role
GRANT ALL ON TABLE hr_guests TO anon, authenticated, service_role;
GRANT ALL ON TABLE check_ins TO anon, authenticated, service_role;
GRANT ALL ON TABLE check_outs TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Policies for hr_guests
DROP POLICY IF EXISTS "Allow anon read hr_guests" ON hr_guests;
CREATE POLICY "Allow anon read hr_guests" ON hr_guests FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow anon insert hr_guests" ON hr_guests;
CREATE POLICY "Allow anon insert hr_guests" ON hr_guests FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update hr_guests" ON hr_guests;
CREATE POLICY "Allow anon update hr_guests" ON hr_guests FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon delete hr_guests" ON hr_guests;
CREATE POLICY "Allow anon delete hr_guests" ON hr_guests FOR DELETE TO anon, authenticated USING (true);

-- Policies for check_ins
DROP POLICY IF EXISTS "Allow anon read check_ins" ON check_ins;
CREATE POLICY "Allow anon read check_ins" ON check_ins FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow anon insert check_ins" ON check_ins;
CREATE POLICY "Allow anon insert check_ins" ON check_ins FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update check_ins" ON check_ins;
CREATE POLICY "Allow anon update check_ins" ON check_ins FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon delete check_ins" ON check_ins;
CREATE POLICY "Allow anon delete check_ins" ON check_ins FOR DELETE TO anon, authenticated USING (true);

-- Policies for check_outs
DROP POLICY IF EXISTS "Allow anon read check_outs" ON check_outs;
CREATE POLICY "Allow anon read check_outs" ON check_outs FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow anon insert check_outs" ON check_outs;
CREATE POLICY "Allow anon insert check_outs" ON check_outs FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update check_outs" ON check_outs;
CREATE POLICY "Allow anon update check_outs" ON check_outs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon delete check_outs" ON check_outs;
CREATE POLICY "Allow anon delete check_outs" ON check_outs FOR DELETE TO anon, authenticated USING (true);

