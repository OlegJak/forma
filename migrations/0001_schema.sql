CREATE TABLE companies (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
 name TEXT NOT NULL, category TEXT NOT NULL, city TEXT NOT NULL,
 description TEXT NOT NULL, address TEXT NOT NULL,
 opens INTEGER NOT NULL, closes INTEGER NOT NULL, weekdays TEXT NOT NULL,
 demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX companies_owner ON companies(owner_id);
CREATE TABLE services (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id),
 name TEXT NOT NULL, description TEXT NOT NULL, duration INTEGER NOT NULL,
 price INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE staff (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id),
 name TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE bookings (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id),
 service_id TEXT NOT NULL REFERENCES services(id), staff_id TEXT NOT NULL REFERENCES staff(id),
 booking_date TEXT NOT NULL, start_minute INTEGER NOT NULL, duration INTEGER NOT NULL, price INTEGER NOT NULL,
 customer_name TEXT NOT NULL, phone TEXT NOT NULL, user_id TEXT,
 status TEXT NOT NULL DEFAULT 'confirmed', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX bookings_schedule ON bookings(company_id, staff_id, booking_date, status);
CREATE INDEX bookings_user ON bookings(user_id);
-- Session tokens are stored only as SHA-256 hashes.
CREATE TABLE sessions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE rate_limits (
 key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL
);
