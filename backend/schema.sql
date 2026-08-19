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

-- Trigram Indexes for Fuzzy & Fast Search across Name, Company, Email, Mobile
CREATE INDEX IF NOT EXISTS idx_hr_guests_name_trgm ON hr_guests USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hr_guests_company_trgm ON hr_guests USING gin (company_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hr_guests_email ON hr_guests(email);
CREATE INDEX IF NOT EXISTS idx_hr_guests_mobile ON hr_guests(mobile_number);
CREATE INDEX IF NOT EXISTS idx_check_ins_hr_guest_id ON check_ins(hr_guest_id);
