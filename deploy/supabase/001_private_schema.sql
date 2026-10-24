-- Applied to the dedicated FORMA Supabase project. Backend-only schema.
CREATE SCHEMA IF NOT EXISTS forma;
CREATE TABLE IF NOT EXISTS forma.companies (
 id VARCHAR(80) PRIMARY KEY, owner_id VARCHAR(255) NOT NULL, slug VARCHAR(80) UNIQUE NOT NULL,
 name VARCHAR(100) NOT NULL, category VARCHAR(40) NOT NULL, city VARCHAR(80) NOT NULL,
 description VARCHAR(1000) NOT NULL, address VARCHAR(200) NOT NULL,
 opens INTEGER NOT NULL, closes INTEGER NOT NULL, weekdays VARCHAR(20) NOT NULL,
 demo BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS forma.services (
 id VARCHAR(80) PRIMARY KEY, company_id VARCHAR(80) NOT NULL REFERENCES forma.companies(id),
 name VARCHAR(100) NOT NULL, description VARCHAR(300) NOT NULL, duration INTEGER NOT NULL,
 price INTEGER NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS forma.staff (
 id VARCHAR(80) PRIMARY KEY, company_id VARCHAR(80) NOT NULL REFERENCES forma.companies(id),
 name VARCHAR(80) NOT NULL, role VARCHAR(80) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS forma.bookings (
 id VARCHAR(80) PRIMARY KEY, company_id VARCHAR(80) NOT NULL REFERENCES forma.companies(id),
 service_id VARCHAR(80) NOT NULL REFERENCES forma.services(id), staff_id VARCHAR(80) NOT NULL REFERENCES forma.staff(id),
 booking_date DATE NOT NULL, start_minute INTEGER NOT NULL, duration INTEGER NOT NULL, price INTEGER NOT NULL,
 customer_name VARCHAR(80) NOT NULL, phone VARCHAR(25) NOT NULL, user_id VARCHAR(255),
 status VARCHAR(20) NOT NULL DEFAULT 'confirmed', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS bookings_schedule ON forma.bookings(company_id,staff_id,booking_date,status);
CREATE TABLE IF NOT EXISTS forma.migrations (id VARCHAR(80) PRIMARY KEY);

REVOKE ALL ON SCHEMA forma FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA forma FROM anon, authenticated;
