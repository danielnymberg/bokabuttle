-- Admins
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bränningar
CREATE TABLE IF NOT EXISTS branningar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_open BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Pass
CREATE TABLE IF NOT EXISTS brannings_pass (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branning_id INTEGER NOT NULL REFERENCES branningar(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  plats_1 TEXT CHECK(length(plats_1) <= 40),
  plats_2 TEXT CHECK(length(plats_2) <= 40),
  reserv_1 TEXT CHECK(length(reserv_1) <= 40),
  reserv_2 TEXT CHECK(length(reserv_2) <= 40)
);

CREATE INDEX idx_pass_branning ON brannings_pass(branning_id);
